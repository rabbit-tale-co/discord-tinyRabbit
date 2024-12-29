import type * as Discord from 'discord.js'
import type { DefaultConfigs } from '../types/plugins'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

/**
 * Fetches the ticket counter for a guild.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<number>} The ticket counter.
 */
async function getTicketCounter(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id']
): Promise<number> {
	const { data, error } = await supabase
		.from('plugins')
		.select('config')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('plugin_name', 'tickets')
		.single()

	if (error) throw error

	const ticketConfig = data.config as DefaultConfigs['tickets']
	return ticketConfig.counter
}

/**
 * Increments the ticket counter for a guild.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<void>}
 */
async function incrementTicketCounter(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id']
): Promise<void> {
	const { data, error } = await supabase.rpc('increment_ticket_counter', {
		p_bot_id: bot_id,
		p_guild_id: guild_id,
	})

	if (error) throw error
}

/**
 * Saves the transcript to Supabase.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @param {ThreadChannel['id']} thread_id - The ID of the thread.
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
		const { error } = await supabase.from('tickets').insert({
			bot_id,
			guild_id,
			thread_id,
			messages: transcript,
			metadata,
		})

		if (error) throw error

		bunnyLog.database(`Transcript for thread ${thread_id} saved successfully.`)
	} catch (error) {
		bunnyLog.error('Error saving transcript:', error)
		throw error
	}
}

/**
 * Fetches all messages from a ticket thread.
 * @param {PrivateThreadChannel} thread - The ticket thread object.
 * @returns {Promise<Message[]>} An array of messages.
 */
async function fetchTicketMessages(
	thread: Discord.PrivateThreadChannel
): Promise<Discord.Message[]> {
	let messages: Discord.Message[] = []

	let last_message_id: string | null = null

	while (true) {
		const fetched_messages = await thread.messages.fetch({
			limit: 100,
			...(last_message_id && { before: last_message_id }),
		})

		if (fetched_messages.size === 0) {
			break
		}

		messages = messages.concat(Array.from(fetched_messages.values()))
		last_message_id = fetched_messages.last()?.id || null
	}

	return messages.reverse() // To get messages in chronological order
}

/**
 * Formats messages into a structured transcript.
 * @param {Message[]} messages - An array of messages.
 * @returns {Array<Object>} An array of formatted messages.
 */
function formatTranscript(messages: Discord.Message[]): Array<object> {
	return messages
		.filter((message) => !message.author.bot) // Exclude messages from bots
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
							fields: embed.fields.map((field: Discord.EmbedField) => ({
								name: field.name,
								value: field.value,
								inline: field.inline,
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
