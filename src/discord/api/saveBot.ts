import { encryptToken } from '@/utils/crypto.js'
import type * as Discord from 'discord.js'
import supabase from '@/db/supabase.js'
import { bunnyLog } from 'bunny-log'

/**
 * @param {Discord.ClientUser} bot - The bot user.
 * @returns {Promise<boolean>} - Returns true if the bot data was saved successfully, false otherwise.
 */
async function saveBotData(bot: Discord.ClientUser): Promise<boolean> {
	// Check if the bot is logged in or user data is unavailable
	if (!bot) throw new Error('Bot is not logged in or user data is unavailable')

	// Create the bot data object
	const botData = {
		bot_id: bot.id,
		bot_name: bot.username,
		bot_token: encryptToken(process.env.BOT_TOKEN || ''),
		bot_owner: {
			id: process.env.OWNER_ID || '123456789012345678',
			email: process.env.OWNER_EMAIL || 'owner@example.com',
			has_premium: false,
			premium_expire: null,
		},
	}

	// Check if bot data already exists
	try {
		const { data: existingBot, error: fetchError } = await supabase
			.from('bots')
			.select('bot_id')
			.eq('bot_id', bot.id)
			.maybeSingle()

		if (fetchError) {
			bunnyLog.error('Error checking existing bot data:', fetchError)
			return false
		}

		if (existingBot) {
			bunnyLog.database('Bot data already exists, skipping update')
			return true
		}

		// Insert the new bot data
		const { error } = await supabase.from('bots').insert(botData)
		if (error) {
			return false
		}
		bunnyLog.database('Bot data saved successfully')
	} catch (error) {
		bunnyLog.error('Error saving bot data:', error)
		return false
	}
}

export { saveBotData }
