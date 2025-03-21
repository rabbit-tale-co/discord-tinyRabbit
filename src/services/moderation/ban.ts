import { bunnyLog } from 'bunny-log'
import * as api from '@/api/index.js'
import * as Discord from 'discord.js'
import type { DefaultConfigs } from '@/types/plugins.js'

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
		// Check if bot has permission to ban members
		const botMember = await guild.members.fetchMe()

		if (!botMember.permissions.has(Discord.PermissionFlagsBits.BanMembers)) {
			bunnyLog.warn(
				`Cannot ban users in ${guild.name}: Bot lacks BAN_MEMBERS permission`
			)
			return
		}

		// Detailed permission checking
		try {
			// Check if the bot's role can modify the server in any way
			if (!botMember.permissions.has(Discord.PermissionFlagsBits.ManageGuild)) {
				bunnyLog.warn(
					`Bot may have insufficient server management permissions in ${guild.name}`
				)
			}
		} catch (permCheckError) {
			bunnyLog.warn(
				`Error checking detailed permissions: ${permCheckError instanceof Error ? permCheckError.message : 'Unknown'}`
			)
			// Continue anyway - this is just extra debugging
		}

		// Check if the user is already banned
		const banList = await guild.bans.fetch()
		if (banList.has(user.id)) {
			bunnyLog.info(
				`User ${user.tag} (${user.id}) is already banned in ${guild.name}`
			)
			return
		}

		// Try to check role hierarchy if the user is in the guild
		try {
			const targetMember = await guild.members.fetch(user.id)
			const botPosition = botMember.roles.highest.position
			const targetPosition = targetMember.roles.highest.position

			// Check for guild owner (cannot be banned regardless of permissions)
			if (targetMember.id === guild.ownerId) {
				bunnyLog.warn(
					`Cannot ban ${user.tag} (${user.id}) in ${guild.name}: Target is the server owner`
				)
				return
			}

			// Check role hierarchy
			if (targetPosition >= botPosition) {
				bunnyLog.warn(
					`Cannot ban ${user.tag} (${user.id}) in ${guild.name}: Target has higher or equal role position. Bot's highest role is at position ${botPosition}, target's highest role is at position ${targetPosition}.`
				)
				return
			}
		} catch (memberError) {
			// If we can't fetch the member, they might not be in the guild - proceed anyway
			bunnyLog.info(
				`Could not fetch member object for ${user.tag}, assuming they're not in the guild and proceeding with ban attempt`
			)
		}

		// Use the documented guild.bans.create() method
		try {
			// Debug: check if user is an owner
			if (user.id === guild.ownerId) {
				bunnyLog.warn(`Cannot ban ${user.tag}: user is the guild owner`)
				return
			}

			const banOptions = {
				deleteMessageSeconds: deleteDays * 24 * 60 * 60, // Convert days to seconds
				reason: 'Suspicious or spam account',
			}

			// bunnyLog.info(`Ban options: ${JSON.stringify(banOptions)}`)

			try {
				// Attempt API call within its own try/catch for better error isolation
				const banResult = await guild.bans.create(user.id, banOptions)

				bunnyLog.success(
					`Successfully banned ${
						typeof banResult === 'string'
							? user.tag
							: 'tag' in banResult
								? banResult.tag
								: user.tag
					} (${user.id}) in ${guild.name}`
				)
			} catch (directBanError) {
				// Show as much information as possible about the error
				bunnyLog.error(
					`Direct ban error: ${directBanError instanceof Error ? directBanError.message : 'Non-error object thrown'}`
				)
			}
		} catch (banError) {
			// Log detailed error information
			bunnyLog.error(`Failed to ban ${user.tag} (${user.id}) in ${guild.name}`)

			// Try to get detailed error info
			if (banError instanceof Discord.DiscordAPIError) {
				bunnyLog.error(
					`API Error details: code=${banError.code}, status=${banError.status}, method=${banError.method}, message=${banError.message}`
				)
			} else {
				// For completely unknown errors
				bunnyLog.error(
					`Unknown error type: ${typeof banError}, Value: ${String(banError)}`
				)
			}

			throw banError // Re-throw to be caught by outer catch
		}
	} catch (error) {
		bunnyLog.error(
			`Ban operation failed for ${user.tag} (${user.id}) in ${guild.name}: ${error}`
		)
	}
}

/**
 * Bans users who are likely bots in a specific guild.
 */
async function banBotLikeUsersForGuild(
	guild: Discord.Guild,
	config: DefaultConfigs['moderation']
) {
	try {
		// Check if bot has permission to ban members
		const botMember = await guild.members.fetchMe()
		if (!botMember.permissions.has(Discord.PermissionFlagsBits.BanMembers)) {
			bunnyLog.warn(
				`Cannot perform auto-moderation in ${guild.name}: Bot lacks BAN_MEMBERS permission`
			)
			return
		}

		// Fetch all members of the guild
		const members = await guild.members.fetch()

		// Filter members that have one of the watched roles
		const targets = members.filter((member) =>
			member.roles.cache.some((role) => config.watch_roles.includes(role.id))
		)

		for (const [_, member] of targets) {
			await performSafeBan(guild, member.user, config.delete_message_days)
		}
	} catch (error) {
		bunnyLog.error(
			`Error in auto moderation for guild ${guild.id} (${guild.name}): ${error}`
		)
	}
}

/**
 * Starts the moderation scheduler for all guilds with auto moderation enabled.
 * It checks each guild for the moderation config and if enabled (and with watched roles),
 * schedules a separate job per guild.
 */
async function startModerationScheduler(client: Discord.Client) {
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
