import { ActivityType, type ClientUser } from 'discord.js'
import { fetchTotalBotXp } from '../api/totalXp'
import { bunnyLog } from 'bunny-log'

const DEVELOPMENT = process.env.NODE_ENV !== 'production'

/**
 * Updates the bot's presence with the total XP.
 * @param {ClientUser} client - Discord bot client.
 */
export async function updateBotPresence(client: ClientUser): Promise<void> {
	try {
		const xp = await fetchTotalBotXp(client.id)

		if (typeof xp !== 'number' || Number.isNaN(xp)) {
			bunnyLog.error('Invalid XP value fetched.')
			return
		}

		const presenceMessage = `⭐ ${xp.toLocaleString()} XP`

		client.setPresence({
			activities: [
				{
					name: presenceMessage,
					type: ActivityType.Watching,
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
