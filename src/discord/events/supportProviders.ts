import { BunnyLogger, bunnyLog } from 'bunny-log'
import type * as Discord from 'discord.js'
import { MessageFlags } from 'discord.js'
import * as api from '@/discord/api/index.js'
import * as components from '@/discord/components/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'

/**
 * Handles Discord server boost events
 * @param {Discord.GuildMember | Discord.PartialGuildMember} oldMember - The member before the update
 * @param {Discord.GuildMember | Discord.PartialGuildMember} newMember - The member after the update
 */
async function handleBoostEvent(
	oldMember: Discord.GuildMember | Discord.PartialGuildMember,
	newMember: Discord.GuildMember | Discord.PartialGuildMember
) {
	// Ensure we have full GuildMember objects
	if (oldMember.partial || newMember.partial) {
		return
	}

	// Check if the member just started boosting
	const wasNotBoosting = !oldMember.premiumSince
	const isNowBoosting = newMember.premiumSince

	if (!wasNotBoosting || !isNowBoosting) {
		return
	}

	// Get the support providers config
	const config = await api.getPluginConfig(
		newMember.client.user.id,
		newMember.guild.id,
		'supportProviders'
	)

	// Check if the plugin is enabled
	if (!config.enabled) {
		return
	}

	// Check if Discord boost notifications are enabled
	if (!config.discord_boost?.enabled) {
		return
	}

	// Check if the boost channel is set
	if (!config.discord_boost.channel_id) {
		return
	}

	// Get the boost channel
	const boostChannel = newMember.guild.channels.cache.get(
		config.discord_boost.channel_id
	) as Discord.TextChannel | undefined

	// Check if the boost channel is found
	if (!boostChannel) {
		StatusLogger.error(
			`Boost channel not found: ${config.discord_boost.channel_id}`
		)
		return
	}

	try {
		// Send boost notification
		if (config.components?.discord_boost) {
			const boostComponents = components.buildV2Components(
				(config.components.discord_boost
					.components as components.ComponentConfig[]) ?? [],
				newMember as Discord.GuildMember,
				newMember.guild
			)

			await boostChannel.send({
				components: boostComponents,
				flags: MessageFlags.IsComponentsV2,
			})
		} else if (config.discord_boost.message) {
			// Fallback to simple message if no components
			const message = config.discord_boost.message
				.replace('{display_name}', newMember.displayName)
				.replace('{username}', newMember.user.username)
				.replace('{mention}', newMember.toString())

			await boostChannel.send(message)
		}

		StatusLogger.success(
			`Boost notification sent for ${newMember.displayName} in ${newMember.guild.name}`
		)
	} catch (error) {
		StatusLogger.error(
			`Error sending boost notification in guild ${newMember.guild.name}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

/**
 * Handles Patreon webhook events
 * @param {Discord.Guild} guild - The guild to send the notification to
 * @param {string} supporterName - The name of the Patreon supporter
 * @param {string} tier - The Patreon tier (optional)
 */
async function handlePatreonEvent(
	guild: Discord.Guild,
	supporterName: string,
	tier?: string
) {
	// Get the support providers config
	const config = await api.getPluginConfig(
		guild.client.user.id,
		guild.id,
		'supportProviders'
	)

	// Check if the plugin is enabled
	if (!config.enabled) {
		return
	}

	// Check if Patreon notifications are enabled
	if (!config.patreon?.enabled) {
		return
	}

	// Check if the Patreon channel is set
	if (!config.patreon.channel_id) {
		return
	}

	// Get the Patreon channel
	const patreonChannel = guild.channels.cache.get(config.patreon.channel_id) as
		| Discord.TextChannel
		| undefined

	// Check if the Patreon channel is found
	if (!patreonChannel) {
		StatusLogger.error(
			`Patreon channel not found: ${config.patreon.channel_id}`
		)
		return
	}

	try {
		// Send Patreon notification
		if (config.components?.patreon) {
			const patreonComponents = components.buildV2Components(
				(config.components.patreon
					.components as components.ComponentConfig[]) ?? [],
				{ displayName: supporterName } as Discord.GuildMember,
				guild
			)

			await patreonChannel.send({
				components: patreonComponents,
				flags: MessageFlags.IsComponentsV2,
			})
		} else if (config.patreon.message) {
			// Fallback to simple message if no components
			let message = config.patreon.message
				.replace('{display_name}', supporterName)
				.replace('{username}', supporterName)

			if (tier) {
				message = message.replace('{tier}', tier)
			}

			await patreonChannel.send(message)
		}

		StatusLogger.success(
			`Patreon notification sent for ${supporterName} in ${guild.name}`
		)
	} catch (error) {
		StatusLogger.error(
			`Error sending Patreon notification in guild ${guild.name}: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

export { handleBoostEvent, handlePatreonEvent }
