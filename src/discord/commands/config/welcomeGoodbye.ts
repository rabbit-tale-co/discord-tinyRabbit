import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, ComponentsV2 } from '@/types/plugins.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as V2 from 'discord-components-v2'
import { getPluginConfig, updatePluginConfig } from '@/discord/api/index.js'

/* -------------------------------------------------------------------------- */
/*                            SECTION BUILDERS                                  */
/* -------------------------------------------------------------------------- */

const SECTION_BUILDERS = {
	welcomeMessage: (currentMessage?: string, currentChannelId?: string) => {
		const titleSection = V2.makeSection(
			[
				'## 👋 **Welcome Message Configuration**',
				'> Customize the message sent when new members join the server.',
			],
			V2.makeButton({
				custom_id: 'welcome_goodbye_back_to_main',
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
				`**Channel**: ${currentChannelId ? `<#${currentChannelId}>` : '❌ Not Set'}`,
				`**Message**: ${currentMessage ? 'Set' : '❌ Not Set'}`,
				currentMessage ? `\`\`\`${currentMessage}\`\`\`` : '',
				'',
				'### 📝 **Available Variables**',
				'-# - `{user}` - Mention the new member',
				"-# - `{username}` - Member's username (with tag)",
				"-# - `{display_name}` - Member's display name (no mention)",
				'-# - `{server_name}` - Server name',
				'-# - `{member_count}` - Current member count',
				"-# - `{avatar}` - Member's avatar URL",
				"-# - `{user_avatar}` - Member's avatar URL (alternative)",
				'-# - `{server_image}` - Server icon URL',
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

	goodbyeMessage: (currentMessage?: string, currentChannelId?: string) => {
		const titleSection = V2.makeSection(
			[
				'## 👋 **Goodbye Message Configuration**',
				'> Customize the message sent when members leave the server.',
			],
			V2.makeButton({
				custom_id: 'welcome_goodbye_back_to_main',
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
				`**Channel**: ${currentChannelId ? `<#${currentChannelId}>` : '❌ Not Set'}`,
				`**Message**: ${currentMessage ? 'Set' : '❌ Not Set'}`,
				currentMessage ? `\`\`\`${currentMessage}\`\`\`` : '',
				'',
				'### 📝 **Available Variables**',
				"-# - `{username}` - Member's username (with tag, no mention)",
				"-# - `{display_name}` - Member's display name (no mention)",
				'-# - `{server_name}` - Server name',
				'-# - `{member_count}` - Current member count (after leaving)',
				"-# - `{avatar}` - Member's avatar URL",
				'-# - `{server_image}` - Server icon URL',
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

	joinRoles: (joinRoles: string[], guild?: Discord.Guild) => {
		const titleSection = V2.makeSection(
			[
				'## 🎭 **Join Roles Configuration**',
				'> Configure roles automatically given to new members when they join.',
			],
			V2.makeButton({
				custom_id: 'welcome_goodbye_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const rolesContent =
			joinRoles.length === 0
				? ['❌ No auto-assign roles configured.']
				: joinRoles.map((roleId, index) => `${index + 1}. <@&${roleId}>`)

		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Auto-Assign Roles**',
				...rolesContent,
				'',
				'### ℹ️ **Information**',
				'-# - These roles will be automatically assigned to new members when they join',
				'-# - Make sure the bot has permission to assign these roles',
				'-# - Bot role must be higher than the roles being assigned',
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
 * Get current welcome message with proper priority
 */
function getCurrentWelcomeMessage(
	config: DefaultConfigs['welcome_goodbye']
): string {
	return (
		(
			config.components?.welcome_message?.components?.[0] as {
				content?: string
			}
		)?.content ||
		config.welcome_message ||
		'Welcome to {server_name}, {user}! 🎉'
	)
}

/**
 * Get current goodbye message with proper priority
 */
function getCurrentGoodbyeMessage(
	config: DefaultConfigs['welcome_goodbye']
): string {
	return (
		(
			config.components?.goodbye_message?.components?.[0] as {
				content?: string
			}
		)?.content ||
		config.leave_message ||
		'{display_name} has left {server_name}. 👋'
	)
}

/**
 * Load welcome_goodbye configuration from database
 */
async function loadConfig(
	inter: Discord.Interaction
): Promise<DefaultConfigs['welcome_goodbye']> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	return await getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'welcome_goodbye'
	)
}

/**
 * Save welcome_goodbye configuration to database
 */
async function saveConfig(
	inter: Discord.Interaction,
	config: DefaultConfigs['welcome_goodbye']
): Promise<void> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	await updatePluginConfig(
		inter.client.user.id,
		inter.guildId,
		'welcome_goodbye',
		config
	)
}

/* -------------------------------------------------------------------------- */
/*                               PUBLIC ENTRY                                   */
/* -------------------------------------------------------------------------- */

export async function config(
	inter:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction
) {
	// Early return if interaction already handled
	if (inter.replied || inter.deferred) {
		const customId = inter.isChatInputCommand() ? 'chat_input' : inter.customId
		StatusLogger.warn(
			`[Welcome Goodbye Config] Interaction already handled: ${customId}`
		)
		return
	}

	if (!inter.inGuild() || !inter.guildId) {
		StatusLogger.warn(
			`[Welcome Goodbye Config] Interaction not in guild - guildId: ${inter.guildId}`
		)
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'WGC001' }
		)
		return
	}

	try {
		if (inter.isChatInputCommand()) {
			await handleInitialConfig(inter)
		} else if (inter.isStringSelectMenu()) {
			if (inter.customId === 'welcome_goodbye_config_select') {
				await handleConfigSelect(inter)
			} else {
				StatusLogger.warn(
					`[Welcome Goodbye Config] Unknown select menu: ${inter.customId}`
				)
			}
		} else if (inter.isChannelSelectMenu()) {
			await handleChannelSelect(inter)
		} else if (inter.isRoleSelectMenu()) {
			await handleRoleSelect(inter)
		} else if (inter.isButton()) {
			await handleButtonClick(inter)
		} else if (inter.isModalSubmit()) {
			await handleModalSubmit(inter)
		}
	} catch (error) {
		StatusLogger.error(
			'[Welcome Goodbye Config] Unhandled error in main config function:',
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
				'[Welcome Goodbye Config] Failed to send error response:',
				responseError
			)
		}
	}
}

/* -------------------------------------------------------------------------- */
/*                            COMMAND HANDLERS                                  */
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
			'You do not have permission to manage welcome & goodbye configuration',
			{ code: 'WGC002' }
		)
		return
	}

	const welcomeGoodbyeConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeTextDisplay(
		[
			'# 👋 **Welcome & Goodbye System Configuration**\n\n',
			`System Status: ${welcomeGoodbyeConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		].join('\n')
	)

	// Create sections
	const welcomeSection = V2.makeTextDisplay(
		[
			'## 👋 **Welcome Configuration**\n',
			`Welcome Channel: ${welcomeGoodbyeConfig.welcome_channel_id ? `<#${welcomeGoodbyeConfig.welcome_channel_id}>` : '❌ Not Set'}\n`,
			`Welcome Message: ${getCurrentWelcomeMessage(welcomeGoodbyeConfig) !== 'Welcome to {server}, {user}! 🎉' ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	const goodbyeSection = V2.makeTextDisplay(
		[
			'## 👋 **Goodbye Configuration**\n',
			`Goodbye Channel: ${welcomeGoodbyeConfig.leave_channel_id ? `<#${welcomeGoodbyeConfig.leave_channel_id}>` : '❌ Not Set'}\n`,
			`Goodbye Message: ${getCurrentGoodbyeMessage(welcomeGoodbyeConfig) !== '{username} has left {server}. 👋' ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	const rolesSection = V2.makeTextDisplay(
		[
			'## 🎭 **Auto-Assign Roles**\n',
			`Join Roles: ${welcomeGoodbyeConfig.join_role_ids?.length ? `✅ ${welcomeGoodbyeConfig.join_role_ids.length} roles` : '❌ None Set'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'welcome_goodbye_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: welcomeGoodbyeConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'welcome_goodbye_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !welcomeGoodbyeConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('welcome_goodbye_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Welcome Message',
				value: 'welcome_message',
				description: 'Configure welcome message and channel',
				emoji: '👋',
			},
			{
				label: 'Goodbye Message',
				value: 'goodbye_message',
				description: 'Configure goodbye message and channel',
				emoji: '👋',
			},
			{
				label: 'Auto-Assign Roles',
				value: 'join_roles',
				description: 'Set roles given to new members',
				emoji: '🎭',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			welcomeSection,
			spacer,
			goodbyeSection,
			spacer,
			rolesSection,
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
	const welcomeGoodbyeConfig = await loadConfig(inter)

	switch (selectedOption) {
		case 'welcome_message':
			await handleWelcomeMessageConfig(inter, welcomeGoodbyeConfig)
			break
		case 'goodbye_message':
			await handleGoodbyeMessageConfig(inter, welcomeGoodbyeConfig)
			break
		case 'join_roles':
			await handleJoinRolesConfig(inter, welcomeGoodbyeConfig)
			break
		default:
			StatusLogger.warn(
				`[Welcome Goodbye Config] Unknown config option: ${selectedOption}`
			)
			break
	}
}

/* -------------------------------------------------------------------------- */
/*                            CONFIG HANDLERS                                   */
/* -------------------------------------------------------------------------- */

async function handleWelcomeMessageConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.ButtonInteraction
		| Discord.ChannelSelectMenuInteraction,
	config: DefaultConfigs['welcome_goodbye']
) {
	const sections = SECTION_BUILDERS.welcomeMessage(
		getCurrentWelcomeMessage(config),
		config.welcome_channel_id || undefined
	)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'welcome_goodbye_welcome_channel_select',
		placeholder: 'Select welcome message channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	const editButton = V2.makeButton({
		custom_id: 'welcome_goodbye_edit_welcome_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'welcome_goodbye_reset_welcome_message',
		label: 'Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const channelRow = V2.makeActionRow([channelSelect])
	const buttonRow = V2.makeActionRow([editButton, resetButton])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			channelRow,
			buttonRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleGoodbyeMessageConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.ButtonInteraction
		| Discord.ChannelSelectMenuInteraction,
	config: DefaultConfigs['welcome_goodbye']
) {
	const sections = SECTION_BUILDERS.goodbyeMessage(
		getCurrentGoodbyeMessage(config),
		config.leave_channel_id || undefined
	)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'welcome_goodbye_goodbye_channel_select',
		placeholder: 'Select goodbye message channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	const editButton = V2.makeButton({
		custom_id: 'welcome_goodbye_edit_goodbye_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'welcome_goodbye_reset_goodbye_message',
		label: 'Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const channelRow = V2.makeActionRow([channelSelect])
	const buttonRow = V2.makeActionRow([editButton, resetButton])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			channelRow,
			buttonRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleJoinRolesConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction,
	config: DefaultConfigs['welcome_goodbye']
) {
	const joinRoles = config.join_role_ids || []
	const sections = SECTION_BUILDERS.joinRoles(joinRoles, inter.guild)

	const roleSelect = V2.makeRoleSelect({
		custom_id: 'welcome_goodbye_join_roles_select',
		placeholder: 'Select roles to auto-assign to new members',
		min_values: 0,
		max_values: 10,
	})

	// Pre-select current roles if any
	if (joinRoles.length > 0) {
		roleSelect.setDefaultRoles(joinRoles)
	}

	const roleRow = V2.makeActionRow([roleSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			roleRow,
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
		const welcomeGoodbyeConfig = await loadConfig(inter)

		if (inter.customId === 'welcome_goodbye_welcome_channel_select') {
			welcomeGoodbyeConfig.welcome_channel_id = channel
			await saveConfig(inter, welcomeGoodbyeConfig)

			await inter.followUp({
				content: `✅ Welcome channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await handleWelcomeMessageConfig(inter, welcomeGoodbyeConfig)
		} else if (inter.customId === 'welcome_goodbye_goodbye_channel_select') {
			welcomeGoodbyeConfig.leave_channel_id = channel
			await saveConfig(inter, welcomeGoodbyeConfig)

			await inter.followUp({
				content: `✅ Goodbye channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await handleGoodbyeMessageConfig(inter, welcomeGoodbyeConfig)
		}
	} catch (error) {
		StatusLogger.error(
			'[Welcome Goodbye Config] Error in handleChannelSelect:',
			error
		)
	}
}

async function handleRoleSelect(inter: Discord.RoleSelectMenuInteraction) {
	try {
		if (!inter.replied && !inter.deferred) {
			await inter.deferUpdate()
		}

		const roles = inter.values
		const welcomeGoodbyeConfig = await loadConfig(inter)

		if (inter.customId === 'welcome_goodbye_join_roles_select') {
			welcomeGoodbyeConfig.join_role_ids = roles
			await saveConfig(inter, welcomeGoodbyeConfig)

			const rolesList =
				roles.length > 0
					? roles.map((roleId) => `<@&${roleId}>`).join(', ')
					: 'none'

			await inter.followUp({
				content: `✅ Auto-assign roles set to: ${rolesList}`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await handleJoinRolesConfig(inter, welcomeGoodbyeConfig)
		}
	} catch (error) {
		StatusLogger.error(
			'[Welcome Goodbye Config] Error in handleRoleSelect:',
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

	const welcomeGoodbyeConfig = await loadConfig(inter)

	switch (inter.customId) {
		case 'welcome_goodbye_system_enable':
			welcomeGoodbyeConfig.enabled = true
			await saveConfig(inter, welcomeGoodbyeConfig)
			await inter.followUp({
				content: '✅ Welcome & Goodbye system has been enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'welcome_goodbye_system_disable':
			welcomeGoodbyeConfig.enabled = false
			await saveConfig(inter, welcomeGoodbyeConfig)
			await inter.followUp({
				content: '✅ Welcome & Goodbye system has been disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'welcome_goodbye_edit_welcome_message':
			await handleEditWelcomeMessage(inter)
			break

		case 'welcome_goodbye_reset_welcome_message':
			welcomeGoodbyeConfig.welcome_message = 'Welcome to {server}, {user}! 🎉'
			// Also reset components
			if (welcomeGoodbyeConfig.components?.welcome_message) {
				welcomeGoodbyeConfig.components.welcome_message = undefined
			}
			await saveConfig(inter, welcomeGoodbyeConfig)
			await inter.followUp({
				content: '✅ Welcome message reset to default',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await handleWelcomeMessageConfig(inter, welcomeGoodbyeConfig)
			break

		case 'welcome_goodbye_edit_goodbye_message':
			await handleEditGoodbyeMessage(inter)
			break

		case 'welcome_goodbye_reset_goodbye_message':
			welcomeGoodbyeConfig.leave_message = '{username} has left {server}. 👋'
			// Also reset components
			if (welcomeGoodbyeConfig.components?.goodbye_message) {
				welcomeGoodbyeConfig.components.goodbye_message = undefined
			}
			await saveConfig(inter, welcomeGoodbyeConfig)
			await inter.followUp({
				content: '✅ Goodbye message reset to default',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await handleGoodbyeMessageConfig(inter, welcomeGoodbyeConfig)
			break

		case 'welcome_goodbye_back_to_main':
			await updateMainConfigMessage(inter)
			break

		default:
			StatusLogger.warn(
				`[Welcome Goodbye Config] Unhandled button: ${inter.customId}`
			)
			break
	}
}

async function handleModalSubmit(inter: Discord.ModalSubmitInteraction) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const welcomeGoodbyeConfig = await loadConfig(inter)

	if (inter.customId === 'welcome_goodbye_welcome_message_modal') {
		const newMessage = inter.fields.getTextInputValue('welcome_message')

		// Update components
		if (!welcomeGoodbyeConfig.components) {
			welcomeGoodbyeConfig.components = {}
		}
		if (!welcomeGoodbyeConfig.components.welcome_message) {
			welcomeGoodbyeConfig.components.welcome_message = { components: [] }
		}

		welcomeGoodbyeConfig.components.welcome_message.components = [
			{
				type: Discord.ComponentType.TextDisplay,
				content: newMessage,
			} as unknown as ComponentsV2,
		]

		await saveConfig(inter, welcomeGoodbyeConfig)

		await inter.followUp({
			content: '✅ Welcome message updated successfully',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await handleWelcomeMessageConfig(inter, welcomeGoodbyeConfig)
	} else if (inter.customId === 'welcome_goodbye_goodbye_message_modal') {
		const newMessage = inter.fields.getTextInputValue('goodbye_message')

		// Update components
		if (!welcomeGoodbyeConfig.components) {
			welcomeGoodbyeConfig.components = {}
		}
		if (!welcomeGoodbyeConfig.components.goodbye_message) {
			welcomeGoodbyeConfig.components.goodbye_message = { components: [] }
		}

		welcomeGoodbyeConfig.components.goodbye_message.components = [
			{
				type: Discord.ComponentType.TextDisplay,
				content: newMessage,
			} as unknown as ComponentsV2,
		]

		await saveConfig(inter, welcomeGoodbyeConfig)

		await inter.followUp({
			content: '✅ Goodbye message updated successfully',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await handleGoodbyeMessageConfig(inter, welcomeGoodbyeConfig)
	}
}

/* -------------------------------------------------------------------------- */
/*                            HELPER HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleEditWelcomeMessage(inter: Discord.ButtonInteraction) {
	const welcomeGoodbyeConfig = await loadConfig(inter)

	const modal = new Discord.ModalBuilder()
		.setCustomId('welcome_goodbye_welcome_message_modal')
		.setTitle('Edit Welcome Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('welcome_message')
		.setLabel('Welcome Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setValue(getCurrentWelcomeMessage(welcomeGoodbyeConfig))
		.setRequired(true)
		.setMaxLength(2000)

	const messageRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			messageInput
		)
	modal.addComponents(messageRow)

	await inter.showModal(modal)
}

async function handleEditGoodbyeMessage(inter: Discord.ButtonInteraction) {
	const welcomeGoodbyeConfig = await loadConfig(inter)

	const modal = new Discord.ModalBuilder()
		.setCustomId('welcome_goodbye_goodbye_message_modal')
		.setTitle('Edit Goodbye Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('goodbye_message')
		.setLabel('Goodbye Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setValue(getCurrentGoodbyeMessage(welcomeGoodbyeConfig))
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
		| Discord.RoleSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.StringSelectMenuInteraction
) {
	const welcomeGoodbyeConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# 👋 **Welcome & Goodbye System Configuration**\n\n',
			`System Status: ${welcomeGoodbyeConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/welcome.png'
		)
	)

	// Create sections
	const welcomeSection = V2.makeTextDisplay(
		[
			'## 👋 **Welcome Configuration**\n',
			`Welcome Channel: ${welcomeGoodbyeConfig.welcome_channel_id ? `<#${welcomeGoodbyeConfig.welcome_channel_id}>` : '❌ Not Set'}\n`,
			`Welcome Message: ${getCurrentWelcomeMessage(welcomeGoodbyeConfig) !== 'Welcome to {server}, {user}! 🎉' ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	const goodbyeSection = V2.makeTextDisplay(
		[
			'## 👋 **Goodbye Configuration**\n',
			`Goodbye Channel: ${welcomeGoodbyeConfig.leave_channel_id ? `<#${welcomeGoodbyeConfig.leave_channel_id}>` : '❌ Not Set'}\n`,
			`Goodbye Message: ${getCurrentGoodbyeMessage(welcomeGoodbyeConfig) !== '{username} has left {server}. 👋' ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	const rolesSection = V2.makeTextDisplay(
		[
			'## 🎭 **Auto-Assign Roles**\n',
			`Join Roles: ${welcomeGoodbyeConfig.join_role_ids?.length ? `✅ ${welcomeGoodbyeConfig.join_role_ids.length} roles` : '❌ None Set'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'welcome_goodbye_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: welcomeGoodbyeConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'welcome_goodbye_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !welcomeGoodbyeConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('welcome_goodbye_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Welcome Message',
				value: 'welcome_message',
				description: 'Configure welcome message and channel',
				emoji: '👋',
			},
			{
				label: 'Goodbye Message',
				value: 'goodbye_message',
				description: 'Configure goodbye message and channel',
				emoji: '👋',
			},
			{
				label: 'Auto-Assign Roles',
				value: 'join_roles',
				description: 'Set roles given to new members',
				emoji: '🎭',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			welcomeSection,
			spacer,
			goodbyeSection,
			spacer,
			rolesSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}
