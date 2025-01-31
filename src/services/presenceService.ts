import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import { bunnyLog } from 'bunny-log'

const DEVELOPMENT = process.env.NODE_ENV !== 'production'

/**
 * Updates the bot's presence with the total XP.
 * @param {Discord.ClientUser} client - Discord bot client.
 */
export async function updateBotPresence(
	client: Discord.ClientUser
): Promise<void> {
	try {
		// Fetch the total XP for the bot
		const xp = await api.fetchTotalBotXp(client.id)

		// Check if the XP is a valid number
		if (typeof xp !== 'number' || Number.isNaN(xp)) {
			bunnyLog.error('Invalid XP value fetched.')
			return
		}

		// Create the presence message
		const presenceMessage = `⭐ ${xp.toLocaleString()} XP`

		// Set the bot's presence
		client.setPresence({
			activities: [
				{
					name: presenceMessage,
					type: Discord.ActivityType.Custom,
					url: 'https://tinyrabbit.co',
					//state: presenceMessage,
				},
			],
			status: DEVELOPMENT ? 'dnd' : 'online',
		})
	} catch (error) {
		bunnyLog.error('Error updating bot presence:', error)
	}
}
