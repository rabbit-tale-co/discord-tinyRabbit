import type * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import * as components from '@/discord/components/index.js'
import { bunnyLog } from 'bunny-log'
import { MessageFlags, ThumbnailBuilder } from 'discord.js'

/**
 * Handles the guild member join event.
 * @param {Discord.GuildMember} member - The member that joined the guild.
 */
async function handleMemberJoin(member: Discord.GuildMember) {
	// Get the config
	const config = await api.getPluginConfig(
		member.client.user.id,
		member.guild.id,
		'welcome_goodbye'
	)

	// Check if the plugin is enabled
	if (!config.enabled) {
		return
	}

	// Check if the welcome channel is set
	if (!config.welcome_channel_id) {
		return
	}

	// Get the welcome channel
	const welcome_channel = member.guild.channels.cache.get(
		config.welcome_channel_id
	) as Discord.TextChannel | undefined

	// Check if the welcome channel is found
	if (!welcome_channel) return

	// Assign join role if specified
	if (config.join_role_ids) {
		for (const role_id of config.join_role_ids) {
			const role = member.guild.roles.cache.get(role_id)
			if (role) {
				await member.roles.add(role).catch((error) => {
					bunnyLog.log(
						'Error',
						`Error adding role ${role_id} to ${member.user.username}: ${error}`
					)
				})
			} else {
				bunnyLog.log('Error', `Role with ID ${role_id} not found`)
			}
		}
	}

	// Send welcome message
	try {
		// Create thumbnail with user avatar
		const thumbnail = new ThumbnailBuilder().setURL(
			member.user.displayAvatarURL({ extension: 'png', size: 1024 })
		)

		// Create welcome message components
		if (config.components?.welcome) {
			const welcomeComponents = components.buildV2Components(
				(config.components.welcome
					.components as components.ComponentConfig[]) ?? [],
				member,
				member.guild
			)

			await welcome_channel.send({
				components: welcomeComponents,
				flags: MessageFlags.IsComponentsV2,
			})
		}
	} catch (error) {
		bunnyLog.log(
			'Error',
			`Error sending welcome message in guild ${member.guild.name}:`,
			{
				error,
				errorMessage: error.message,
				errorCode: error.code,
				errorStatus: error.status,
				errorMethod: error.method,
				errorUrl: error.url,
				errorBody: error.requestBody,
				errorRaw: error.rawError,
				guildId: member.guild.id,
				channelId: welcome_channel.id,
				userId: member.id,
			}
		)
	}
}

/**
 * Handles the guild member leave event.
 * @param {Discord.GuildMember} member - The member that left the guild.
 */
async function handleMemberLeave(
	member: Discord.GuildMember | Discord.PartialGuildMember
) {
	// Check if member is partial and fetch full member
	const resolvedMember = member.partial
		? await member.guild.members.fetch(member.id)
		: member

	if (!resolvedMember.guild) return

	const config = await api.getPluginConfig(
		resolvedMember.client.user.id,
		resolvedMember.guild.id,
		'welcome_goodbye'
	)

	if (!config.enabled) return

	const leave_channel = resolvedMember.guild.channels.cache.get(
		config.leave_channel_id ?? ''
	) as Discord.TextChannel | undefined

	if (!leave_channel) return

	// Send goodbye message using V2 components
	try {
		if (config.components?.goodbye) {
			// Ensure we have a full member
			if (resolvedMember.partial) {
				bunnyLog.log('Error', 'Cannot send goodbye message: Member is partial')
				return
			}

			// At this point we know resolvedMember is a full GuildMember
			const fullMember = resolvedMember as Discord.GuildMember

			const goodbyeComponents = components.buildV2Components(
				(config.components.goodbye
					.components as components.ComponentConfig[]) ?? [],
				fullMember,
				fullMember.guild
			)

			await leave_channel.send({
				components: goodbyeComponents,
				flags: MessageFlags.IsComponentsV2,
			})
		}
	} catch (error) {
		bunnyLog.log(
			'Error',
			`Error sending goodbye message in guild ${resolvedMember.guild.name}:`,
			{
				error,
				errorMessage: error.message,
				errorCode: error.code,
				errorStatus: error.status,
				errorMethod: error.method,
				errorUrl: error.url,
				guildId: resolvedMember.guild.id,
				channelId: leave_channel.id,
				userId: resolvedMember.id,
			}
		)
	}
}

export { handleMemberJoin, handleMemberLeave }
