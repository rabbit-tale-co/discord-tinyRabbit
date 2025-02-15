import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import { bunnyLog } from 'bunny-log'

const DEVELOPMENT = process.env.NODE_ENV !== 'production'

class PresenceService {
	private readonly client: Discord.Client
	private static readonly HOLIDAY_PRESENCES = [
		{
			dates: { start: '02-14', end: '02-14' }, // Valentine's Day
			activity: {
				type: Discord.ActivityType.Custom,
				name: '❤️ Spread love!',
			},
			status: 'online' as Discord.PresenceStatusData,
		},
		{
			dates: { start: '12-20', end: '12-26' }, // Christmas
			activity: {
				type: Discord.ActivityType.Custom,
				name: '🎄 Merry Xmas!',
			},
			status: 'online' as Discord.PresenceStatusData,
		},
		// Add more holidays as needed
	]

	private static readonly STATS_UPDATE_INTERVAL = 15 * 60 * 1000 // 15 minutes
	private static readonly PRESENCE_UPDATE_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours

	constructor(client: Discord.Client) {
		this.client = client
	}

	public initialize(): void {
		if (!this.client.user) {
			throw new Error('Client user not available')
		}

		// Initial load
		this.updatePresence()
		this.updateApplicationDescription()

		// Set up intervals
		setInterval(
			() => this.updateApplicationDescription(),
			PresenceService.STATS_UPDATE_INTERVAL
		)
		setInterval(
			() => this.updatePresence(),
			PresenceService.PRESENCE_UPDATE_INTERVAL
		)
	}

	public async updatePresence(): Promise<void> {
		try {
			const user = this.client.user
			if (!user) return

			const holidayPresence = this.getHolidayPresence()
			if (holidayPresence) {
				user.setPresence({
					activities: [holidayPresence.activity],
					status: holidayPresence.status,
				})
			}

			user.setPresence({
				activities: [
					{
						name: '🐇 Hop around!',
						type: Discord.ActivityType.Custom,
						url: 'https://tinyrabbit.co',
					},
				],
				status: DEVELOPMENT ? 'dnd' : 'online',
			})
		} catch (error) {
			bunnyLog.error('Error updating bot presence:', error)
		}
	}

	private getHolidayPresence() {
		const now = new Date()
		return PresenceService.HOLIDAY_PRESENCES.find(({ dates }) =>
			this.isDateInRange(now, dates.start, dates.end)
		)
	}

	private isDateInRange(date: Date, start: string, end: string): boolean {
		const year = date.getFullYear()
		const current = date.getTime()
		const startDate = new Date(`${year}-${start}`).getTime()
		const endDate = new Date(`${year}-${end}`).getTime()
		return current >= startDate && current <= endDate
	}

	private async updateApplicationDescription(): Promise<void> {
		try {
			const user = this.client.user
			if (!user) return

			const stats = await api.fetchAllStats(user.id)

			const description = `🐇 Tiny Rabbit Stats:
🏰 Servers: ${stats.servers.toLocaleString()}
🎉 Birthdays: ${stats.birthday_messages.toLocaleString()}
⭐ Starboards: ${stats.starboard_posts.toLocaleString()}
🔈 Temp Channels: ${stats.temp_channels.toLocaleString()}
🎫 Tickets: ${stats.tickets_opened.toLocaleString()}
📈 Total XP: ${stats.total_xp.toLocaleString()}

Questions? Contact @Hasiradoo`

			if (this.client.application) {
				await this.client.application.edit({ description })
				//bunnyLog.info('Updated application description')
			}
		} catch (error) {
			bunnyLog.error('Error updating application description:', error)
		}
	}
}

export default PresenceService
