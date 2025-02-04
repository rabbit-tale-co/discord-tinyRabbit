import { client } from '@/index.js'
import { bunnyLog } from 'bunny-log'
import * as api from '@/api/index.js'
import type * as Discord from 'discord.js'
import supabase from '@/db/supabase.js'
import type { DefaultConfigs } from '@/types/plugins.js'

/**
 * Bans users who are likely bots in a specific guild.
 */
async function banBotLikeUsersForGuild(
	guild: Discord.Guild,
	config: DefaultConfigs['moderation']
) {
	try {
		// Fetch all members of the guild
		const members = await guild.members.fetch()

		// Filter members that have one of the watched roles
		const targets = members.filter((member) =>
			member.roles.cache.some((role) => config.watch_roles.includes(role.id))
		)

		// Ban each target member
		for (const [_, member] of targets) {
			await performSafeBan(guild, member.user, config.delete_message_days)
		}
	} catch (error) {
		bunnyLog.error(`Error in auto moderation for guild ${guild.id}:`, error)
	}
}

/**
 * Performs a safe ban on a user.
 * @param {Discord.Guild} guild - The guild to ban the user in.
 * @param {Discord.User} user - The user to ban.
 * @param {number} deleteDays - The number of days to delete messages for.
 */
async function performSafeBan(
	guild: Discord.Guild,
	user: Discord.User,
	deleteDays: number
) {
	try {
		// Check if the user is already banned
		const banList = await guild.bans.fetch()

		// If the user is already banned, skip
		if (banList.has(user.id)) return

		// Add to banned users table
		const { error } = await supabase.from('banned_users').upsert({
			bot_id: client.user?.id ?? '',
			guild_id: guild.id,
			user_id: user.id,
			reason: 'Auto-mod: Bot-like behavior',
			banned_at: new Date().toISOString(),
		})

		// If there was an error, throw it
		if (error) throw error

		// Ban the user
		await guild.members.ban(user, {
			deleteMessageDays: deleteDays,
			reason: 'Automatic bot detection ban',
		})

		bunnyLog.success(`Banned user ${user.tag} (${user.id}) in ${guild.name}`)
	} catch (error) {
		bunnyLog.error(`Failed to ban ${user.tag}:`, error)
	}
}

/**
 * Starts the moderation scheduler for all guilds with auto moderation enabled.
 * It checks each guild for the moderation config and if enabled (and with watched roles),
 * schedules a separate job per guild.
 */
async function startModerationScheduler() {
	const scheduler = require('node-schedule')

	// Cancel any existing auto moderation jobs with a prefix "auto_mod_"
	for (const jobName of Object.keys(scheduler.scheduledJobs)) {
		if (jobName.startsWith('auto_mod_')) {
			scheduler.scheduledJobs[jobName].cancel()
		}
	}

	const guilds = [...client.guilds.cache.values()]
	const results = await Promise.all(
		guilds.map(async (guild) => {
			const config = (await api.getPluginConfig(
				client.user?.id ?? '',
				guild.id,
				'moderation'
			)) as DefaultConfigs['moderation'] | null
			return { guild, config }
		})
	)

	// Aggregate logs to avoid spamming
	let scheduledCount = 0
	let misconfiguredCount = 0
	for (const { guild, config } of results) {
		if (
			config?.enabled &&
			config?.watch_roles?.length &&
			config?.ban_interval
		) {
			const jobName = `auto_mod_${guild.id}`
			const schedule = require('node-schedule').scheduleJob
			schedule(jobName, `*/${config.ban_interval} * * * *`, () => {
				banBotLikeUsersForGuild(guild, config)
			})
			scheduledCount++
		} else {
			misconfiguredCount++
		}
	}

	// Log the results
	bunnyLog.server(
		`Auto-moderation scheduler started for ${scheduledCount} guilds`
	)
}

export { startModerationScheduler }
