import type * as Discord from 'discord.js'
import type { DefaultConfigs } from '../types/plugins'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

/**
 * Fetches the ticket counter for a guild.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<number>} The ticket counter.
 */
async function getTicketCounter(
	bot_id: string,
	guild_id: string
): Promise<number> {
	const { data, error } = await supabase
		.from('plugins')
		.select('config')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('plugin_name', 'tickets')
		.single()

	if (error) throw error
	return (data?.config as DefaultConfigs['tickets'])?.counter || 0
}

/**
 * Increments the ticket counter for a guild.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<void>}
 */
async function incrementTicketCounter(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id']
): Promise<void> {
	// Try to increment the ticket counter
	const { data, error } = await supabase.rpc('increment_ticket_counter', {
		p_bot_id: bot_id,
		p_guild_id: guild_id,
	})

	// Check if there is an error incrementing the ticket counter
	if (error) throw error
}

/**
 * Saves the transcript to Supabase.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.ThreadChannel['id']} thread_id - The ID of the thread.
 * @param {Object} transcript - The transcript data.
 * @param {Object} metadata - Additional metadata for the ticket.
 * @returns {Promise<void>}
 */
async function saveTranscriptToSupabase(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	thread_id: Discord.ThreadChannel['id'],
	transcript: object[], // Array of messages
	metadata: object
): Promise<void> {
	try {
		// Try to insert the transcript into the database
		const { error } = await supabase.from('tickets').insert({
			bot_id,
			guild_id,
			thread_id,
			messages: transcript,
			metadata,
		})

		// Check if there is an error inserting the transcript
		if (error) throw error

		// Log the success
		bunnyLog.database(`Transcript for thread ${thread_id} saved successfully.`)
	} catch (error) {
		// Log the error
		bunnyLog.error('Error saving transcript:', error)
		throw error
	}
}

/**
 * Fetches all messages from a ticket thread.
 * @param {Discord.PrivateThreadChannel} thread - The ticket thread object.
 * @returns {Promise<Discord.Message[]>} An array of messages.
 */
async function fetchTicketMessages(
	thread: Discord.PrivateThreadChannel
): Promise<Discord.Message[]> {
	// Try to fetch the messages from the thread
	let messages: Discord.Message[] = []

	// Try to fetch the last message ID
	let last_message_id: string | null = null

	// Fetch the messages from the thread
	while (true) {
		// Fetch the messages from the thread
		const fetched_messages = await thread.messages.fetch({
			limit: 100,
			...(last_message_id && { before: last_message_id }),
		})

		// Check if there are no messages fetched
		if (fetched_messages.size === 0) {
			break
		}

		// Add the fetched messages to the messages array
		messages = messages.concat(Array.from(fetched_messages.values()))

		// Set the last message ID
		last_message_id = fetched_messages.last()?.id || null
	}

	// Return the messages in chronological order
	return messages.reverse()
}

/**
 * Formats messages into a structured transcript.
 * @param {Discord.Message[]} messages - An array of messages.
 * @returns {Array<Object>} An array of formatted messages.
 */
function formatTranscript(messages: Discord.Message[]): Array<object> {
	// Filter out messages from bots
	return messages
		.filter((message) => !message.author.bot)
		.map((message) => {
			// Prepare the attachments field
			const attachments =
				message.attachments.size > 0
					? Array.from(message.attachments.values()).map(
							(attachment: Discord.Attachment) => ({
								url: attachment.url,
								proxyURL: attachment.proxyURL,
								name: attachment.name,
								size: attachment.size,
							})
						)
					: null

			// Prepare the stickers field
			const stickers =
				message.stickers.size > 0
					? Array.from(message.stickers.values()).map(
							(sticker: Discord.Sticker) => ({
								id: sticker.id,
								name: sticker.name,
								format: sticker.format, // e.g., PNG, APNG, LOTTIE
							})
						)
					: null

			// Prepare the embeds field
			const embeds =
				message.embeds.length > 0
					? message.embeds.map((embed: Discord.Embed) => ({
							title: embed.title,
							description: embed.description,
							url: embed.url,
							fields: embed.fields.map((field: Discord.APIEmbedField) => ({
								name: field.name,
								value: field.value,
								inline: field.inline ?? false,
							})),
						}))
					: null

			// Return the structured object
			return {
				attachments,
				stickers,
				author: {
					avatar: message.author.displayAvatarURL(),
					id: message.author.id,
					username: message.author.username,
				},
				content: message.content || null,
				id: message.id,
				timestamp: message.createdTimestamp,
			}
		})
}

export {
	saveTranscriptToSupabase,
	fetchTicketMessages,
	formatTranscript,
	getTicketCounter,
	incrementTicketCounter,
}
