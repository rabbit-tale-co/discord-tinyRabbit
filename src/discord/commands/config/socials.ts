import * as Discord from 'discord.js'
import * as V2 from 'discord-components-v2'
import { getPluginConfig, setPluginConfig } from '@/discord/api/plugins.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import type { DefaultConfigs } from '@/types/plugins.js'

/**
 * Socials Connection Configuration Command
 * Handles configuration for social media account linking and Twitch stream notifications
 */
export async function socialsConfig(
	inter: Discord.ChatInputCommandInteraction | Discord.ButtonInteraction
): Promise<void> {
	if (!inter.guild) {
		await inter.reply({
			content: '❌ This command can only be used in a server.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	const hasPerms = inter.memberPermissions?.has(
		Discord.PermissionsBitField.Flags.ManageGuild
	)

	if (!hasPerms) {
		await inter.editReply({
			content: '❌ You need the **Manage Server** permission to configure socials.',
		})
		return
	}

	try {
		const config = await getPluginConfig(
			inter.client.user.id,
			inter.guild.id,
			'connectSocial'
		)

		await handleInitialConfig(inter, config)
	} catch (error) {
		StatusLogger.error('[Socials Config] Error in main config function:', error)
		await inter.editReply({
			content: '❌ An error occurred while loading the configuration.',
		})
	}
}

async function handleInitialConfig(
	inter: Discord.ChatInputCommandInteraction | Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	const title = V2.makeTextDisplay(
		'# 🔗 Socials Connection Configuration\n\nConfigure social media account linking and Twitch stream notifications.'
	)

	const statusSection = V2.makeTextDisplay(
		`## 📊 Current Status\n` +
		`**Plugin:** ${config.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
		`**Twitch Stream Notifications:** ${config.twitch.stream_notifications.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
		`**Notification Channel:** ${config.twitch.stream_notifications.channel_id ? `<#${config.twitch.stream_notifications.channel_id}>` : '❌ Not Set'}`
	)

	const platformsSection = V2.makeTextDisplay(
		`## 🌐 Supported Platforms\n` +
		`• **Minecraft** - Link Minecraft accounts\n` +
		`• **YouTube** - Link YouTube channels\n` +
		`• **Twitter** - Link Twitter accounts\n` +
		`• **TikTok** - Link TikTok accounts\n` +
		`• **Twitch** - Link Twitch accounts + Stream notifications`
	)

	const separator1 = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	const separator2 = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create main action buttons
	const toggleButton = V2.makeButton({
		custom_id: 'socials_toggle',
		label: config.enabled ? 'Disable Plugin' : 'Enable Plugin',
		style: config.enabled ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Success,
	})

	const twitchConfigButton = V2.makeButton({
		custom_id: 'socials_twitch_config',
		label: 'Twitch Settings',
		style: Discord.ButtonStyle.Primary,
	})

	const rolesConfigButton = V2.makeButton({
		custom_id: 'socials_roles_config',
		label: 'Role Settings',
		style: Discord.ButtonStyle.Secondary,
	})

	const actionRow = V2.makeActionRow([toggleButton, twitchConfigButton, rolesConfigButton])

	await inter.editReply({
		components: [
			title,
			separator1,
			statusSection,
			separator2,
			platformsSection,
			actionRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

export async function handleSocialsButtonClick(inter: Discord.ButtonInteraction): Promise<void> {
	if (!inter.guild) return

	try {
		const config = await getPluginConfig(
			inter.client.user.id,
			inter.guild.id,
			'connectSocial'
		)

		switch (inter.customId) {
			case 'socials_toggle':
				await handleToggle(inter, config)
				break
			case 'socials_twitch_config':
				await handleTwitchConfig(inter, config)
				break
			case 'socials_roles_config':
				await handleRolesConfig(inter, config)
				break
			case 'socials_twitch_toggle':
				await handleTwitchToggle(inter, config)
				break
			case 'socials_twitch_channel_select':
				await handleTwitchChannelSelect(inter as unknown as Discord.ChannelSelectMenuInteraction)
				break
			case 'socials_twitch_role_select':
				await handleTwitchRoleSelect(inter as unknown as Discord.RoleSelectMenuInteraction)
				break
			case 'socials_twitch_edit_message':
				await handleTwitchEditMessage(inter, config)
				break
			case 'socials_twitch_reset_message':
				await handleTwitchResetMessage(inter, config)
				break
			case 'socials_twitch_clear_role':
				await handleTwitchClearRole(inter, config)
				break
			case 'socials_back_to_main':
				await handleInitialConfig(inter, config)
				break
			default:
				StatusLogger.warn(`[Socials Config] Unknown button: ${inter.customId}`)
		}
	} catch (error) {
		StatusLogger.error('[Socials Config] Error handling button click:', error)
		await inter.followUp({
			content: '❌ An error occurred while processing your request.',
			flags: Discord.MessageFlags.Ephemeral,
		})
	}
}

async function handleToggle(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	config.enabled = !config.enabled
	await setPluginConfig(inter.client.user.id, inter.guild!.id, 'connectSocial', config)

	await inter.followUp({
		content: `✅ Socials plugin ${config.enabled ? 'enabled' : 'disabled'}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleInitialConfig(inter, config)
}

async function handleTwitchConfig(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	const title = V2.makeTextDisplay(
		'# 🎮 Twitch Stream Notifications\n\nConfigure Twitch stream notifications for linked accounts.'
	)

	const statusSection = V2.makeTextDisplay(
		`## 📊 Current Settings\n` +
		`**Notifications:** ${config.twitch.stream_notifications.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
		`**Channel:** ${config.twitch.stream_notifications.channel_id ? `<#${config.twitch.stream_notifications.channel_id}>` : '❌ Not Set'}\n` +
		`**Ping Role:** ${config.twitch.stream_notifications.ping_role_id ? `<@&${config.twitch.stream_notifications.ping_role_id}>` : '❌ Not Set'}`
	)

	const messageSection = V2.makeTextDisplay(
		`## 💬 Notification Message\n\`\`\`\n${config.twitch.stream_notifications.message || getDefaultTwitchMessage()}\n\`\`\``
	)

	const separator1 = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	const separator2 = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create action buttons
	const toggleButton = V2.makeButton({
		custom_id: 'socials_twitch_toggle',
		label: config.twitch.stream_notifications.enabled ? 'Disable Notifications' : 'Enable Notifications',
		style: config.twitch.stream_notifications.enabled ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Success,
	})

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'socials_twitch_channel_select',
		placeholder: 'Select notification channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	if (config.twitch.stream_notifications.channel_id) {
		channelSelect.setDefaultChannels([config.twitch.stream_notifications.channel_id])
	}

	const roleSelect = V2.makeRoleSelect({
		custom_id: 'socials_twitch_role_select',
		placeholder: 'Select ping role (optional)',
	})

	if (config.twitch.stream_notifications.ping_role_id) {
		roleSelect.setDefaultRoles([config.twitch.stream_notifications.ping_role_id])
	}

	const editMessageButton = V2.makeButton({
		custom_id: 'socials_twitch_edit_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetMessageButton = V2.makeButton({
		custom_id: 'socials_twitch_reset_message',
		label: 'Reset Message',
		style: Discord.ButtonStyle.Secondary,
	})

	const clearRoleButton = V2.makeButton({
		custom_id: 'socials_twitch_clear_role',
		label: 'Clear Ping Role',
		style: Discord.ButtonStyle.Danger,
	})

	const backButton = V2.makeButton({
		custom_id: 'socials_back_to_main',
		label: '← Back',
		style: Discord.ButtonStyle.Secondary,
	})

	const toggleRow = V2.makeActionRow([toggleButton])
	const channelRow = V2.makeActionRow([channelSelect])
	const roleRow = V2.makeActionRow([roleSelect])
	const messageRow = V2.makeActionRow([editMessageButton, resetMessageButton])
	const roleActionRow = V2.makeActionRow([clearRoleButton])
	const backRow = V2.makeActionRow([backButton])

	await inter.editReply({
		components: [
			title,
			separator1,
			statusSection,
			separator2,
			messageSection,
			toggleRow,
			channelRow,
			roleRow,
			roleActionRow,
			messageRow,
			backRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRolesConfig(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	const title = V2.makeTextDisplay(
		'# 🎭 Role Assignment Settings\n\nConfigure roles to assign when users link their social accounts.'
	)

	const rolesSection = V2.makeTextDisplay(
		`## 🎯 Current Role Assignments\n` +
		`**Minecraft:** ${config.minecraft.role_id ? `<@&${config.minecraft.role_id}>` : '❌ Not Set'}\n` +
		`**YouTube:** ${config.youtube.role_id ? `<@&${config.youtube.role_id}>` : '❌ Not Set'}\n` +
		`**Twitter:** ${config.twitter.role_id ? `<@&${config.twitter.role_id}>` : '❌ Not Set'}\n` +
		`**TikTok:** ${config.tiktok.role_id ? `<@&${config.tiktok.role_id}>` : '❌ Not Set'}\n` +
		`**Twitch:** ${config.twitch.role_id ? `<@&${config.twitch.role_id}>` : '❌ Not Set'}`
	)

	const separator1 = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	const backButton = V2.makeButton({
		custom_id: 'socials_back_to_main',
		label: '← Back',
		style: Discord.ButtonStyle.Secondary,
	})

	const backRow = V2.makeActionRow([backButton])

	await inter.editReply({
		components: [
			title,
			separator1,
			rolesSection,
			backRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleTwitchToggle(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	config.twitch.stream_notifications.enabled = !config.twitch.stream_notifications.enabled
	await setPluginConfig(inter.client.user.id, inter.guild!.id, 'connectSocial', config)

	await inter.followUp({
		content: `✅ Twitch stream notifications ${config.twitch.stream_notifications.enabled ? 'enabled' : 'disabled'}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleTwitchConfig(inter, config)
}

async function handleTwitchChannelSelect(inter: Discord.ChannelSelectMenuInteraction): Promise<void> {
	const config = await getPluginConfig(
		inter.client.user.id,
		inter.guild!.id,
		'connectSocial'
	)

	const channelId = inter.values[0]
	config.twitch.stream_notifications.channel_id = channelId
	await setPluginConfig(inter.client.user.id, inter.guild!.id, 'connectSocial', config)

	await inter.followUp({
		content: `✅ Twitch notification channel set to <#${channelId}>`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleTwitchConfig(inter as unknown as Discord.ButtonInteraction, config)
}

async function handleTwitchRoleSelect(inter: Discord.RoleSelectMenuInteraction): Promise<void> {
	const config = await getPluginConfig(
		inter.client.user.id,
		inter.guild!.id,
		'connectSocial'
	)

	const roleId = inter.values[0]
	config.twitch.stream_notifications.ping_role_id = roleId
	await setPluginConfig(inter.client.user.id, inter.guild!.id, 'connectSocial', config)

	await inter.followUp({
		content: `✅ Twitch ping role set to <@&${roleId}>`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleTwitchConfig(inter as unknown as Discord.ButtonInteraction, config)
}

async function handleTwitchEditMessage(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	const modal = new Discord.ModalBuilder()
		.setCustomId('socials_twitch_message_modal')
		.setTitle('Edit Twitch Notification Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('twitch_message')
		.setLabel('Notification Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setPlaceholder('Enter your custom message...')
		.setValue(config.twitch.stream_notifications.message || getDefaultTwitchMessage())
		.setMaxLength(1000)
		.setRequired(true)

	const actionRow = new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(messageInput)
	modal.addComponents(actionRow)

	await inter.showModal(modal)
}

async function handleTwitchResetMessage(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	config.twitch.stream_notifications.message = null
	await setPluginConfig(inter.client.user.id, inter.guild!.id, 'connectSocial', config)

	await inter.followUp({
		content: '✅ Twitch notification message reset to default',
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleTwitchConfig(inter, config)
}

async function handleTwitchClearRole(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['connectSocial']
): Promise<void> {
	config.twitch.stream_notifications.ping_role_id = null
	await setPluginConfig(inter.client.user.id, inter.guild!.id, 'connectSocial', config)

	await inter.followUp({
		content: '✅ Twitch ping role cleared',
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleTwitchConfig(inter, config)
}

export async function handleSocialsModalSubmit(inter: Discord.ModalSubmitInteraction): Promise<void> {
	if (!inter.guild) return

	try {
		const config = await getPluginConfig(
			inter.client.user.id,
			inter.guild.id,
			'connectSocial'
		)

		switch (inter.customId) {
			case 'socials_twitch_message_modal': {
				const message = inter.fields.getTextInputValue('twitch_message')
				config.twitch.stream_notifications.message = message
				await setPluginConfig(inter.client.user.id, inter.guild.id, 'connectSocial', config)

				await inter.reply({
					content: '✅ Twitch notification message updated',
					flags: Discord.MessageFlags.Ephemeral,
				})

				await handleTwitchConfig(inter as unknown as Discord.ButtonInteraction, config)
				break
			}
		}
	} catch (error) {
		StatusLogger.error('[Socials Config] Error handling modal submit:', error)
		await inter.reply({
			content: '❌ An error occurred while saving your changes.',
			flags: Discord.MessageFlags.Ephemeral,
		})
	}
}

function getDefaultTwitchMessage(): string {
	return `🎮 **{user_name}** is now live on Twitch!\n📺 **{title}**\n🎯 Playing: **{game_name}**\n👀 Viewers: **{viewer_count}**\n🔗 https://twitch.tv/{user_login}`
}
