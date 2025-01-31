import { updateLeaderboard } from '@/api/leaderBoard.js'
import type { Level } from '@/types/levels.js'
import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '@/db/supabase.js'

const level_cache = {}

/**
 * Gets all user levels for a specific guild under a specific bot.
 * @param {Discord.ClientUser['id']} bot_id - The bot client object.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<object[]>} List of users with levels.
 */
async function getAllUserLevels(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id']
): Promise<object[]> {
	if (!guild_id || !bot_id) throw new Error('Invalid guild_id or bot_id')

	// Fetch all user levels from Supabase
	const { data, error } = await supabase
		.from('user_levels')
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)

	// Check if there is an error fetching the user levels
	if (error) throw error

	// Return the user levels
	return data.map((doc) => ({
		user_id: doc.user_id,
		...doc,
	}))
}

/**
 * Gets a specific user's level for a specific guild under a specific bot.
 * @param {Discord.ClientUser['id']} bot_id - The bot client object.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.User['id']} user_id - The ID of the user.
 * @returns {Promise<object>} User level data.
 */
async function getUserLevel(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
): Promise<object | null> {
	if (!guild_id || !user_id || !bot_id)
		throw new Error('Invalid guild_id, user_id, or bot_id')

	// Create a cache key for the user level
	const key = `${guild_id}_${user_id}`

	// Return from cache if available
	if (level_cache[key]) return level_cache[key]

	// Fetch user level from Supabase
	const { data, error } = await supabase
		.from('user_levels')
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('user_id', user_id)
		.single()

	// Check if there is an error fetching the user level
	if (error) {
		if (error.code === 'PGRST116') return null // No matching row found
		throw error
	}

	// Store in cache
	level_cache[key] = data

	// Return the user level
	return data
}

/**
 * Adds or updates a user's level in the database.
 * @param {Discord.ClientUser['id']} bot_id - The bot client object.
 * @param {Discord.Guild['id']} guild_id - The guild object.
 * @param {Discord.User} user - The user to update.
 * @param {Level} level_data - The user level data to update.
 */
async function addOrUpdateUserLevel(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user: Discord.User,
	level_data: Level
) {
	// Check if the required parameters are valid
	if (!guild_id || !user.id || !bot_id)
		throw new Error('Invalid guild_id, user_id, or bot_id')

	try {
		// Create a user data object to be upserted into Supabase
		const user_data = {
			bot_id,
			guild_id,
			user_id: user.id,
			xp: level_data.xp ?? 0,
			level: level_data.level ?? 0,
		}

		// Upsert the user data into Supabase
		const { data, error } = await supabase
			.from('user_levels')
			.upsert(user_data)
			.select()

		// Check if there is an error upserting the user data
		if (error) return false

		// Check if no data was returned from the upsert operation
		if (!data || data.length === 0) {
			throw new Error(
				'Failed to update user level in the database. No data returned.'
			)
		}

		// Cache the updated user level
		level_cache[`${guild_id}_${user.id}`] = data[0]

		// Update the leaderboard
		await updateLeaderboard(bot_id, user)
	} catch (error) {
		bunnyLog.error('Error adding/updating user level:', error)
		return false
	}
}

export { getAllUserLevels, getUserLevel, addOrUpdateUserLevel }
