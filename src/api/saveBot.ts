import { encryptToken } from '../utils/crypto.js'
import type { Client, ClientUser } from 'discord.js'
import supabase from '../db/supabase.js'
import { bunnyLog } from 'bunny-log'

// Zapisz dane bota w Supabase
async function saveBotData(bot: ClientUser) {
	if (!bot) throw new Error('Bot is not logged in or user data is unavailable')

	const botData = {
		bot_id: bot.id,
		bot_name: bot.username,
		bot_token: encryptToken(process.env.BOT_TOKEN),
		bot_owner: {
			id: process.env.OWNER_ID || '123456789012345678',
			email: process.env.OWNER_EMAIL || 'owner@example.com',
			has_premium: false,
			premium_expire: null,
		},
	}

	try {
		const { error } = await supabase.from('bots').upsert(botData)

		if (error) throw error

		bunnyLog.database('Bot data saved successfully')
	} catch (error) {
		bunnyLog.error('Error saving bot data:', error)
		throw error
	}
}

export { saveBotData }
