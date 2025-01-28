import { getServerLeaderboard } from './leaderBoard'
import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

/**
 * Gets the global rank of a user based on their XP.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.User['id']} user_id - The ID of the user whose global rank is being fetched.
 * @returns {Promise<number|null>} The global rank of the user or null if the user is not ranked.
 */
async function getGlobalRank(
	bot_id: Discord.ClientUser['id'],
	user_id: Discord.User['id']
): Promise<number | null> {
	try {
		// Try to fetch the global leaderboard from the database
		const { data, error } = await supabase
			.from('leaderboard')
			.select('user_id, xp')
			.eq('bot_id', bot_id)
			.order('xp', { ascending: false })

		// Check if there is an error fetching the global leaderboard
		if (error) throw error

		// Check if there are no users in the global leaderboard
		if (!data || data.length === 0) {
			bunnyLog.warn('No users found in the global leaderboard.')
			return null
		}

		// Find the index of the user in the global leaderboard
		const global_rank = data.findIndex((user) => user.user_id === user_id) + 1

		// Return the global rank
		return global_rank > 0 ? global_rank : null
	} catch (error) {
		// Log the error
		bunnyLog.error('Error fetching global rank:', error)
		return null
	}
}

/**
 * Gets the server rank of a user based on their XP.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the server (guild).
 * @param {Discord.User['id']} user_id - The ID of the user whose server rank is being fetched.
 * @returns {Promise<number|null>} The server rank of the user or null if the user is not ranked.
 */
async function getServerRank(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
): Promise<number | null> {
	try {
		// Check if the guild ID is valid
		if (!guild_id) {
			bunnyLog.warn(
				`Attempted to get server rank with undefined guild_id for user ${user_id}`
			)
			return null
		}

		// Try to fetch the server leaderboard from the database
		const server_users = await getServerLeaderboard(bot_id, guild_id)

		// Check if there are no users in the server leaderboard
		if (server_users.length === 0) {
			bunnyLog.warn(
				`No users found in the server leaderboard for guild ${guild_id}`
			)
			return null
		}

		// Find the index of the user in the server leaderboard
		const user_index = server_users.findIndex(
			(user) => user.user_id === user_id
		)

		// Return the server rank
		const server_rank = user_index + 1

		return server_rank > 0 ? server_rank : null
	} catch (error) {
		// Log the error
		bunnyLog.error(
			`Error fetching server rank for user ${user_id} in guild ${guild_id}:`,
			error
		)
		return null
	}
}

export { getGlobalRank, getServerRank }
