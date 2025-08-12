import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import supabase from '@/db/supabase.js'

class PresenceService {
	private readonly client: Discord.Client
	private isUpdating = false
	// kept for potential future metrics; remove if not needed
	private static readonly HOLIDAY_PRESENCES = [
		{
			dates: { start: '04-01', end: '04-02' }, // April Fools
			activities: [
				{
					type: Discord.ActivityType.Custom,
					name: '🤡 Jokes around!',
				},
			],
			status: 'online' as Discord.PresenceStatusData,
		},
		{
			dates: { start: '02-14', end: '02-14' }, // Valentine's Day
			activities: [
				{
					type: Discord.ActivityType.Custom,
					name: '❤️ Spread love!',
				},
			],
			status: 'online' as Discord.PresenceStatusData,
		},
		{
			dates: { start: '06-01', end: '06-30' }, // pride month
			activities: [
				{
					type: Discord.ActivityType.Custom,
					name: '🌈 Happy Pride Month!',
				},
			],
			status: 'online' as Discord.PresenceStatusData,
		},
		{
			dates: { start: '12-20', end: '12-26' }, // Christmas
			activities: [
				{
					type: Discord.ActivityType.Custom,
					name: '🎄 Merry Xmas!',
				},
			],
			status: 'online' as Discord.PresenceStatusData,
		},
		// Add more holidays as needed
	]

	private static readonly STATS_UPDATE_INTERVAL = 15 * 60 * 1000 // 15 minutes

	constructor(client: Discord.Client) {
		this.client = client
	}

	public initialize(): void {
		if (!this.client.user) {
			throw new Error('Client user not available')
		}

		// Initial load (do both on start)
		void this.updateAll()

		// Second run after a moment (cache may not be fully ready on READY)
		setTimeout(() => void this.updateAll(), 5_000)

		// Set up unified interval co 15 min
		setInterval(
			() => void this.updateAll(),
			PresenceService.STATS_UPDATE_INTERVAL
		)

		// Update stats when guilds are created or deleted
		this.client.on(
			'guildCreate',
			() => void this.updateApplicationDescription()
		)
		this.client.on(
			'guildDelete',
			() => void this.updateApplicationDescription()
		)
	}

	private async updateAll(): Promise<void> {
		if (this.isUpdating) return
		this.isUpdating = true
		try {
			await Promise.allSettled([
				this.updatePresence(),
				this.updateApplicationDescription(),
			])
		} catch (error) {
			StatusLogger.error(
				'Error during presenceService.updateAll',
				error as Error
			)
		} finally {
			this.isUpdating = false
		}
	}

	public async updatePresence(): Promise<void> {
		try {
			const user = this.client.user
			if (!user) return

			const holidayPresence = this.getHolidayPresence()
			if (holidayPresence) {
				user.setPresence({
					activities: holidayPresence.activities,
					status: holidayPresence.status,
				})
			} else {
				// Only set default presence if no holiday is active
				user.setPresence({
					activities: [
						{
							name: '🐇 Hop around!',
							type: Discord.ActivityType.Custom,
							url: 'https://tinyrabbit.co',
						},
					],
					status: 'online',
				})
			}
		} catch (error) {
			StatusLogger.error('Error updating bot presence', error as Error)
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

			const stats = await api.fetchAllStats(user.id, this.client)

			// Upsert stats to the bot_stats table for dashboard consumption
			const { error: upsertError } = await supabase
				.from('bot_stats')
				.upsert({ bot_id: user.id, ...stats }, { onConflict: 'bot_id' })

			if (upsertError) {
				StatusLogger.error('Error upserting bot stats', upsertError)
			}

			const description = `- configure me with \`/config\` (5 done / ${stats.total_plugins} plugins)

🐇 Tiny Rabbit Stats:
🏰 Servers: ${stats.servers.toLocaleString()}
👥 Users: ${stats.users.toLocaleString()}
🎉 Birthdays: ${stats.birthday_messages.toLocaleString()}
⭐ Starboards: ${stats.starboard_posts.toLocaleString()}
🔈 Temp Channels: ${stats.temp_channels.toLocaleString()}
🎫 Tickets: ${stats.tickets_opened.toLocaleString()}
📈 Total XP: ${stats.total_xp.toLocaleString()}

- website: https://discord.rabbittale.co
- support: https://discord.gg/RfBydgJpmU

Questions? Contact @Hasiradoo`

			if (this.client.application) {
				await this.client.application.edit({ description })
				//bunnyLog.info('Updated application description')
			}
		} catch (error) {
			StatusLogger.error(
				'Error updating application description',
				error as Error
			)
		}
	}
}

export default PresenceService
