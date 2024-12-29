import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

/**
 * Calculates the total XP for the bot.
 * @param {ClientUser['id']} bot_id - Discord client.
 * @returns {Promise<number>} Total XP.
 */
async function fetchTotalBotXp(
	bot_id: Discord.ClientUser['id']
): Promise<number> {
	try {
		const { data, error } = await supabase
			.from('leaderboard')
			.select('xp')
			.eq('bot_id', bot_id)

		if (error) throw error

		const total_xp = data.reduce((acc, user) => acc + (user.xp || 0), 0)

		return total_xp
	} catch (error) {
		bunnyLog.error('Error calculating total XP:', error)
		throw error
	}
}

/**
 * Calculates the total XP from the global leaderboard.
 * @returns {Promise<number>} Total XP.
 */
async function fetchTotalXp(): Promise<number> {
	try {
		const { data, error } = await supabase.from('leaderboard').select('xp')

		if (error) throw error

		const total_xp = data.reduce((acc, user) => acc + (user.xp || 0), 0)

		return total_xp
	} catch (error) {
		bunnyLog.error('Error calculating total XP:', error)
		throw error
	}
}

export { fetchTotalBotXp, fetchTotalXp }
