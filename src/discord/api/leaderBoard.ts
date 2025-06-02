import { calculateTotalXpForLevel } from '@/utils/xpUtils.js'
import type { LeaderboardEntry, LeaderboardUser } from '@/types/leaderboard.js'
import type * as Discord from 'discord.js'
import type { UserData } from '@/types/user.js'
import { APILogger, DatabaseLogger, StatusLogger } from '@/utils/bunnyLogger.js'
import supabase from '@/db/supabase.js'

const BOT_TOKEN = process.env.BOT_TOKEN

/**
 * Fetches user data from Discord.
 * @param {Discord.User['id']} user_id - The ID of the user.
 * @returns {Promise<UserData | null>} The user data.
 */
const fetchUserData = async (
	user_id: Discord.User['id']
): Promise<UserData | null> => {
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
		APILogger.error(
			`Error fetching user data for user ID ${user_id}:`,
			error instanceof Error ? error.message : 'Unknown error'
		)
		return null
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
		// Fetch leaderboard data from Supabase
		const { data: leaderboard_data, error } = await supabase
			.from('leaderboard')
			.select('user_id, xp')
			.order('xp', { ascending: false })
			.range((page - 1) * limit, page * limit - 1)

		if (error) throw error

		// Fetch user data for each leaderboard entry
		const users_promises = leaderboard_data.map(async (user) => {
			// Check if user is valid
			if (!user || !user.user_id) {
				APILogger.error(`Invalid user ID: ${JSON.stringify(user)}`)
				return null
			}

			// Fetch user data for each leaderboard entry
			const userData = await fetchUserData(user.user_id)

			// Check if userData is valid
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

		// Fetch user data for each leaderboard entry
		const users = await Promise.all(users_promises)

		// Filter out null users and return the leaderboard
		return users.filter((user): user is LeaderboardUser => user !== null)
	} catch (error) {
		APILogger.error('Error fetching global leaderboard:', error)
		throw error
	}
}

/**
 * Gets the total count of users in the leaderboard.
 * @returns {Promise<number>} The total number of users.
 */
async function getTotalUserCount(): Promise<number> {
	try {
		// Fetch the total count of users from Supabase
		const { count, error } = await supabase
			.from('leaderboard')
			.select('*', { count: 'exact', head: true })

		// Check if there is an error fetching the total user count
		if (error) throw error

		// Return the total user count
		return count || 0
	} catch (error) {
		APILogger.error('Error fetching total user count:', error)
		throw error
	}
}

/**
 * Calculates the total XP from the global leaderboard.
 * @returns {Promise<number>} Total XP.
 */
async function calculateTotalXp(): Promise<number> {
	try {
		// Fetch all XP entries from Supabase
		const { data, error } = await supabase.from('leaderboard').select('xp')

		// Check if there is an error fetching the XP entries
		if (error) throw error

		// Calculate the total XP by summing up all the XP values
		return data.reduce((total, user) => total + (user.xp || 0), 0)
	} catch (error) {
		APILogger.error('Error calculating total XP:', error)
		throw error
	}
}

/**
 * Gets the server leaderboard.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<LeaderboardEntry[]>} The server leaderboard.
 */
async function getServerLeaderboard(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id']
): Promise<LeaderboardEntry[]> {
	try {
		// Check if guild_id is undefined
		if (!guild_id) {
			StatusLogger.warn(
				'Attempted to fetch server leaderboard with undefined guild_id'
			)
			return []
		}

		// Fetch user levels from Supabase
		const { data, error } = await supabase
			.from('user_levels')
			.select('user_id, xp, level')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)

		// Check if there is an error fetching the server leaderboard
		if (error) {
			APILogger.error(`Error fetching server leaderboard: ${error.message}`)
			throw error
		}

		// Check if there are no users in the leaderboard
		if (!data || data.length === 0) {
			StatusLogger.warn(`No users found in the leaderboard for guild ${guild_id}`)
			return []
		}

		// Calculate total XP for each user
		const leaderboard = data.map((entry) => ({
			user_id: entry.user_id,
			total_xp: calculateTotalXpForLevel(entry.level) + entry.xp,
			level: entry.level,
			xp: entry.xp,
		}))

		// Sort the leaderboard by total XP
		leaderboard.sort((a, b) => b.total_xp - a.total_xp)

		// Add rank to each entry
		return leaderboard.map((entry, index) => ({
			...entry,
			rank: index + 1,
		}))
	} catch (error) {
		APILogger.error('Error fetching server leaderboard:', error)
		return []
	}
}

/**
 * Updates the leaderboard with the new XP and level.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.User} user - The user object.
 * @returns {Promise<void>} A promise that resolves when the leaderboard is updated.
 */
async function updateLeaderboard(
	bot_id: Discord.ClientUser['id'],
	user: Discord.User
): Promise<void> {
	try {
		// Fetch all XP entries for this user across all guilds
		const { data: user_xp_data, error: fetchError } = await supabase
			.from('user_levels')
			.select('xp, level')
			.eq('bot_id', bot_id)
			.eq('user_id', user.id)

		// Check if there is an error fetching the XP entries
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

		// Check if there is an error updating the global leaderboard
		if (globalError) throw globalError
	} catch (error) {
		APILogger.error(`Error updating leaderboard for user ${user.id}:`, error)
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
