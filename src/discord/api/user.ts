import supabase from '@/db/supabase.js'
import { XP_PER_MESSAGE } from '@/utils/xpUtils.js'
import { updateLeaderboard } from '@/discord/api/leaderBoard.js'
import type * as Types from '@/types/levels.js'
import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'

const user_cache: Record<string, Types.Level | null> = {}

/**
 * Gets users for a specific guild.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<object>} List of users.
 */
async function getUsers(guild_id: Discord.Guild['id']): Promise<object> {
	// Check if the guild ID is valid
	if (!guild_id) throw new Error('Invalid guild_id')

	// Try to fetch the users from the database
	const { data, error } = await supabase
		.from('user_levels')
		.select('*')
		.eq('guild_id', guild_id)

	// Check if there is an error fetching the users
	if (error) throw error

	// Return the users
	return data.map((doc) => ({
		user_id: doc.user_id,
		...doc,
	}))
}

/**
 * Gets a specific user for a specific guild.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.User['id']} user_id - The ID of the user.
 * @returns {Promise<Level | null>} User data.
 */
async function getUser(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
): Promise<Types.Level | null> {
	// Check if the guild ID or user ID is valid
	if (!guild_id || !user_id) throw new Error('Invalid guild_id or user_id')

	// Create a cache key
	const cache_key = `${guild_id}_${user_id}`

	// Try to fetch the user from the database
	try {
		const { data, error } = await supabase
			.from('user_levels')
			.select('*')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('user_id', user_id)
			.single()

		// Check if there is an error fetching the user
		if (error) {
			if (error.code === 'PGRST116') {
				user_cache[cache_key] = null
				return null
			}
			throw error
		}

		// Add the user to the cache
		const user_data = data as Types.Level
		user_cache[cache_key] = user_data

		// Return the user
		return user_data
	} catch (error) {
		// Log the error
		bunnyLog.error(`Error fetching user data for ${user_id}:`, error)
		throw error
	}
}

/**
 * Adds or updates a user in the database.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The guild ID.
 * @param {Discord.User} user - The user object.
 * @param {Level} user_data - The user data to update.
 */
async function addUserOrUpdate(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user: Discord.User,
	user_data: Types.Level
): Promise<void> {
	// Check if the guild ID or user ID is valid
	if (!guild_id || !user) throw new Error('Invalid guild_id or user_id')

	// Try to fetch the current user data from the database
	try {
		// Fetch the current user data from the database
		const { data: current_data, error: fetchError } = await supabase
			.from('user_levels')
			.select('*')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('user_id', user.id)
			.single()

		// Check if there is an error fetching the user data
		if (fetchError && fetchError.code !== 'PGRST116') throw fetchError

		// Increase the XP based on the previous user's XP
		const new_xp = (current_data?.xp || 0) + XP_PER_MESSAGE

		// Update the user data
		const data_to_update = {
			bot_id,
			guild_id,
			user_id: user.id,
			xp: new_xp,
			level: user_data.level ?? current_data?.level ?? 0,
		}

		// Try to update the user data
		const { error: upsertError } = await supabase
			.from('user_levels')
			.upsert(data_to_update)

		// Check if there is an error updating the user data
		if (upsertError) throw upsertError

		// Delete the user from the cache
		delete user_cache[`${guild_id}_${user.id}`]

		// Update the leaderboard
		await updateLeaderboard(bot_id, user)
	} catch (error) {
		// Log the error
		bunnyLog.error('Error adding/updating user:', error)
		throw error
	}
}

export { getUsers, getUser, addUserOrUpdate }
