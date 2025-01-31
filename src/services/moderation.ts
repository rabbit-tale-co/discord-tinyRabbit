import { client } from '../index.js'
import { bunnyLog } from 'bunny-log'
import * as api from '@/api/index.js'
import type * as Discord from 'discord.js'
import supabase from '../db/supabase.js'

/**
 * Bans users who are likely bots.
 */
async function banBotLikeUsers() {
	try {
		// Get all guilds
		const guilds = client.guilds.cache.values()

		// Iterate over each guild
		for (const guild of guilds) {
			const config = await api.getPluginConfig(
				client.user?.id ?? '',
				guild.id,
				'moderation'
			)

			// Check if the plugin is enabled and if there are any watch roles
			if (!config.enabled || !config.watch_roles?.length) continue

			// Get all members with watched roles
			const members = await guild.members.fetch()

			// Filter members with watched roles
			const targets = members.filter((member) =>
				member.roles.cache.some((role) => config.watch_roles.includes(role.id))
			)

			// Iterate over each target member
			for (const [_, member] of targets) {
				await performSafeBan(guild, member.user, config.delete_message_days)
			}
		}
	} catch (error) {
		bunnyLog.error('Error in auto moderation:', error)
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
 * Starts the moderation scheduler.
 */
async function startModerationScheduler() {
	const scheduler = require('node-schedule')
	const config = await api.getPluginConfig(
		client.user?.id ?? '',
		process.env.GUILD_ID ?? '',
		'moderation'
	)

	// Clear existing job if any
	if (scheduler.scheduledJobs.auto_moderation) {
		scheduler.scheduledJobs.auto_moderation.cancel()
	}

	// Schedule new job
	if (config.enabled) {
		const schedule = require('node-schedule').scheduleJob
		schedule(
			'auto_moderation',
			`*/${config.ban_interval} * * * *`,
			banBotLikeUsers
		)
		bunnyLog.server(
			`Auto-moderation scheduler started (interval: ${config.ban_interval} mins)`
		)
	}
}

export { startModerationScheduler }
