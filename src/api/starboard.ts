import type { ClientUser, Guild, Message } from 'discord.js'
import supabase from '../db/supabase'
import { bunnyLog } from 'bunny-log'

/**
 * Fetches the starboard entry for a specific message in a guild.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @param {Message['id']} message_id - The ID of the message.
 * @returns {Promise<Object|null>} The starboard entry, or null if not found.
 */
async function getStarboardEntry(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	message_id: Message['id']
): Promise<object | null> {
	const { data, error } = await supabase
		.from('starboards')
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('author_message_id', message_id)
		.single()

	if (error) {
		if (error.code === 'PGRST116') {
			return null // No matching row found
		}
		bunnyLog.error('Error fetching starboard entry:', error)
		throw error
	}

	return data
}

/**
 * Creates a new starboard entry in Supabase.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @param {Message['id']} author_message_id - The ID of the original message.
 * @param {Message['id']} starboard_message_id - The ID of the starboard message.
 * @param {number} star_count - The initial star count.
 * @returns {Promise<void>}
 */
async function createStarboardEntry(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	author_message_id: Message['id'],
	starboard_message_id: Message['id'],
	star_count: number
): Promise<void> {
	const { error } = await supabase.from('starboards').insert({
		bot_id,
		guild_id,
		author_message_id,
		starboard_message_id,
		star_count,
	})

	if (error) {
		bunnyLog.error('Error creating starboard entry:', error)
		throw error
	}
}

async function deleteStarboardEntry(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	author_message_id: Message['id']
): Promise<void> {
	const { error } = await supabase
		.from('starboards')
		.delete()
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('author_message_id', author_message_id)

	if (error) {
		bunnyLog.error('Error deleting starboard entry:', error)
		throw error
	}
}

/**
 * Updates an existing starboard entry in Supabase.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @param {Message['id']} author_message_id - The ID of the original message.
 * @param {number} star_count - The updated star count.
 * @returns {Promise<void>}
 */
async function updateStarboardEntry(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	author_message_id: Message['id'],
	star_count: number
): Promise<void> {
	const { error } = await supabase
		.from('starboards')
		.update({ star_count })
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('author_message_id', author_message_id)

	if (error) {
		bunnyLog.error('Error updating starboard entry:', error)
		throw error
	}
}

export {
	getStarboardEntry,
	createStarboardEntry,
	deleteStarboardEntry,
	updateStarboardEntry,
}
