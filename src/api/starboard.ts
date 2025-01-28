import type * as Discord from 'discord.js'
import supabase from '../db/supabase'
import { bunnyLog } from 'bunny-log'

/**
 * Fetches the starboard entry for a specific message in a guild.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.Message['id']} message_id - The ID of the message.
 * @returns {Promise<Object|null>} The starboard entry, or null if not found.
 */
async function getStarboardEntry(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	message_id: Discord.Message['id']
): Promise<object | null> {
	const { data, error } = await supabase
		.from('starboards')
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('author_message_id', message_id)
		.single()

	// Check if there is an error fetching the starboard entry
	if (error) {
		// Check if the error is because the starboard entry doesn't exist
		if (error.code === 'PGRST116') {
			return null // No matching row found
		}

		// Log the error
		bunnyLog.error('Error fetching starboard entry:', error)
		return null
	}

	return data
}

/**
 * Creates a new starboard entry in Supabase.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.Message['id']} author_message_id - The ID of the original message.
 * @param {Discord.Message['id']} starboard_message_id - The ID of the starboard message.
 * @param {number} star_count - The initial star count.
 * @returns {Promise<void>}
 */
async function createStarboardEntry(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	author_message_id: Discord.Message['id'],
	starboard_message_id: Discord.Message['id'],
	star_count: number
): Promise<void> {
	// Try to insert the starboard entry into the database
	const { error } = await supabase.from('starboards').insert({
		bot_id,
		guild_id,
		author_message_id,
		starboard_message_id,
		star_count,
	})

	// Check if there is an error inserting the starboard entry
	if (error) {
		// Log the error
		bunnyLog.error('Error creating starboard entry:', error)
		throw error
	}
}

/**
 * Deletes a starboard entry from Supabase.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.Message['id']} author_message_id - The ID of the original message.
 * @returns {Promise<void>}
 */
async function deleteStarboardEntry(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	author_message_id: Discord.Message['id']
): Promise<void> {
	const { error } = await supabase
		.from('starboards')
		.delete()
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('author_message_id', author_message_id)

	// Check if there is an error deleting the starboard entry
	if (error) {
		// Log the error
		bunnyLog.error('Error deleting starboard entry:', error)
		throw error
	}
}

/**
 * Updates an existing starboard entry in Supabase.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.Message['id']} author_message_id - The ID of the original message.
 * @param {number} star_count - The updated star count.
 * @returns {Promise<void>}
 */
async function updateStarboardEntry(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	author_message_id: Discord.Message['id'],
	star_count: number
): Promise<void> {
	// Try to update the starboard entry in the database
	const { error } = await supabase
		.from('starboards')
		.update({ star_count })
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('author_message_id', author_message_id)

	// Check if there is an error updating the starboard entry
	if (error) {
		// Log the error
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
