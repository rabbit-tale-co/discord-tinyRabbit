import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

/**
 * Calculates the total XP for the bot.
 * @param {Discord.ClientUser['id']} bot_id - Discord client.
 * @returns {Promise<number>} Total XP.
 */
async function fetchTotalBotXp(
	bot_id: Discord.ClientUser['id']
): Promise<number> {
	// Try to fetch the total XP from the database
	try {
		const { data, error } = await supabase
			.from('leaderboard')
			.select('xp')
			.eq('bot_id', bot_id)

		// Check if there is an error fetching the total XP
		if (error) throw error

		// Calculate the total XP
		const total_xp = data.reduce((acc, user) => acc + (user.xp || 0), 0)

		// Return the total XP
		return total_xp
	} catch (error) {
		// Log the error
		bunnyLog.error('Error calculating total XP:', error)
		throw error
	}
}

/**
 * Calculates the total XP from the global leaderboard.
 * @returns {Promise<number>} Total XP.
 */
async function fetchTotalXp(): Promise<number> {
	// Try to fetch the total XP from the database
	try {
		// Fetch the total XP from the database
		const { data, error } = await supabase.from('leaderboard').select('xp')

		// Check if there is an error fetching the total XP
		if (error) throw error

		// Calculate the total XP
		const total_xp = data.reduce((acc, user) => acc + (user.xp || 0), 0)

		// Return the total XP
		return total_xp
	} catch (error) {
		// Log the error
		bunnyLog.error('Error calculating total XP:', error)
		throw error
	}
}

export { fetchTotalBotXp, fetchTotalXp }
