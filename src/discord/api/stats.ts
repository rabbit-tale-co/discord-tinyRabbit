import supabase from '@/db/supabase.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import type * as Discord from 'discord.js'
import { getAllPluginsCount } from './plugins.js'

type BotStats = {
	servers: number
	users: number
	birthday_messages: number
	starboard_posts: number
	temp_channels: number
	tickets_opened: number
	total_xp: number
	voice_channels: number
	leaderboard_users: number
	total_plugins: number
	configured_plugins: number
}

export async function fetchAllStats(
	botId: string,
	client?: Discord.Client,
	guildId?: string
): Promise<BotStats> {
	try {
		// If we are fetching for a specific guild, we bypass the global cache
		if (!guildId) {
			const { data, error } = await supabase
				.from('bot_stats')
				.select('*')
				.eq('bot_id', botId)
				.single()

			if (!error && data) {
				return data as BotStats
			}
		}

		// Fallback to direct counting if stats missing or for a specific guild
		const createQuery = (tableName: string, columns = '*') => {
			const query = supabase
				.from(tableName)
				.select(columns, { count: 'exact' })
				.eq('bot_id', botId)
			if (guildId) {
				query.eq('guild_id', guildId)
			}
			return query
		}

		const xpQuery = supabase
			.from('leaderboard')
			.select('xp')
			.eq('bot_id', botId)
		if (guildId) {
			xpQuery.eq('guild_id', guildId)
		}

		const [
			birthdays,
			starboards,
			tempChannels,
			tickets,
			xp,
			voiceChannels,
			leaderboardUsers,
			configuredPlugins,
		] = await Promise.all([
			createQuery('user_bdays'),
			createQuery('starboards'),
			createQuery('temp_voice_channels'),
			createQuery('tickets'),
			xpQuery,
			createQuery('temp_voice_channels', 'channel_id'),
			createQuery('leaderboard', 'user_id'),
			createQuery('plugins'),
		])

		let totalServers = 0
		let totalUsers = 0

		if (guildId) {
			const guild = client?.guilds?.cache.get(guildId)
			if (guild) {
				totalServers = 1
				totalUsers = guild.memberCount
			} else {
				const { data: guildData } = await supabase
					.from('guilds')
					.select('members')
					.eq('bot_id', botId)
					.eq('guild_id', guildId)
					.single()
				if (guildData) {
					totalServers = 1
					totalUsers = guildData.members || 0
				}
			}
		} else {
			// Global stats
			if (client?.guilds?.cache) {
				totalServers = client.guilds.cache.size
				totalUsers = client.guilds.cache.reduce(
					(acc, g) => acc + g.memberCount,
					0
				)
			} else {
				const { data: guilds } = await supabase
					.from('guilds')
					.select('members')
					.eq('bot_id', botId)
				if (guilds) {
					totalServers = guilds.length
					totalUsers = guilds.reduce((acc, g) => acc + (g.members || 0), 0)
				}
			}
		}

		return {
			servers: totalServers,
			users: totalUsers,
			birthday_messages: birthdays.count || 0,
			starboard_posts: starboards.count || 0,
			temp_channels: tempChannels.count || 0,
			tickets_opened: tickets.count || 0,
			total_xp: xp.data?.reduce((sum, { xp }) => sum + xp, 0) || 0,
			voice_channels: voiceChannels.count || 0,
			leaderboard_users: leaderboardUsers.count || 0,
			total_plugins: getAllPluginsCount(),
			configured_plugins: configuredPlugins.count || 0,
		}
	} catch (error: unknown) {
		StatusLogger.error(
			`Error in fetchAllStats: ${
				error instanceof Error ? error.message : String(error)
			}`
		)
		throw new Error('Error in fetchAllStats')
	}
}
