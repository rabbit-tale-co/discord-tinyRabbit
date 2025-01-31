import { encryptToken } from '@/utils/crypto.js'
import type * as Discord from 'discord.js'
import supabase from '@/db/supabase.js'
import { bunnyLog } from 'bunny-log'

/**
 * @param {Discord.ClientUser} bot - The bot user.
 */
async function saveBotData(bot: Discord.ClientUser) {
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

	// Try to upsert the bot data into the database
	try {
		const { error } = await supabase.from('bots').upsert(botData)

		// Check if there is an error upserting the bot data
		if (error) return false

		// Log the success
		bunnyLog.database('Bot data saved successfully')
	} catch (error) {
		// Log the error
		bunnyLog.error('Error saving bot data:', error)
		return false
	}
}

export { saveBotData }
