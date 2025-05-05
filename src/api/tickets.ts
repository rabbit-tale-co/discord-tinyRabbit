import type * as Discord from 'discord.js'
import type { DefaultConfigs } from '@/types/plugins.js'
import { bunnyLog } from 'bunny-log'
import supabase from '@/db/supabase.js'
import type { ThreadMetadata } from '@/types/tickets.js'

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
		// Use upsert instead of insert to handle duplicate key violation
		const { error } = await supabase.from('tickets').upsert({
			bot_id,
			guild_id,
			thread_id,
			messages: transcript,
			metadata,
		})
		if (error) throw error
	} catch (error) {
		bunnyLog.error('Error saving transcript to database:', error)
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

/**
 * Saves the ticket metadata to the database.
 * @param {string} bot_id - The bot's user ID.
 * @param {string} guild_id - The guild ID.
 * @param {string} thread_id - The ticket thread's ID.
 * @param {object} ticketData - The ticket metadata.
 * @param {object[]} messages - An array of messages.
 * @returns {Promise<void>}
 */
async function saveTicketMetadata(
	bot_id: string,
	guild_id: string,
	thread_id: string,
	ticketData: ThreadMetadata,
	messages: object[]
): Promise<void> {
	try {
		// Ensure the metadata has essential fields
		if (!ticketData.open_time) {
			ticketData.open_time = Math.floor(Date.now() / 1000)
		}

		// Add guild_id to ticket metadata for easier retrieval later
		const metadataWithGuildId = {
			...ticketData,
			guild_id: guild_id,
		}

		// console.log("Saving ticket metadata:", {
		// 	thread_id,
		// 	ticket_id: ticketData.ticket_id,
		// 	open_time: ticketData.open_time,
		// 	user_id: ticketData.opened_by?.id,
		// });

		const { data, error } = await supabase.from('tickets').insert({
			bot_id,
			guild_id,
			thread_id,
			metadata: metadataWithGuildId,
			messages,
		})
		if (error) throw error
	} catch (error) {
		bunnyLog.error('Failed to save ticket metadata:', error)
		throw error
	}
}

/**
 * Retrieves ticket metadata for a given thread from the database.
 * @param {string} bot_id - The bot's user ID.
 * @param {string} guild_id - The guild's ID.
 * @param {string} thread_id - The ticket thread's ID.
 * @returns {Promise<ThreadMetadata | null>} The ticket metadata or null if not found.
 */
async function getTicketMetadata(
	bot_id: string,
	guild_id: string,
	thread_id: string
): Promise<ThreadMetadata | null> {
	const { data, error } = await supabase
		.from('tickets')
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('thread_id', thread_id)
		.single()
	if (error || !data) {
		// Don't log "no rows" as an error
		if (error?.code !== 'PGRST116') {
			bunnyLog.error('Failed to retrieve ticket metadata:', error)
		}
		return null
	}
	return data.metadata as ThreadMetadata
}

/**
 * Updates the ticket metadata in the database.
 * @param {string} bot_id - The bot's user ID.
 * @param {string} guild_id - The guild ID.
 * @param {string} thread_id - The ticket thread's ID.
 * @param {ThreadMetadata} metadata - The new ticket metadata.
 * @returns {Promise<void>}
 */
async function updateTicketMetadata(
	bot_id: string,
	guild_id: string,
	thread_id: string,
	metadata: ThreadMetadata
): Promise<void> {
	try {
		const { error } = await supabase
			.from('tickets')
			.update({ metadata }) // update the JSONB metadata field
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('thread_id', thread_id)
		if (error) throw error
	} catch (error) {
		bunnyLog.error('Error updating ticket metadata:', error)
		throw error
	}
}

/**
 * Updates the ticket with a rating from the user.
 * @param {string} bot_id - The bot's user ID.
 * @param {string} thread_id - The ticket thread's ID.
 * @param {number} rating - The rating (1-5) given by the user.
 * @param {string} review_message_id - The ID of the review message.
 * @returns {Promise<void>}
 */
async function updateTicketRating(
	bot_id: string,
	thread_id: string,
	rating: number,
	review_message_id?: string
): Promise<void> {
	try {
		// First get the existing ticket
		const { data, error } = await supabase
			.from('tickets')
			.select('metadata, guild_id')
			.eq('bot_id', bot_id)
			.eq('thread_id', thread_id)
			.single()

		if (error) throw error
		if (!data) throw new Error('Ticket not found')

		const { metadata, guild_id } = data

		// Add rating to metadata
		const updatedMetadata = {
			...metadata,
			rating: {
				value: rating,
				submitted_at: new Date().toISOString(),
				review_message_id: review_message_id,
			},
		}

		// Update the ticket with the rating
		const { error: updateError } = await supabase
			.from('tickets')
			.update({
				metadata: updatedMetadata,
			})
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('thread_id', thread_id)

		if (updateError) throw updateError

		// Verify the update was successful
		const { data: verifyData, error: verifyError } = await supabase
			.from('tickets')
			.select('metadata')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('thread_id', thread_id)
			.single()

		if (verifyError) throw verifyError

		if (verifyData?.metadata?.rating?.value !== rating) {
			bunnyLog.warn(`Rating update verification failed for ticket ${thread_id}`)
		} else {
			// bunnyLog.info(
			// 	`Ticket ${thread_id} rated ${rating}/5 stars - metadata updated successfully`
			// )
		}
	} catch (error) {
		bunnyLog.error('Error updating ticket rating:', error)
		throw error
	}
}

/**
 * Gets tickets opened by a specific user.
 * @param {string} bot_id - The bot's user ID.
 * @param {string} guild_id - The guild's ID.
 * @param {string} user_id - The user's ID who opened the tickets.
 * @returns {Promise<Array<{ thread_id: string, open_time: number }>>} - Array of ticket data.
 */
async function getUserTickets(
	bot_id: string,
	guild_id: string,
	user_id: string
): Promise<Array<{ thread_id: string; open_time: number }>> {
	try {
		// Get all tickets for this guild and bot
		const { data, error } = await supabase
			.from('tickets')
			.select('thread_id, metadata')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)

		if (error) {
			bunnyLog.error('Error fetching tickets:', error)
			return []
		}

		// Filter tickets by user ID in the opened_by field
		const userTickets =
			data?.filter((ticket) => {
				// Type casting to access the nested properties
				const metadata = ticket.metadata as ThreadMetadata
				// Check if metadata and opened_by exist and have valid properties
				return metadata?.opened_by?.id === user_id && metadata?.open_time > 0
			}) || []

		// Transform data to extract thread_id and open_time
		return userTickets.map((ticket) => ({
			thread_id: ticket.thread_id,
			open_time: (ticket.metadata as ThreadMetadata).open_time || 0,
		}))
	} catch (error) {
		bunnyLog.error('Failed to get user tickets:', error)
		return []
	}
}

/**
 * Gets all active tickets for a specific guild or across all guilds.
 * @param {string} bot_id - The bot's user ID.
 * @param {string} [guild_id] - Optional guild ID to filter by. If not provided, returns tickets from all guilds.
 * @returns {Promise<Array<{ thread_id: string, metadata: ThreadMetadata, guild_id: string }>>} - Array of active tickets with metadata.
 */
async function getAllActiveTickets(
	bot_id: string,
	guild_id?: string
): Promise<
	Array<{ thread_id: string; metadata: ThreadMetadata; guild_id: string }>
> {
	try {
		// Base query
		let query = supabase
			.from('tickets')
			.select('thread_id, metadata, guild_id')
			.eq('bot_id', bot_id)

		// Add guild filter if specified
		if (guild_id) {
			query = query.eq('guild_id', guild_id)
		}

		// Get the data
		const { data, error } = await query

		if (error) {
			bunnyLog.error('Error fetching active tickets:', error)
			return []
		}

		if (!data || data.length === 0) {
			return []
		}

		// Filter to only include active tickets (not marked as closed)
		const activeTickets = data.filter((ticket) => {
			if (!ticket.metadata) return false
			const metadata = ticket.metadata as ThreadMetadata
			// Check the optional status field to exclude closed tickets
			return metadata.status !== 'closed'
		})
		return activeTickets
	} catch (error) {
		bunnyLog.error('Failed to get active tickets:', error)
		return []
	}
}

export async function fetchTotalTickets(): Promise<number> {
	const { data, error } = await supabase.from('tickets').select('*')

	if (error) throw error
	return data?.length || 0
}

export {
	saveTicketMetadata,
	saveTranscriptToSupabase,
	fetchTicketMessages,
	formatTranscript,
	getTicketCounter,
	incrementTicketCounter,
	getTicketMetadata,
	updateTicketMetadata,
	updateTicketRating,
	getUserTickets,
	getAllActiveTickets,
}
