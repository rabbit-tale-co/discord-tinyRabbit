import supabase from '../db/supabase.js'
import { XP_PER_MESSAGE } from '../utils/xpUtils.js'
import { updateLeaderboard } from './leaderBoard.js'
import type { Level } from '../types/levels.js'
import type { ClientUser, Guild, Snowflake, User } from 'discord.js'
import { bunnyLog } from 'bunny-log'

const user_cache: Record<string, Level | null> = {}

/**
 * Gets users for a specific guild.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<object>} List of users.
 */
async function getUsers(guild_id: Snowflake): Promise<object> {
	if (!guild_id) throw new Error('Invalid guild_id')

	const { data, error } = await supabase
		.from('user_levels')
		.select('*')
		.eq('guild_id', guild_id)

	if (error) throw error

	return data.map((doc) => ({
		user_id: doc.user_id,
		...doc,
	}))
}

/**
 * Gets a specific user for a specific guild.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @param {User['id']} user_id - The ID of the user.
 * @returns {Promise<Level | null>} User data.
 */
async function getUser(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	user_id: User['id']
): Promise<Level | null> {
	if (!guild_id || !user_id) throw new Error('Invalid guild_id or user_id')

	const cache_key = `${guild_id}_${user_id}`
	// if (user_cache[cache_key]) return user_cache[cache_key] // Return from cache if available

	try {
		const { data, error } = await supabase
			.from('user_levels')
			.select('*')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('user_id', user_id)
			.single()

		if (error) {
			if (error.code === 'PGRST116') {
				user_cache[cache_key] = null
				return null
			}
			throw error
		}

		const user_data = data as Level
		user_cache[cache_key] = user_data
		return user_data
	} catch (error) {
		bunnyLog.error(`Error fetching user data for ${user_id}:`, error)
		throw error
	}
}

/**
 * Adds or updates a user in the database.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The guild ID.
 * @param {User} user - The user object.
 * @param {Level} user_data - The user data to update.
 */
async function addUserOrUpdate(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	user: User,
	user_data: Level
): Promise<void> {
	if (!guild_id || !user) throw new Error('Invalid guild_id or user_id')

	try {
		// Pobierz bieżące dane użytkownika z bazy, jeśli istnieją
		const { data: current_data, error: fetchError } = await supabase
			.from('user_levels')
			.select('*')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('user_id', user.id)
			.single()

		if (fetchError && fetchError.code !== 'PGRST116') throw fetchError

		// Zwiększ XP na podstawie poprzedniego XP użytkownika
		const new_xp = (current_data?.xp || 0) + XP_PER_MESSAGE

		// Zaktualizuj dane użytkownika
		const data_to_update = {
			bot_id,
			guild_id,
			user_id: user.id,
			xp: new_xp,
			level: user_data.level ?? current_data?.level ?? 0,
		}

		const { error: upsertError } = await supabase
			.from('user_levels')
			.upsert(data_to_update)

		if (upsertError) throw upsertError

		delete user_cache[`${guild_id}_${user.id}`]

		// Zaktualizuj leaderboard
		await updateLeaderboard(bot_id, user)
	} catch (error) {
		bunnyLog.error('Error adding/updating user:', error)
		throw error
	}
}

export { getUsers, getUser, addUserOrUpdate }
