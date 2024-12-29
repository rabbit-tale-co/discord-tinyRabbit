import { getServerLeaderboard } from './leaderBoard'
import type { ClientUser, User, Guild } from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

/**
 * Gets the global rank of a user based on their XP.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {User['id']} user_id - The ID of the user whose global rank is being fetched.
 * @returns {Promise<number|null>} The global rank of the user or null if the user is not ranked.
 */
async function getGlobalRank(
	bot_id: ClientUser['id'],
	user_id: User['id']
): Promise<number | null> {
	try {
		const { data, error } = await supabase
			.from('leaderboard')
			.select('user_id, xp')
			.eq('bot_id', bot_id)
			.order('xp', { ascending: false })

		if (error) throw error

		if (!data || data.length === 0) {
			bunnyLog.warn('No users found in the global leaderboard.')
			return null
		}

		const global_rank = data.findIndex((user) => user.user_id === user_id) + 1

		return global_rank > 0 ? global_rank : null
	} catch (error) {
		bunnyLog.error('Error fetching global rank:', error)
		return null
	}
}

/**
 * Gets the server rank of a user based on their XP.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the server (guild).
 * @param {User['id']} user_id - The ID of the user whose server rank is being fetched.
 * @returns {Promise<number|null>} The server rank of the user or null if the user is not ranked.
 */
async function getServerRank(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	user_id: User['id']
): Promise<number | null> {
	try {
		if (!guild_id) {
			bunnyLog.warn(
				`Attempted to get server rank with undefined guild_id for user ${user_id}`
			)
			return null
		}

		const server_users = await getServerLeaderboard(bot_id, guild_id)

		if (server_users.length === 0) {
			bunnyLog.warn(
				`No users found in the server leaderboard for guild ${guild_id}`
			)
			return null
		}

		// bunnyLog.api(
		// 	`Server leaderboard fetched, ${server_users.length} users found`
		// )

		const user_index = server_users.findIndex(
			(user) => user.user_id === user_id
		)

		// bunnyLog.api(`User ${user_id} found at index ${user_index} in leaderboard`)

		const server_rank = user_index + 1

		return server_rank > 0 ? server_rank : null
	} catch (error) {
		bunnyLog.error(
			`Error fetching server rank for user ${user_id} in guild ${guild_id}:`,
			error
		)
		return null
	}
}

export { getGlobalRank, getServerRank }
