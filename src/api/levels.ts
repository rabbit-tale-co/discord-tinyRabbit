import { updateLeaderboard } from './leaderBoard.js'
import type { Level } from '../types/levels.js'
import type { Guild, User, Client } from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

const level_cache = {}

/**
 * Gets all user levels for a specific guild under a specific bot.
 * @param {Client['user']['id']} bot_id - The bot client object.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<object[]>} List of users with levels.
 */
async function getAllUserLevels(
	bot_id: Client['user']['id'],
	guild_id: Guild['id']
): Promise<object[]> {
	if (!guild_id || !bot_id) throw new Error('Invalid guild_id or bot_id')

	const { data, error } = await supabase
		.from('user_levels') // Changed from 'user_levels' to 'levels'
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)

	if (error) throw error

	return data.map((doc) => ({
		user_id: doc.user_id,
		...doc,
	}))
}

/**
 * Gets a specific user's level for a specific guild under a specific bot.
 * @param {Client['user']['id']} bot_id - The bot client object.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @param {User['id']} user_id - The ID of the user.
 * @returns {Promise<object>} User level data.
 */
async function getUserLevel(
	bot_id: Client['user']['id'],
	guild_id: Guild['id'],
	user_id: User['id']
): Promise<object | null> {
	if (!guild_id || !user_id || !bot_id)
		throw new Error('Invalid guild_id, user_id, or bot_id')

	const key = `${guild_id}_${user_id}`
	if (level_cache[key]) return level_cache[key] // Return from cache if available

	const { data, error } = await supabase
		.from('user_levels') // Changed from 'user_levels' to 'levels'
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('user_id', user_id)
		.single()

	if (error) {
		if (error.code === 'PGRST116') return null // No matching row found
		throw error
	}

	// Store in cache
	level_cache[key] = data
	return data
}

/**
 * Adds or updates a user's level in the database.
 * @param {Client['user']['id']} bot_id - The bot client object.
 * @param {Guild} guild_id - The guild object.
 * @param {User} user - The user to update.
 * @param {Level} level_data - The user level data to update.
 */
async function addOrUpdateUserLevel(
	bot_id: Client['user']['id'],
	guild_id: Guild['id'],
	user: User,
	level_data: Level
) {
	if (!guild_id || !user.id || !bot_id)
		throw new Error('Invalid guild_id, user_id, or bot_id')

	try {
		const user_data = {
			bot_id,
			guild_id,
			user_id: user.id,
			xp: level_data.xp ?? 0,
			level: level_data.level ?? 0,
		}

		const { data, error } = await supabase
			.from('user_levels') // Changed from 'user_levels' to 'levels'
			.upsert(user_data)
			.select()

		if (error) throw error

		if (!data || data.length === 0) {
			throw new Error(
				'Failed to update user level in the database. No data returned.'
			)
		}

		level_cache[`${guild_id}_${user.id}`] = data[0]

		await updateLeaderboard(bot_id, user)
		// bunnyLog.database(`User level updated successfully for user ${user.id}`)
	} catch (error) {
		bunnyLog.error('Error adding/updating user level:', error)
		throw error
	}
}

export { getAllUserLevels, getUserLevel, addOrUpdateUserLevel }
