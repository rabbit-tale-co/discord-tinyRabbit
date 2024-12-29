import { calculateTotalXpForLevel } from '../utils/xpUtils.js'
import type { Level } from '../types/levels.js'
import type { LeaderboardEntry, LeaderboardUser } from '../types/leaderboard.js'
import { env } from 'node:process'
import type { ClientUser, Guild, User } from 'discord.js'
import type { UserData } from '../types/user.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

const BOT_TOKEN = env.BOT_TOKEN

/**
 * Fetches user data from Discord.
 * @param {User['id']} user_id - The ID of the user.
 * @returns {Promise<UserData | null>} The user data.
 */
const fetchUserData = async (user_id: User['id']): Promise<UserData | null> => {
	if (!user_id) return null

	try {
		const response = await fetch(`https://discord.com/api/users/${user_id}`, {
			headers: {
				Authorization: `Bot ${BOT_TOKEN}`,
			},
		})

		if (!response.ok) {
			const error_details = await response.text()
			throw new Error(
				`Failed to fetch user data: ${response.status} ${response.statusText} - ${error_details}`
			)
		}

		const user_data = (await response.json()) as UserData
		return user_data
	} catch (error) {
		bunnyLog.error(
			`Error fetching user data for user ID ${user_id}:`,
			error.message
		)
	}
}

/**
 * Gets the global leaderboard with pagination.
 * @returns {Promise<LeaderboardUser[]>} The global leaderboard and total users count.
 */
async function getGlobalLeaderboard(
	page = 1,
	limit = 25
): Promise<LeaderboardUser[]> {
	try {
		const { data: leaderboard_data, error } = await supabase
			.from('leaderboard')
			.select('user_id, xp')
			.order('xp', { ascending: false })
			.range((page - 1) * limit, page * limit - 1)

		if (error) throw error

		const users_promises = leaderboard_data.map(async (user) => {
			if (!user || !user.user_id) {
				bunnyLog.error(`Invalid user ID: ${JSON.stringify(user)}`)
				return null
			}

			const userData = await fetchUserData(user.user_id)

			if (userData)
				return {
					user: {
						id: userData.id,
						username: userData.username,
						global_name: userData.global_name,
						avatar: userData.avatar,
					},
					xp: user.xp,
				} as LeaderboardUser
			return null
		})

		const users = await Promise.all(users_promises)

		return users.filter((user): user is LeaderboardUser => user !== null)
	} catch (error) {
		bunnyLog.error('Error fetching global leaderboard:', error)
		throw error
	}
}

/**
 * Gets the total count of users in the leaderboard.
 * @returns {Promise<number>} The total number of users.
 */
async function getTotalUserCount(): Promise<number> {
	try {
		const { count, error } = await supabase
			.from('leaderboard')
			.select('*', { count: 'exact', head: true })

		if (error) throw error

		return count || 0
	} catch (error) {
		bunnyLog.error('Error fetching total user count:', error)
		throw error
	}
}

/**
 * Calculates the total XP from the global leaderboard.
 * @returns {Promise<number>} Total XP.
 */
async function calculateTotalXp(): Promise<number> {
	try {
		const { data, error } = await supabase.from('leaderboard').select('xp')

		if (error) throw error

		return data.reduce((total, user) => total + (user.xp || 0), 0)
	} catch (error) {
		bunnyLog.error('Error calculating total XP:', error)
		throw error
	}
}

/**
 * Gets the server leaderboard.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<LeaderboardEntry[]>} The server leaderboard.
 */
async function getServerLeaderboard(
	bot_id: ClientUser['id'],
	guild_id: Guild['id']
): Promise<LeaderboardEntry[]> {
	try {
		if (!guild_id) {
			bunnyLog.warn(
				'Attempted to fetch server leaderboard with undefined guild_id'
			)
			return []
		}

		// bunnyLog.api(
		// 	`Fetching server leaderboard for bot ${bot_id}, guild ${guild_id}`
		// )

		const { data, error } = await supabase
			.from('user_levels')
			.select('user_id, xp, level')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)

		if (error) {
			bunnyLog.error('Error fetching server leaderboard:', error)
			throw error
		}

		if (!data || data.length === 0) {
			bunnyLog.warn(`No users found in the leaderboard for guild ${guild_id}`)
			return []
		}

		// bunnyLog.api(`Leaderboard fetched successfully, ${data.length} users found`)

		const leaderboard = data.map((entry) => ({
			user_id: entry.user_id,
			total_xp: calculateTotalXpForLevel(entry.level) + entry.xp,
			level: entry.level,
			xp: entry.xp,
		}))

		// Sort the leaderboard by total XP
		leaderboard.sort((a, b) => b.total_xp - a.total_xp)

		return leaderboard.map((entry, index) => ({
			...entry,
			rank: index + 1,
		}))
	} catch (error) {
		bunnyLog.error('Error fetching server leaderboard:', error)
		return []
	}
}

/**
 * Updates the leaderboard with the new XP and level.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {User} user - The user object.
 * @returns {Promise<void>} A promise that resolves when the leaderboard is updated.
 */
async function updateLeaderboard(
	bot_id: ClientUser['id'],
	user: User
): Promise<void> {
	try {
		// Fetch all XP entries for this user across all guilds
		const { data: user_xp_data, error: fetchError } = await supabase
			.from('user_levels')
			.select('xp, level')
			.eq('bot_id', bot_id)
			.eq('user_id', user.id)

		if (fetchError) throw fetchError

		// Calculate total XP across all guilds, including level bonuses
		const total_xp = user_xp_data.reduce((sum, entry) => {
			const levelXP = calculateTotalXpForLevel(entry.level)
			return sum + levelXP + (entry.xp || 0)
		}, 0)

		// Update global leaderboard
		const { error: globalError } = await supabase
			.from('leaderboard')
			.upsert({ bot_id, user_id: user.id, xp: total_xp })

		if (globalError) throw globalError

		// bunnyLog.database(
		// 	`Global leaderboard updated for user ${user.id}. Total XP across all servers (including level bonuses): ${total_xp}`
		// )
	} catch (error) {
		bunnyLog.error(`Error updating leaderboard for user ${user.id}:`, error)
		throw error
	}
}

export {
	updateLeaderboard,
	getGlobalLeaderboard,
	getServerLeaderboard,
	getTotalUserCount,
	calculateTotalXp,
}
