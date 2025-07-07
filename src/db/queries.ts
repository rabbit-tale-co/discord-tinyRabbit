import 'server-only'
import { eq, and, desc, asc, count, sum } from 'drizzle-orm'
import { db } from './index.js'
import {
	botStats,
	bots,
	guilds,
	leaderboard,
	plugins,
	userBalances,
	userLevels,
	tickets,
	tempVoiceChannels,
	starboards,
	type BotStats,
	type Guilds,
	type Leaderboard,
} from './schema.js'

// Bot Statistics Functions
export async function getBotStats(botId: string): Promise<BotStats | null> {
	try {
		const [stats] = await db
			.select()
			.from(botStats)
			.where(eq(botStats.bot_id, botId))
			.limit(1)

		return stats ?? null
	} catch (error) {
		console.error('Failed to get bot stats:', error)
		throw new Error('Failed to get bot stats')
	}
}

export async function updateBotStats(
	botId: string,
	stats: Partial<Omit<BotStats, 'bot_id' | 'updated_at'>>
): Promise<BotStats> {
	try {
		const [updatedStats] = await db
			.insert(botStats)
			.values({
				bot_id: botId,
				...stats,
				updated_at: new Date(),
			})
			.onConflictDoUpdate({
				target: botStats.bot_id,
				set: {
					...stats,
					updated_at: new Date(),
				},
			})
			.returning()

		return updatedStats
	} catch (error) {
		console.error('Failed to update bot stats:', error)
		throw new Error('Failed to update bot stats')
	}
}

// Guild Functions
export async function getGuildsByBotId(botId: string): Promise<Guilds[]> {
	try {
		return await db
			.select()
			.from(guilds)
			.where(eq(guilds.bot_id, botId))
			.orderBy(desc(guilds.members))
	} catch (error) {
		console.error('Failed to get guilds by bot ID:', error)
		throw new Error('Failed to get guilds by bot ID')
	}
}

export async function getGuildById(
	botId: string,
	guildId: string
): Promise<Guilds | null> {
	try {
		const [guild] = await db
			.select()
			.from(guilds)
			.where(and(eq(guilds.bot_id, botId), eq(guilds.guild_id, guildId)))
			.limit(1)

		return guild ?? null
	} catch (error) {
		console.error('Failed to get guild by ID:', error)
		throw new Error('Failed to get guild by ID')
	}
}

export async function upsertGuild(
	guild: Omit<Guilds, 'premium'>
): Promise<Guilds> {
	try {
		const [upsertedGuild] = await db
			.insert(guilds)
			.values({
				...guild,
				premium: false,
			})
			.onConflictDoUpdate({
				target: [guilds.bot_id, guilds.guild_id],
				set: {
					guild_name: guild.guild_name,
					members: guild.members,
				},
			})
			.returning()

		return upsertedGuild
	} catch (error) {
		console.error('Failed to upsert guild:', error)
		throw new Error('Failed to upsert guild')
	}
}

// Leaderboard Functions
export async function getLeaderboard(
	botId: string,
	guildId: string,
	limit = 10
): Promise<Leaderboard[]> {
	try {
		return await db
			.select()
			.from(leaderboard)
			.where(and(eq(leaderboard.bot_id, botId), eq(leaderboard.guild_id, guildId)))
			.orderBy(desc(leaderboard.xp))
			.limit(limit)
	} catch (error) {
		console.error('Failed to get leaderboard:', error)
		throw new Error('Failed to get leaderboard')
	}
}

export async function updateUserXP(
	botId: string,
	guildId: string,
	userId: string,
	xp: number
): Promise<Leaderboard> {
	try {
		const [updatedUser] = await db
			.insert(leaderboard)
			.values({
				bot_id: botId,
				guild_id: guildId,
				user_id: userId,
				xp,
			})
			.onConflictDoUpdate({
				target: [leaderboard.bot_id, leaderboard.user_id, leaderboard.guild_id],
				set: {
					xp,
				},
			})
			.returning()

		return updatedUser
	} catch (error) {
		console.error('Failed to update user XP:', error)
		throw new Error('Failed to update user XP')
	}
}

// Plugin Functions
export async function getPluginsByGuild(
	botId: string,
	guildId: string
): Promise<Array<{ plugin_name: string; config: any }>> {
	try {
		return await db
			.select({
				plugin_name: plugins.plugin_name,
				config: plugins.config,
			})
			.from(plugins)
			.where(and(eq(plugins.bot_id, botId), eq(plugins.guild_id, guildId)))
			.orderBy(asc(plugins.plugin_name))
	} catch (error) {
		console.error('Failed to get plugins by guild:', error)
		throw new Error('Failed to get plugins by guild')
	}
}

export async function upsertPluginConfig(
	botId: string,
	guildId: string,
	pluginName: string,
	config: any
): Promise<void> {
	try {
		await db
			.insert(plugins)
			.values({
				bot_id: botId,
				guild_id: guildId,
				plugin_name: pluginName,
				config,
			})
			.onConflictDoUpdate({
				target: [plugins.bot_id, plugins.guild_id, plugins.plugin_name],
				set: {
					config,
				},
			})
	} catch (error) {
		console.error('Failed to upsert plugin config:', error)
		throw new Error('Failed to upsert plugin config')
	}
}

// Statistics Aggregation Functions
export async function getGuildStatistics(
	botId: string,
	guildId?: string
): Promise<{
	totalUsers: number
	totalXP: number
	totalTickets: number
	totalStarboards: number
	totalTempChannels: number
	configuredPlugins: number
}> {
	try {
		const whereCondition = guildId
			? and(eq(userLevels.bot_id, botId), eq(userLevels.guild_id, guildId))
			: eq(userLevels.bot_id, botId)

		const [userStats] = await db
			.select({
				totalUsers: count(userLevels.user_id),
				totalXP: sum(userLevels.xp),
			})
			.from(userLevels)
			.where(whereCondition)

		const ticketCondition = guildId
			? and(eq(tickets.bot_id, botId), eq(tickets.guild_id, guildId))
			: eq(tickets.bot_id, botId)

		const [ticketStats] = await db
			.select({
				totalTickets: count(tickets.thread_id),
			})
			.from(tickets)
			.where(ticketCondition)

		const starboardCondition = guildId
			? and(eq(starboards.bot_id, botId), eq(starboards.guild_id, guildId))
			: eq(starboards.bot_id, botId)

		const [starboardStats] = await db
			.select({
				totalStarboards: count(starboards.starboard_message_id),
			})
			.from(starboards)
			.where(starboardCondition)

		const tempChannelCondition = guildId
			? and(eq(tempVoiceChannels.bot_id, botId), eq(tempVoiceChannels.guild_id, guildId))
			: eq(tempVoiceChannels.bot_id, botId)

		const [tempChannelStats] = await db
			.select({
				totalTempChannels: count(tempVoiceChannels.channel_id),
			})
			.from(tempVoiceChannels)
			.where(tempChannelCondition)

		const pluginCondition = guildId
			? and(eq(plugins.bot_id, botId), eq(plugins.guild_id, guildId))
			: eq(plugins.bot_id, botId)

		const [pluginStats] = await db
			.select({
				configuredPlugins: count(plugins.plugin_name),
			})
			.from(plugins)
			.where(pluginCondition)

		return {
			totalUsers: userStats?.totalUsers || 0,
			totalXP: Number(userStats?.totalXP || 0),
			totalTickets: ticketStats?.totalTickets || 0,
			totalStarboards: starboardStats?.totalStarboards || 0,
			totalTempChannels: tempChannelStats?.totalTempChannels || 0,
			configuredPlugins: pluginStats?.configuredPlugins || 0,
		}
	} catch (error) {
		console.error('Failed to get guild statistics:', error)
		throw new Error('Failed to get guild statistics')
	}
}

// User Balance Functions
export async function getUserBalance(
	botId: string,
	guildId: string,
	userId: string
): Promise<number> {
	try {
		const [balance] = await db
			.select()
			.from(userBalances)
			.where(
				and(
					eq(userBalances.bot_id, botId),
					eq(userBalances.guild_id, guildId),
					eq(userBalances.user_id, userId)
				)
			)
			.limit(1)

		return Number(balance?.amount || 0)
	} catch (error) {
		console.error('Failed to get user balance:', error)
		throw new Error('Failed to get user balance')
	}
}

export async function updateUserBalance(
	botId: string,
	guildId: string,
	userId: string,
	amount: number
): Promise<void> {
	try {
		await db
			.insert(userBalances)
			.values({
				bot_id: botId,
				guild_id: guildId,
				user_id: userId,
				amount,
				updated_at: new Date(),
			})
			.onConflictDoUpdate({
				target: [userBalances.bot_id, userBalances.guild_id, userBalances.user_id],
				set: {
					amount,
					updated_at: new Date(),
				},
			})
	} catch (error) {
		console.error('Failed to update user balance:', error)
		throw new Error('Failed to update user balance')
	}
}
