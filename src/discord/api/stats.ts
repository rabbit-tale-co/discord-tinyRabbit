import supabase from '@/db/supabase.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import type * as Discord from 'discord.js'

type BotStats = {
	servers: number
	users: number
	birthday_messages: number
	starboard_posts: number
	temp_channels: number
	tickets_opened: number
	total_xp: number
}

/**
 * Lightweight guild fetching for stats only - avoids rate limits
 */
async function fetchGuildsForStats() {
	const response = await fetch(
		'https://discord.com/api/users/@me/guilds?with_counts=true',
		{
			headers: {
				Authorization: `Bot ${process.env.BOT_TOKEN}`,
			},
		}
	)

	if (!response.ok) {
		throw new Error(`Failed to fetch guilds: Status ${response.status}`)
	}

	return response.json()
}

export async function fetchAllStats(
	botId: string,
	client?: Discord.Client
): Promise<BotStats> {
	try {
		const { data, error } = await supabase
			.from('bot_stats')
			.select('*')
			.eq('bot_id', botId)
			.single()

		if (error || !data) {
			// Fallback to direct counting if stats missing
			const [servers, birthdays, starboards, tempChannels, tickets, xp] =
				await Promise.all([
					supabase
						.from('guilds')
						.select('*', { count: 'exact' })
						.eq('bot_id', botId),
					supabase
						.from('user_bdays')
						.select('*', { count: 'exact' })
						.eq('bot_id', botId),
					supabase
						.from('starboards')
						.select('*', { count: 'exact' })
						.eq('bot_id', botId),
					supabase
						.from('temp_voice_channels')
						.select('*', { count: 'exact' })
						.eq('bot_id', botId),
					supabase
						.from('tickets')
						.select('*', { count: 'exact' })
						.eq('bot_id', botId),
					supabase.from('leaderboard').select('xp').eq('bot_id', botId),
				])

			// Get user count from Discord client cache (no API calls!)
			let totalUsers = 0
			if (client?.guilds?.cache) {
				totalUsers = client.guilds.cache.reduce(
					(acc, guild) => acc + (guild.memberCount || 0),
					0
				)
			}

			return {
				servers: servers.count || 0,
				users: totalUsers,
				birthday_messages: birthdays.count || 0,
				starboard_posts: starboards.count || 0,
				temp_channels: tempChannels.count || 0,
				tickets_opened: tickets.count || 0,
				total_xp: xp.data?.reduce((sum, { xp }) => sum + xp, 0) || 0,
			}
		}

		return data as BotStats
	} catch (error: unknown) {
		StatusLogger.error(
			`Error in fetchAllStats: ${error instanceof Error ? error.message : String(error)}`
		)
		throw new Error('Error in fetchAllStats')
	}
}
