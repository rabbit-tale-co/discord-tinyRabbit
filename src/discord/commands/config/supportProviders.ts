import * as Discord from 'discord.js'
import * as V2 from 'discord-components-v2'
import { getPluginConfig, updatePluginConfig } from '@/discord/api/index.js'
import type { ComponentsV2, DefaultConfigs } from '@/types/plugins.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as utils from '@/utils/index.js'

/* -------------------------------------------------------------------------- */
/*                              SECTION BUILDERS                               */
/* -------------------------------------------------------------------------- */

const SECTION_BUILDERS = {
	supportProvidersSystem: (
		config: DefaultConfigs['supportProviders'],
		guild?: Discord.Guild
	) => {
		const titleSection = V2.makeSection(
			[
				'## 🎉 **Boost Support Configuration**',
				'> Configure Discord boost and Patreon notifications for your server.',
			],
			V2.makeButton({
				custom_id: 'boost_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Settings**',
				`**Discord Boost**: ${config.discord_boost?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
				`**Discord Channel**: ${config.discord_boost?.channel_id ? `<#${config.discord_boost.channel_id}>` : '❌ Not Set'}`,
				`**Patreon**: ${config.patreon?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
				`**Patreon Channel**: ${config.patreon?.channel_id ? `<#${config.patreon.channel_id}>` : '❌ Not Set'}`,
				'',
				'### 📝 **Available Variables**',
				"-# - `{display_name}` - Member's display name",
				"-# - `{username}` - Member's username",
				'-# - `{mention}` - Member mention',
				'-# - `{tier}` - Patreon tier (Patreon only)',
				'',
				'### 🎨 **Advanced Editor**',
				'-# 🚧 Advanced component editor will be available in the web dashboard soon!',
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
		}
	},

	discordBoostConfig: (
		config: DefaultConfigs['supportProviders'],
		guild?: Discord.Guild
	) => {
		const titleSection = V2.makeSection(
			[
				'## 🎉 **Discord Boost Configuration**',
				'> Configure Discord server boost notifications.',
			],
			V2.makeButton({
				custom_id: 'boost_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const currentMessage = getCurrentDiscordBoostMessage(config)
		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Discord Boost Settings**',
				`**Status**: ${config.discord_boost?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
				`**Channel**: ${config.discord_boost?.channel_id ? `<#${config.discord_boost.channel_id}>` : '❌ Not Set'}`,
				`**Message**: ${currentMessage !== getDefaultDiscordBoostMessage() ? '✅ Configured' : '❌ Default'}`,
				'',
				currentMessage
					? `### 🎭 **Current Message Template**\n\`\`\`${currentMessage}\`\`\``
					: '',
				currentMessage
					? `### ✨ **Rendered Preview** (with sample data)\n${generateMessagePreview(currentMessage)}`
					: '',
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
		}
	},

	patreonConfig: (
		config: DefaultConfigs['supportProviders'],
		guild?: Discord.Guild
	) => {
		const titleSection = V2.makeSection(
			[
				'## 💖 **Patreon Configuration**',
				'> Configure Patreon supporter notifications.',
			],
			V2.makeButton({
				custom_id: 'boost_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const currentMessage = getCurrentPatreonMessage(config)
		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Patreon Settings**',
				`**Status**: ${config.patreon?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
				`**Channel**: ${config.patreon?.channel_id ? `<#${config.patreon.channel_id}>` : '❌ Not Set'}`,
				`**Message**: ${currentMessage !== getDefaultPatreonMessage() ? '✅ Configured' : '❌ Default'}`,
				'',
				currentMessage
					? `### 🎭 **Current Message Template**\n\`\`\`${currentMessage}\`\`\``
					: '',
				currentMessage
					? `### ✨ **Rendered Preview** (with sample data)\n${generateMessagePreview(currentMessage)}`
					: '',
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
		}
	},

	githubSponsorsConfig: (
		config: DefaultConfigs['supportProviders'],
		guild?: Discord.Guild
	) => {
		const titleSection = V2.makeSection(
			[
				'## ⭐ **GitHub Sponsors Configuration**',
				'> Configure GitHub Sponsors notifications.',
			],
			V2.makeButton({
				custom_id: 'boost_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const currentMessage = getCurrentGitHubSponsorsMessage(config)
		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current GitHub Sponsors Settings**',
				`**Status**: ${config.github_sponsors?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
				`**Channel**: ${config.github_sponsors?.channel_id ? `<#${config.github_sponsors.channel_id}>` : '❌ Not Set'}`,
				`**Message**: ${currentMessage !== getDefaultGitHubSponsorsMessage() ? '✅ Configured' : '❌ Default'}`,
				'',
				currentMessage
					? `### 🎭 **Current Message Template**\n\`\`\`${currentMessage}\`\`\``
					: '',
				currentMessage
					? `### ✨ **Rendered Preview** (with sample data)\n${generateMessagePreview(currentMessage)}`
					: '',
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
		}
	},
}

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                               */
/* -------------------------------------------------------------------------- */

/**
 * Get current Discord boost message with proper priority
 */
function getCurrentDiscordBoostMessage(
	config: DefaultConfigs['supportProviders']
): string {
	return (
		(
			config.components?.discord_boost?.components?.[0] as {
				text?: string
			}
		)?.text ||
		config.discord_boost?.message ||
		getDefaultDiscordBoostMessage()
	)
}

/**
 * Get default Discord boost message
 */
function getDefaultDiscordBoostMessage(): string {
	return '🎉 **{display_name}** just boosted the server! Thank you for your support!'
}

/**
 * Get current Patreon message with proper priority
 */
function getCurrentPatreonMessage(
	config: DefaultConfigs['supportProviders']
): string {
	return (
		(
			config.components?.patreon?.components?.[0] as {
				text?: string
			}
		)?.text ||
		config.patreon?.message ||
		getDefaultPatreonMessage()
	)
}

/**
 * Get default Patreon message
 */
function getDefaultPatreonMessage(): string {
	return '💖 **{display_name}** just became a Patreon supporter! Thank you for your support!'
}

/**
 * Get current GitHub Sponsors message with proper priority
 */
function getCurrentGitHubSponsorsMessage(
	config: DefaultConfigs['supportProviders']
): string {
	return (
		(
			config.components?.github_sponsors?.components?.[0] as {
				text?: string
			}
		)?.text ||
		config.github_sponsors?.message ||
		getDefaultGitHubSponsorsMessage()
	)
}

/**
 * Get default GitHub Sponsors message
 */
function getDefaultGitHubSponsorsMessage(): string {
	return '⭐ **{display_name}** just became a GitHub sponsor! Thank you for your support!'
}

/**
 * Load boost support configuration from database
 */
async function loadConfig(
	inter: Discord.Interaction
): Promise<DefaultConfigs['supportProviders']> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	return await getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'supportProviders'
	)
}

/**
 * Save boost support configuration to database
 */
async function saveConfig(
	inter: Discord.Interaction,
	config: DefaultConfigs['supportProviders']
): Promise<void> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	await updatePluginConfig(
		inter.client.user.id,
		inter.guildId,
		'supportProviders',
		config
	)
}

/**
 * Generate a preview of message with sample data
 */
function generateMessagePreview(message: string): string {
	// Sample data for preview
	const sampleData = {
		display_name: 'John Doe',
		username: 'johndoe',
		mention: '<@123456789>',
		tier: 'Premium',
	}

	let preview = message

	// Replace all placeholders with sample data
	for (const [key, value] of Object.entries(sampleData)) {
		preview = preview.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
	}

	return preview
}

/* -------------------------------------------------------------------------- */
/*                               PUBLIC ENTRY                                  */
/* -------------------------------------------------------------------------- */

export async function config(
	inter:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction
) {
	// Early return if interaction already handled
	if (inter.replied || inter.deferred) {
		const customId = inter.isChatInputCommand() ? 'chat_input' : inter.customId
		StatusLogger.warn(
			`[Boost Support Config] Interaction already handled: ${customId}`
		)
		return
	}

	if (!inter.inGuild() || !inter.guildId) {
		StatusLogger.warn(
			`[Boost Support Config] Interaction not in guild - guildId: ${inter.guildId}`
		)
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'BSC001' }
		)
		return
	}

	try {
		if (inter.isChatInputCommand()) {
			await handleInitialConfig(inter)
		} else if (inter.isStringSelectMenu()) {
			if (inter.customId === 'boost_config_select') {
				await handleConfigSelect(inter)
			} else {
				StatusLogger.warn(
					`[Boost Support Config] Unknown select menu: ${inter.customId}`
				)
			}
		} else if (inter.isChannelSelectMenu()) {
			await handleChannelSelect(inter)
		} else if (inter.isButton()) {
			await handleButtonClick(inter)
		} else if (inter.isModalSubmit()) {
			await handleModalSubmit(inter)
		}
	} catch (error) {
		StatusLogger.error(
			'[Boost Support Config] Unhandled error in main config function:',
			error
		)

		try {
			const errorSection = V2.makeTextDisplay(
				'❌ An unexpected error occurred. Please try again.'
			)

			if (!inter.replied && !inter.deferred) {
				await inter.reply({
					components: [errorSection],
					flags:
						Discord.MessageFlags.Ephemeral |
						Discord.MessageFlags.IsComponentsV2,
				})
			} else if (inter.deferred) {
				await inter.editReply({
					components: [errorSection],
					flags: Discord.MessageFlags.IsComponentsV2,
				})
			} else {
				await inter.followUp({
					components: [errorSection],
					flags:
						Discord.MessageFlags.Ephemeral |
						Discord.MessageFlags.IsComponentsV2,
				})
			}
		} catch (responseError) {
			StatusLogger.error(
				'[Boost Support Config] Failed to send error response:',
				responseError
			)
		}
	}
}

/* -------------------------------------------------------------------------- */
/*                            COMMAND HANDLERS                                 */
/* -------------------------------------------------------------------------- */

async function handleInitialConfig(
	inter: Discord.ChatInputCommandInteraction | Discord.ButtonInteraction
) {
	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	const hasPerms = inter.memberPermissions?.has(
		Discord.PermissionsBitField.Flags.ManageGuild
	)

	if (!hasPerms) {
		await utils.handleResponse(
			inter,
			'error',
			'You do not have permission to manage boost support configuration',
			{ code: 'BSC002' }
		)
		return
	}

	const boostConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeTextDisplay(
		[
			'# 🎉 **Boost Support System Configuration**\n\n',
			`System Status: ${boostConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		].join('\n')
	)

	// Create configuration sections
	const configSection = V2.makeTextDisplay(
		[
			'## 🎉 **Boost Support Configuration**\n',
			`Discord Boost: ${boostConfig.discord_boost?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`,
			`Discord Channel: ${boostConfig.discord_boost?.channel_id ? `<#${boostConfig.discord_boost.channel_id}>` : '❌ Not Set'}\n`,
			`Patreon: ${boostConfig.patreon?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`,
			`Patreon Channel: ${boostConfig.patreon?.channel_id ? `<#${boostConfig.patreon.channel_id}>` : '❌ Not Set'}\n`,
			`GitHub Sponsors: ${boostConfig.github_sponsors?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`,
			`GitHub Channel: ${boostConfig.github_sponsors?.channel_id ? `<#${boostConfig.github_sponsors.channel_id}>` : '❌ Not Set'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'boost_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: boostConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'boost_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !boostConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('boost_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Discord Boost',
				value: 'discord_boost',
				description: 'Configure Discord boost notifications',
				emoji: '🎉',
			},
			{
				label: 'Patreon',
				value: 'patreon',
				description: 'Configure Patreon notifications',
				emoji: '💖',
			},
			{
				label: 'GitHub Sponsors',
				value: 'github_sponsors',
				description: 'Configure GitHub Sponsors notifications',
				emoji: '⭐',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			configSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleConfigSelect(inter: Discord.StringSelectMenuInteraction) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedOption = inter.values[0]
	const boostConfig = await loadConfig(inter)

	switch (selectedOption) {
		case 'discord_boost':
			await handleDiscordBoostConfig(inter, boostConfig)
			break
		case 'patreon':
			await handlePatreonConfig(inter, boostConfig)
			break
		case 'github_sponsors':
			await handleGitHubSponsorsConfig(inter, boostConfig)
			break
		default:
			StatusLogger.warn(
				`[Boost Support Config] Unknown config option: ${selectedOption}`
			)
			break
	}
}

/* -------------------------------------------------------------------------- */
/*                            CONFIG HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleDiscordBoostConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction,
	config: DefaultConfigs['supportProviders']
) {
	const sections = SECTION_BUILDERS.discordBoostConfig(config, inter.guild)

	// Create enable/disable buttons at the top
	const statusButtons = [
		V2.makeButton({
			custom_id: 'boost_discord_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: config.discord_boost?.enabled,
		}),
		V2.makeButton({
			custom_id: 'boost_discord_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !config.discord_boost?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'boost_discord_channel_select',
		placeholder: 'Select Discord boost notification channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	// Pre-select current channel if set
	if (config.discord_boost?.channel_id) {
		channelSelect.setDefaultChannels([config.discord_boost.channel_id])
	}

	const channelRow = V2.makeActionRow([channelSelect])

	// Create message action buttons
	const editButton = V2.makeButton({
		custom_id: 'boost_discord_edit_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'boost_discord_reset_message',
		label: 'Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const actionRow = V2.makeActionRow([editButton, resetButton])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			statusRow,
			channelRow,
			actionRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handlePatreonConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.ButtonInteraction,
	config: DefaultConfigs['supportProviders']
) {
	const sections = SECTION_BUILDERS.patreonConfig(config, inter.guild)

	// Create enable/disable buttons at the top
	const statusButtons = [
		V2.makeButton({
			custom_id: 'boost_patreon_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: config.patreon?.enabled,
		}),
		V2.makeButton({
			custom_id: 'boost_patreon_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !config.patreon?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'boost_patreon_channel_select',
		placeholder: 'Select Patreon notification channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	// Pre-select current channel if set
	if (config.patreon?.channel_id) {
		channelSelect.setDefaultChannels([config.patreon.channel_id])
	}

	const channelRow = V2.makeActionRow([channelSelect])

	// Create message action buttons
	const editButton = V2.makeButton({
		custom_id: 'boost_patreon_edit_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'boost_patreon_reset_message',
		label: 'Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const actionRow = V2.makeActionRow([editButton, resetButton])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			statusRow,
			channelRow,
			actionRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleGitHubSponsorsConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction,
	config: DefaultConfigs['supportProviders']
) {
	const sections = SECTION_BUILDERS.githubSponsorsConfig(config, inter.guild)

	// Create enable/disable buttons at the top
	const statusButtons = [
		V2.makeButton({
			custom_id: 'boost_github_sponsors_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: config.github_sponsors?.enabled,
		}),
		V2.makeButton({
			custom_id: 'boost_github_sponsors_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !config.github_sponsors?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'boost_github_sponsors_channel_select',
		placeholder: 'Select GitHub Sponsors notification channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	// Pre-select current channel if set
	if (config.github_sponsors?.channel_id) {
		channelSelect.setDefaultChannels([config.github_sponsors.channel_id])
	}

	const channelRow = V2.makeActionRow([channelSelect])

	// Create message action buttons
	const editButton = V2.makeButton({
		custom_id: 'boost_github_sponsors_edit_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'boost_github_sponsors_reset_message',
		label: 'Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const actionRow = V2.makeActionRow([editButton, resetButton])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			statusRow,
			channelRow,
			actionRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

/* -------------------------------------------------------------------------- */
/*                            INTERACTION HANDLERS                             */
/* -------------------------------------------------------------------------- */

async function handleChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	try {
		if (!inter.replied && !inter.deferred) {
			await inter.deferUpdate()
		}

		const channel = inter.values[0]
		const boostConfig = await loadConfig(inter)

		if (inter.customId === 'boost_discord_channel_select') {
			if (!boostConfig.discord_boost) {
				boostConfig.discord_boost = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.discord_boost.channel_id = channel
			await saveConfig(inter, boostConfig)

			await inter.followUp({
				content: `✅ Discord boost notification channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await handleDiscordBoostConfig(inter, boostConfig)
		} else if (inter.customId === 'boost_patreon_channel_select') {
			if (!boostConfig.patreon) {
				boostConfig.patreon = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.patreon.channel_id = channel
			await saveConfig(inter, boostConfig)

			await inter.followUp({
				content: `✅ Patreon notification channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await handlePatreonConfig(inter, boostConfig)
		} else if (inter.customId === 'boost_github_sponsors_channel_select') {
			if (!boostConfig.github_sponsors) {
				boostConfig.github_sponsors = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.github_sponsors.channel_id = channel
			await saveConfig(inter, boostConfig)

			await inter.followUp({
				content: `✅ GitHub Sponsors notification channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await handleGitHubSponsorsConfig(inter, boostConfig)
		}
	} catch (error) {
		StatusLogger.error(
			'[Boost Support Config] Error in handleChannelSelect:',
			error
		)
	}
}

async function handleButtonClick(inter: Discord.ButtonInteraction) {
	// Don't defer for modal buttons
	const isModalButton = inter.customId.includes('_edit_')

	if (!isModalButton && !inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const boostConfig = await loadConfig(inter)

	switch (inter.customId) {
		case 'boost_system_enable':
			boostConfig.enabled = true
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Boost support system has been enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_system_disable':
			boostConfig.enabled = false
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Boost support system has been disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_discord_enable':
			if (!boostConfig.discord_boost) {
				boostConfig.discord_boost = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.discord_boost.enabled = true
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Discord boost notifications enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_discord_disable':
			if (!boostConfig.discord_boost) {
				boostConfig.discord_boost = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.discord_boost.enabled = false
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Discord boost notifications disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_patreon_enable':
			if (!boostConfig.patreon) {
				boostConfig.patreon = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.patreon.enabled = true
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Patreon notifications enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_patreon_disable':
			if (!boostConfig.patreon) {
				boostConfig.patreon = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.patreon.enabled = false
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Patreon notifications disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_github_sponsors_enable':
			if (!boostConfig.github_sponsors) {
				boostConfig.github_sponsors = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.github_sponsors.enabled = true
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ GitHub Sponsors notifications enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_github_sponsors_disable':
			if (!boostConfig.github_sponsors) {
				boostConfig.github_sponsors = {
					enabled: false,
					channel_id: null,
				}
			}
			boostConfig.github_sponsors.enabled = false
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ GitHub Sponsors notifications disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'boost_discord_edit_message':
			await handleEditDiscordMessage(inter)
			break

		case 'boost_patreon_edit_message':
			await handleEditPatreonMessage(inter)
			break

		case 'boost_github_sponsors_edit_message':
			await handleEditGitHubSponsorsMessage(inter)
			break

		case 'boost_discord_reset_message':
			boostConfig.discord_boost = boostConfig.discord_boost || {
				enabled: false,
				channel_id: null,
			}
			boostConfig.discord_boost.message = getDefaultDiscordBoostMessage()
			// Also reset components
			if (boostConfig.components?.discord_boost) {
				boostConfig.components.discord_boost.components[0] = {
					type: Discord.ComponentType.TextDisplay,
					text: getDefaultDiscordBoostMessage(),
				} as unknown as ComponentsV2
			}
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Discord boost message reset to default',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await handleDiscordBoostConfig(inter, boostConfig)
			break

		case 'boost_patreon_reset_message':
			boostConfig.patreon = boostConfig.patreon || {
				enabled: false,
				channel_id: null,
			}
			boostConfig.patreon.message = getDefaultPatreonMessage()
			// Also reset components
			if (boostConfig.components?.patreon) {
				boostConfig.components.patreon.components[0] = {
					type: Discord.ComponentType.TextDisplay,
					text: getDefaultPatreonMessage(),
				} as unknown as ComponentsV2
			}
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ Patreon message reset to default',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await handlePatreonConfig(inter, boostConfig)
			break

		case 'boost_github_sponsors_reset_message':
			boostConfig.github_sponsors = boostConfig.github_sponsors || {
				enabled: false,
				channel_id: null,
			}
			boostConfig.github_sponsors.message = getDefaultGitHubSponsorsMessage()
			// Also reset components
			if (boostConfig.components?.github_sponsors) {
				boostConfig.components.github_sponsors.components[0] = {
					type: Discord.ComponentType.TextDisplay,
					text: getDefaultGitHubSponsorsMessage(),
				} as unknown as ComponentsV2
			}
			await saveConfig(inter, boostConfig)
			await inter.followUp({
				content: '✅ GitHub Sponsors message reset to default',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await handleGitHubSponsorsConfig(inter, boostConfig)
			break

		case 'boost_back_to_main':
			await updateMainConfigMessage(inter)
			break

		default:
			StatusLogger.warn(
				`[Boost Support Config] Unhandled button: ${inter.customId}`
			)
			break
	}
}

async function handleModalSubmit(inter: Discord.ModalSubmitInteraction) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const boostConfig = await loadConfig(inter)

	if (inter.customId === 'boost_discord_message_modal') {
		const newMessage = inter.fields.getTextInputValue('boost_discord_message')

		// Update components
		if (!boostConfig.components) {
			boostConfig.components = {}
		}
		if (!boostConfig.components.discord_boost) {
			boostConfig.components.discord_boost = { components: [] }
		}

		// Update the message component (first component in the array)
		if (boostConfig.components.discord_boost.components.length < 1) {
			boostConfig.components.discord_boost.components.push({} as ComponentsV2)
		}

		boostConfig.components.discord_boost.components[0] = {
			type: Discord.ComponentType.TextDisplay,
			text: newMessage,
		} as unknown as ComponentsV2

		// Also update the legacy message field
		if (!boostConfig.discord_boost) {
			boostConfig.discord_boost = {
				enabled: false,
				channel_id: null,
			}
		}
		boostConfig.discord_boost.message = newMessage

		await saveConfig(inter, boostConfig)

		await inter.followUp({
			content: '✅ Discord boost message updated successfully',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await handleDiscordBoostConfig(inter, boostConfig)
	} else if (inter.customId === 'boost_patreon_message_modal') {
		const newMessage = inter.fields.getTextInputValue('boost_patreon_message')

		// Update components
		if (!boostConfig.components) {
			boostConfig.components = {}
		}
		if (!boostConfig.components.patreon) {
			boostConfig.components.patreon = { components: [] }
		}

		// Update the message component (first component in the array)
		if (boostConfig.components.patreon.components.length < 1) {
			boostConfig.components.patreon.components.push({} as ComponentsV2)
		}

		boostConfig.components.patreon.components[0] = {
			type: Discord.ComponentType.TextDisplay,
			text: newMessage,
		} as unknown as ComponentsV2

		// Also update the legacy message field
		if (!boostConfig.patreon) {
			boostConfig.patreon = {
				enabled: false,
				channel_id: null,
			}
		}
		boostConfig.patreon.message = newMessage

		await saveConfig(inter, boostConfig)

		await inter.followUp({
			content: '✅ Patreon message updated successfully',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await handlePatreonConfig(inter, boostConfig)
	} else if (inter.customId === 'boost_github_sponsors_message_modal') {
		const newMessage = inter.fields.getTextInputValue('boost_github_sponsors_message')

		// Update components
		if (!boostConfig.components) {
			boostConfig.components = {}
		}
		if (!boostConfig.components.github_sponsors) {
			boostConfig.components.github_sponsors = { components: [] }
		}

		// Update the message component (first component in the array)
		if (boostConfig.components.github_sponsors.components.length < 1) {
			boostConfig.components.github_sponsors.components.push({} as ComponentsV2)
		}

		boostConfig.components.github_sponsors.components[0] = {
			type: Discord.ComponentType.TextDisplay,
			text: newMessage,
		} as unknown as ComponentsV2

		// Also update the legacy message field
		if (!boostConfig.github_sponsors) {
			boostConfig.github_sponsors = {
				enabled: false,
				channel_id: null,
			}
		}
		boostConfig.github_sponsors.message = newMessage

		await saveConfig(inter, boostConfig)

		await inter.followUp({
			content: '✅ GitHub Sponsors message updated successfully',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await handleGitHubSponsorsConfig(inter, boostConfig)
	}
}

/* -------------------------------------------------------------------------- */
/*                            HELPER HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleEditDiscordMessage(inter: Discord.ButtonInteraction) {
	const boostConfig = await loadConfig(inter)

	const modal = new Discord.ModalBuilder()
		.setCustomId('boost_discord_message_modal')
		.setTitle('Edit Discord Boost Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('boost_discord_message')
		.setLabel('Discord Boost Announcement Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setValue(getCurrentDiscordBoostMessage(boostConfig))
		.setRequired(true)
		.setMaxLength(2000)

	const messageRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			messageInput
		)
	modal.addComponents(messageRow)

	await inter.showModal(modal)
}

async function handleEditPatreonMessage(inter: Discord.ButtonInteraction) {
	const boostConfig = await loadConfig(inter)

	const modal = new Discord.ModalBuilder()
		.setCustomId('boost_patreon_message_modal')
		.setTitle('Edit Patreon Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('boost_patreon_message')
		.setLabel('Patreon Announcement Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setValue(getCurrentPatreonMessage(boostConfig))
		.setRequired(true)
		.setMaxLength(2000)

	const messageRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			messageInput
		)
	modal.addComponents(messageRow)

	await inter.showModal(modal)
}

async function handleEditGitHubSponsorsMessage(inter: Discord.ButtonInteraction) {
	const boostConfig = await loadConfig(inter)

	const modal = new Discord.ModalBuilder()
		.setCustomId('boost_github_sponsors_message_modal')
		.setTitle('Edit GitHub Sponsors Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('boost_github_sponsors_message')
		.setLabel('GitHub Sponsors Announcement Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setValue(getCurrentGitHubSponsorsMessage(boostConfig))
		.setRequired(true)
		.setMaxLength(2000)

	const messageRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			messageInput
		)
	modal.addComponents(messageRow)

	await inter.showModal(modal)
}

async function updateMainConfigMessage(
	inter:
		| Discord.ButtonInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.StringSelectMenuInteraction
) {
	const boostConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeTextDisplay(
		[
			'# 🎉 **Boost Support System Configuration**\n\n',
			`System Status: ${boostConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		].join('\n')
	)

	// Create configuration sections
	const configSection = V2.makeTextDisplay(
		[
			'## 🎉 **Boost Support Configuration**\n',
			`Discord Boost: ${boostConfig.discord_boost?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`,
			`Discord Channel: ${boostConfig.discord_boost?.channel_id ? `<#${boostConfig.discord_boost.channel_id}>` : '❌ Not Set'}\n`,
			`Patreon: ${boostConfig.patreon?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`,
			`Patreon Channel: ${boostConfig.patreon?.channel_id ? `<#${boostConfig.patreon.channel_id}>` : '❌ Not Set'}\n`,
			`GitHub Sponsors: ${boostConfig.github_sponsors?.enabled ? '✅ Enabled' : '❌ Disabled'}\n`,
			`GitHub Channel: ${boostConfig.github_sponsors?.channel_id ? `<#${boostConfig.github_sponsors.channel_id}>` : '❌ Not Set'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'boost_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: boostConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'boost_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !boostConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('boost_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Discord Boost',
				value: 'discord_boost',
				description: 'Configure Discord boost notifications',
				emoji: '🎉',
			},
			{
				label: 'Patreon',
				value: 'patreon',
				description: 'Configure Patreon notifications',
				emoji: '💖',
			},
			{
				label: 'GitHub Sponsors',
				value: 'github_sponsors',
				description: 'Configure GitHub Sponsors notifications',
				emoji: '⭐',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			configSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}
