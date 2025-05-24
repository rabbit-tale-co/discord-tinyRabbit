import type * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import * as utils from '@/utils/index.js'
import * as components from '@/components/index.js'
import * as V2 from 'discord-components-v2'
import { bunnyLog } from 'bunny-log'
import { MessageFlags, ThumbnailBuilder } from 'discord.js'

// Add proper type definitions
type EmbedFieldConfig = {
	name: string
	value: string
	inline?: boolean
}

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
					bunnyLog.error(
						`Error adding role ${role_id} to ${member.user.username}: ${error}`
					)
				})
			} else {
				bunnyLog.error(`Role with ID ${role_id} not found`)
			}
		}
	}

	// Send welcome message
	if (config.type === 'embed') {
		if (!config.embed_welcome) {
			const owner = await member.guild.fetchOwner()
			if (owner) {
				try {
					await owner.send(
						`⚠️ [${member.guild.name}] Welcome Plugin Configuration Error:\nThe embed configuration is missing from your welcome plugin settings.\nPlease update your dashboard configuration to provide a valid embed for welcome messages.`
					)
				} catch (err) {
					bunnyLog.error(
						`Could not DM owner of guild ${member.guild.name} about welcome plugin misconfiguration: ${err}`
					)
				}
			}
			return
		}

		try {
			// Create thumbnail with user avatar
			const thumbnail = new ThumbnailBuilder().setURL(
				member.user.displayAvatarURL({ extension: 'png', size: 1024 })
			)

			// Create title and description
			const title = V2.makeTextDisplay(
				utils.replacePlaceholders(
					config.embed_welcome.title ?? 'Welcome!',
					member,
					member.guild
				)
			)
			const description = V2.makeTextDisplay(
				utils.replacePlaceholders(
					config.embed_welcome.description ?? '',
					member,
					member.guild
				)
			)

			// Create header section with thumbnail
			const headerSection = V2.makeSection([title, description], thumbnail)

			// Create fields if they exist
			let fieldsSection = null
			if (config.embed_welcome.fields?.length) {
				const fieldTexts = config.embed_welcome.fields.map(
					(field: EmbedFieldConfig) =>
						V2.makeTextDisplay(
							`**${utils.replacePlaceholders(field.name, member, member.guild)}**\n${utils.replacePlaceholders(
								field.value,
								member,
								member.guild
							)}`
						)
				)
				fieldsSection = V2.makeSection(fieldTexts, thumbnail)
			}

			// Create image gallery with banner if available
			let gallery = null
			if (config.embed_welcome.image?.url) {
				gallery = V2.makeMediaGallery([
					{
						media: {
							url: utils.replacePlaceholders(
								config.embed_welcome.image.url,
								member,
								member.guild
							),
						},
					},
				])
			}

			// Create footer if it exists
			let footerSection = null
			if (config.embed_welcome.footer) {
				const footerText = V2.makeTextDisplay(
					utils.replacePlaceholders(
						config.embed_welcome.footer.text ?? '',
						member,
						member.guild
					)
				)
				footerSection = V2.makeSection([footerText], thumbnail)
			}

			// Combine all sections
			const sections = [headerSection]
			if (fieldsSection) sections.push(fieldsSection)
			if (gallery) sections.push(gallery)
			if (footerSection) sections.push(footerSection)

			// Send the welcome message
			await welcome_channel.send({
				components: sections,
				flags: MessageFlags.IsComponentsV2,
			})
		} catch (error) {
			bunnyLog.error(
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
	} else if (config.type === 'text' || config.components?.welcome) {
		if (!config.components?.welcome) return

		try {
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
		} catch (error) {
			bunnyLog.error(
				`Error sending welcome components in guild ${member.guild.name}:`,
				{
					error: error.message,
					errorCode: error.code,
					errorStatus: error.status,
					errorMethod: error.method,
					errorUrl: error.url,
					guildId: member.guild.id,
					channelId: welcome_channel.id,
					userId: member.id,
					components: JSON.stringify(config.components.welcome.components),
				}
			)
		}
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

	if (config.type === 'embed') {
		if (!config.embed_leave) {
			const owner = await resolvedMember.guild.fetchOwner()
			if (owner) {
				try {
					await owner.send(
						`⚠️ [${resolvedMember.guild.name}] Leave Plugin Configuration Error:\nThe embed configuration is missing from your leave plugin settings.\nPlease update your dashboard configuration to provide a valid embed for leave messages.`
					)
				} catch (err) {
					bunnyLog.error(
						`Could not DM owner of guild ${resolvedMember.guild.name} about leave plugin misconfiguration: ${err}`
					)
				}
			}
			return
		}

		try {
			// Create thumbnail with user avatar
			const thumbnail = new ThumbnailBuilder().setURL(
				resolvedMember.user.displayAvatarURL({ extension: 'png', size: 1024 })
			)

			// Create title and description
			const title = V2.makeTextDisplay(
				utils.replacePlaceholders(
					config.embed_leave.title ?? 'Goodbye!',
					resolvedMember,
					resolvedMember.guild
				)
			)
			const description = V2.makeTextDisplay(
				utils.replacePlaceholders(
					config.embed_leave.description ?? '',
					resolvedMember,
					resolvedMember.guild
				)
			)

			// Create header section with thumbnail
			const headerSection = V2.makeSection([title, description], thumbnail)

			// Create fields if they exist
			let fieldsSection = null
			if (config.embed_leave.fields?.length) {
				const fieldTexts = config.embed_leave.fields.map(
					(field: EmbedFieldConfig) =>
						V2.makeTextDisplay(
							`**${utils.replacePlaceholders(field.name, resolvedMember, resolvedMember.guild)}**\n${utils.replacePlaceholders(
								field.value,
								resolvedMember,
								resolvedMember.guild
							)}`
						)
				)
				fieldsSection = V2.makeSection(fieldTexts, thumbnail)
			}

			// Create image gallery with banner if available
			let gallery = null
			if (config.embed_leave.image?.url) {
				gallery = V2.makeMediaGallery([
					{
						media: {
							url: utils.replacePlaceholders(
								config.embed_leave.image.url,
								resolvedMember,
								resolvedMember.guild
							),
						},
					},
				])
			}

			// Create footer if it exists
			let footerSection = null
			if (config.embed_leave.footer) {
				const footerText = V2.makeTextDisplay(
					utils.replacePlaceholders(
						config.embed_leave.footer.text ?? '',
						resolvedMember,
						resolvedMember.guild
					)
				)
				footerSection = V2.makeSection([footerText], thumbnail)
			}

			// Combine all sections
			const sections = [headerSection]
			if (fieldsSection) sections.push(fieldsSection)
			if (gallery) sections.push(gallery)
			if (footerSection) sections.push(footerSection)

			// Send the leave message
			await leave_channel.send({
				components: sections,
				flags: MessageFlags.IsComponentsV2,
			})
		} catch (error) {
			bunnyLog.error(
				`Error sending leave message in guild ${resolvedMember.guild.name}:`,
				{
					error,
					errorMessage: error.message,
					errorCode: error.code,
					errorStatus: error.status,
					errorMethod: error.method,
					errorUrl: error.url,
					errorBody: error.requestBody,
					errorRaw: error.rawError,
					guildId: resolvedMember.guild.id,
					channelId: leave_channel.id,
					userId: resolvedMember.id,
				}
			)
		}
	} else if (config.type === 'text' || config.components?.goodbye) {
		if (!config.components?.goodbye) return

		// Ensure we have a full member
		if (resolvedMember.partial) {
			bunnyLog.error('Cannot send goodbye message: Member is partial')
			return
		}

		// At this point we know resolvedMember is a full GuildMember
		const fullMember = resolvedMember as Discord.GuildMember

		try {
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
		} catch (error) {
			bunnyLog.error(
				`Error sending goodbye components in guild ${fullMember.guild.name}:`,
				{
					error: error.message,
					errorCode: error.code,
					errorStatus: error.status,
					errorMethod: error.method,
					errorUrl: error.url,
					guildId: fullMember.guild.id,
					channelId: leave_channel.id,
					userId: fullMember.id,
					components: JSON.stringify(config.components.goodbye.components),
				}
			)
		}
	}
}

export { handleMemberJoin, handleMemberLeave }
