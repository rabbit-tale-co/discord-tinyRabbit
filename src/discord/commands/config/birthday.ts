import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, ComponentsV2 } from '@/types/plugins.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as V2 from 'discord-components-v2'
import { getPluginConfig, updatePluginConfig } from '@/discord/api/index.js'

/* -------------------------------------------------------------------------- */
/*                              SECTION BUILDERS                               */
/* -------------------------------------------------------------------------- */

const SECTION_BUILDERS = {
	birthdaySystem: (
		config: DefaultConfigs['birthday'],
		guild?: Discord.Guild
	) => {
		const titleSection = V2.makeSection(
			[
				'## 🎂 **Birthday Announcement Configuration**',
				'> Configure automatic birthday celebrations for your server members.',
			],
			V2.makeButton({
				custom_id: 'birthday_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const currentMessage = getCurrentBirthdayMessage(config)
		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Settings**',
				`**Channel**: ${config.channel_id ? `<#${config.channel_id}>` : '❌ Not Set'}`,
				`**Message**: ${currentMessage !== getDefaultBirthdayMessage() ? '✅ Configured' : '❌ Default'}`,

				'',
				currentMessage
					? `### 🎭 **Current Message Template**\n\`\`\`${currentMessage}\`\`\``
					: '',
				currentMessage
					? `### ✨ **Rendered Preview** (with sample data)\n${generateMessagePreview(currentMessage)}`
					: '',
				'',
				'### 📝 **Available Variables**',
				'-# - `{user}` - Mention the birthday member',
				"-# - `{username}` - Member's username (with tag)",
				"-# - `{display_name}` - Member's display name",
				'-# - `{server_name}` - Server name',
				"-# - `{avatar}` - Member's avatar URL",
				"-# - `{user_avatar}` - Member's avatar URL (alternative)",
				'-# - `{server_image}` - Server icon URL',
				'-# - `{next_birthday}` - Timestamp for next birthday',
				'-# - `{birthday_date}` - Full birthday date (Discord timestamp format)',
				'-# - `{birthday_short}` - Short birthday date (Discord timestamp format)',
				'-# - `{birthday_day}` - Birthday day (e.g., "25")',
				'-# - `{birthday_month}` - Birthday month (e.g., "12")',
				'-# - `{birthday_year}` - Birthday year (e.g., "1995")',
				'-# - `{age}` - Age of the birthday member',
				'-# - `{next_birthday_relative}` - Time until next birthday (e.g., "in 5 days")',
				'-# - `{next_birthday_full}` - Full next birthday timestamp',
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

	channelConfig: (
		config: DefaultConfigs['birthday'],
		guild?: Discord.Guild
	) => {
		const titleSection = V2.makeSection(
			[
				'## 📢 **Birthday Announcement Channel**',
				'> Select the channel where birthday announcements will be sent.',
			],
			V2.makeButton({
				custom_id: 'birthday_back_to_main',
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
				'### 📊 **Current Channel Settings**',
				`**Current Channel**: ${config.channel_id ? `<#${config.channel_id}>` : '❌ Not Set'}`,
				'',
				'### ℹ️ **Information**',
				'-# - Select a text channel where birthday announcements will be posted',
				'-# - Make sure the bot has permission to send messages in the selected channel',
				'-# - Birthday announcements are sent automatically at 11:00 AM UTC daily',
				'-# - Only members who have set their birthday will receive announcements',
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
 * Get current birthday message with proper priority
 */
function getCurrentBirthdayMessage(config: DefaultConfigs['birthday']): string {
	return (
		(
			config.components?.celebration_message?.components?.[1] as {
				content?: string
			}
		)?.content ||
		config.message ||
		getDefaultBirthdayMessage()
	)
}

/**
 * Get default birthday message
 */
function getDefaultBirthdayMessage(): string {
	return "🎉 Happy Birthday {user}! 🎂\n\nToday we celebrate {display_name}'s special day!\nBorn on {birthday_date} 📅\n\n*Wishing you a fantastic day filled with joy and happiness!* ✨\n\nYour next birthday will be {next_birthday_relative}! 🎈"
}

/**
 * Load birthday configuration from database
 */
async function loadConfig(
	inter: Discord.Interaction
): Promise<DefaultConfigs['birthday']> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	return await getPluginConfig(inter.client.user.id, inter.guildId, 'birthday')
}

/**
 * Save birthday configuration to database
 */
async function saveConfig(
	inter: Discord.Interaction,
	config: DefaultConfigs['birthday']
): Promise<void> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	await updatePluginConfig(
		inter.client.user.id,
		inter.guildId,
		'birthday',
		config
	)
}

/**
 * Generate a preview of birthday message with sample data
 */
function generateMessagePreview(message: string): string {
	// Sample data for preview
	const sampleData = {
		user: '@Alex',
		username: 'Alex#1234',
		display_name: 'Alex',
		server_name: 'Awesome Server',
		avatar: 'https://cdn.discordapp.com/avatars/123/avatar.png',
		user_avatar: 'https://cdn.discordapp.com/avatars/123/avatar.png',
		server_image: 'https://cdn.discordapp.com/icons/456/server.png',
		birthday_date: '<t:819849600:D>', // December 25, 1995
		birthday_short: '<t:819849600:d>', // 25/12/1995
		birthday_day: '25',
		birthday_month: '12',
		birthday_year: '1995',
		age: '28',
		next_birthday: '<t:1735084800:D>', // December 25, 2025
		next_birthday_relative: '<t:1735084800:R>', // in 11 months
		next_birthday_full: '<t:1735084800:F>', // Thursday, December 25, 2025 at 12:00 AM
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
			`[Birthday Config] Interaction already handled: ${customId}`
		)
		return
	}

	if (!inter.inGuild() || !inter.guildId) {
		StatusLogger.warn(
			`[Birthday Config] Interaction not in guild - guildId: ${inter.guildId}`
		)
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'BC001' }
		)
		return
	}

	try {
		if (inter.isChatInputCommand()) {
			await handleInitialConfig(inter)
		} else if (inter.isStringSelectMenu()) {
			if (inter.customId === 'birthday_config_select') {
				await handleConfigSelect(inter)
			} else {
				StatusLogger.warn(
					`[Birthday Config] Unknown select menu: ${inter.customId}`
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
			'[Birthday Config] Unhandled error in main config function:',
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
				'[Birthday Config] Failed to send error response:',
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
			'You do not have permission to manage birthday configuration',
			{ code: 'BC002' }
		)
		return
	}

	const birthdayConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeTextDisplay(
		[
			'# 🎂 **Birthday Announcement System Configuration**\n\n',
			`System Status: ${birthdayConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		].join('\n')
	)

	// Create configuration sections
	const configSection = V2.makeTextDisplay(
		[
			'## 🎉 **Birthday Configuration**\n',
			`Birthday Channel: ${birthdayConfig.channel_id ? `<#${birthdayConfig.channel_id}>` : '❌ Not Set'}\n`,
			`Birthday Message: ${getCurrentBirthdayMessage(birthdayConfig) !== getDefaultBirthdayMessage() ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'birthday_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: birthdayConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'birthday_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !birthdayConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('birthday_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Announcement Channel',
				value: 'channel',
				description: 'Set channel for birthday announcements',
				emoji: '📢',
			},
			{
				label: 'Birthday Message',
				value: 'message',
				description: 'Customize birthday announcement message',
				emoji: '💬',
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
	const birthdayConfig = await loadConfig(inter)

	switch (selectedOption) {
		case 'channel':
			await handleChannelConfig(inter, birthdayConfig)
			break
		case 'message':
			await handleMessageConfig(inter, birthdayConfig)
			break
		default:
			StatusLogger.warn(
				`[Birthday Config] Unknown config option: ${selectedOption}`
			)
			break
	}
}

/* -------------------------------------------------------------------------- */
/*                            CONFIG HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleChannelConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction,
	config: DefaultConfigs['birthday']
) {
	const sections = SECTION_BUILDERS.channelConfig(config, inter.guild)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'birthday_channel_select',
		placeholder: 'Select birthday announcement channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	// Pre-select current channel if set
	if (config.channel_id) {
		channelSelect.setDefaultChannels([config.channel_id])
	}

	const channelRow = V2.makeActionRow([channelSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			channelRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleMessageConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.ButtonInteraction,
	config: DefaultConfigs['birthday']
) {
	const sections = SECTION_BUILDERS.birthdaySystem(config, inter.guild)

	const editButton = V2.makeButton({
		custom_id: 'birthday_edit_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'birthday_reset_message',
		label: 'Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const buttonRow = V2.makeActionRow([editButton, resetButton])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			buttonRow,
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
		const birthdayConfig = await loadConfig(inter)

		if (inter.customId === 'birthday_channel_select') {
			birthdayConfig.channel_id = channel
			await saveConfig(inter, birthdayConfig)

			await inter.followUp({
				content: `✅ Birthday announcement channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await handleChannelConfig(inter, birthdayConfig)
		}
	} catch (error) {
		StatusLogger.error('[Birthday Config] Error in handleChannelSelect:', error)
	}
}

async function handleButtonClick(inter: Discord.ButtonInteraction) {
	// Don't defer for modal buttons
	const isModalButton = inter.customId.includes('_edit_')

	if (!isModalButton && !inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const birthdayConfig = await loadConfig(inter)

	switch (inter.customId) {
		case 'birthday_system_enable':
			birthdayConfig.enabled = true
			await saveConfig(inter, birthdayConfig)
			await inter.followUp({
				content: '✅ Birthday announcement system has been enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'birthday_system_disable':
			birthdayConfig.enabled = false
			await saveConfig(inter, birthdayConfig)
			await inter.followUp({
				content: '✅ Birthday announcement system has been disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'birthday_edit_message':
			await handleEditMessage(inter)
			break

		case 'birthday_reset_message':
			birthdayConfig.message = getDefaultBirthdayMessage()
			// Also reset components
			if (birthdayConfig.components?.celebration_message) {
				birthdayConfig.components.celebration_message.components[1] = {
					type: Discord.ComponentType.TextDisplay,
					content: getDefaultBirthdayMessage(),
				} as unknown as ComponentsV2
			}
			await saveConfig(inter, birthdayConfig)
			await inter.followUp({
				content: '✅ Birthday message reset to default',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await handleMessageConfig(inter, birthdayConfig)
			break

		case 'birthday_back_to_main':
			await updateMainConfigMessage(inter)
			break

		default:
			StatusLogger.warn(`[Birthday Config] Unhandled button: ${inter.customId}`)
			break
	}
}

async function handleModalSubmit(inter: Discord.ModalSubmitInteraction) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const birthdayConfig = await loadConfig(inter)

	if (inter.customId === 'birthday_message_modal') {
		const newMessage = inter.fields.getTextInputValue('birthday_message')

		// Update components
		if (!birthdayConfig.components) {
			birthdayConfig.components = {}
		}
		if (!birthdayConfig.components.celebration_message) {
			birthdayConfig.components.celebration_message = { components: [] }
		}

		// Update the message component (second component in the array)
		if (birthdayConfig.components.celebration_message.components.length < 2) {
			birthdayConfig.components.celebration_message.components.push(
				{} as ComponentsV2
			)
		}

		birthdayConfig.components.celebration_message.components[1] = {
			type: Discord.ComponentType.TextDisplay,
			content: newMessage,
		} as unknown as ComponentsV2

		// Also update the legacy message field
		birthdayConfig.message = newMessage

		await saveConfig(inter, birthdayConfig)

		await inter.followUp({
			content: '✅ Birthday message updated successfully',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await handleMessageConfig(inter, birthdayConfig)
	}
}

/* -------------------------------------------------------------------------- */
/*                            HELPER HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleEditMessage(inter: Discord.ButtonInteraction) {
	const birthdayConfig = await loadConfig(inter)

	const modal = new Discord.ModalBuilder()
		.setCustomId('birthday_message_modal')
		.setTitle('Edit Birthday Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('birthday_message')
		.setLabel('Birthday Announcement Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setValue(getCurrentBirthdayMessage(birthdayConfig))
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
	const birthdayConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeTextDisplay(
		[
			'# 🎂 **Birthday Announcement System Configuration**\n\n',
			`System Status: ${birthdayConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		].join('\n')
	)

	// Create configuration sections
	const configSection = V2.makeTextDisplay(
		[
			'## 🎉 **Birthday Configuration**\n',
			`Birthday Channel: ${birthdayConfig.channel_id ? `<#${birthdayConfig.channel_id}>` : '❌ Not Set'}\n`,
			`Birthday Message: ${getCurrentBirthdayMessage(birthdayConfig) !== getDefaultBirthdayMessage() ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'birthday_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: birthdayConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'birthday_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !birthdayConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('birthday_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Announcement Channel',
				value: 'channel',
				description: 'Set channel for birthday announcements',
				emoji: '📢',
			},
			{
				label: 'Birthday Message',
				value: 'message',
				description: 'Customize birthday announcement message',
				emoji: '💬',
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
