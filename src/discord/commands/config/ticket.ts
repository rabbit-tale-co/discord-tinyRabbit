import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import { ID } from '@/discord/commands/constants.js'
import type { DefaultConfigs } from '@/types/plugins.js'
import {
	loadCfg,
	saveCfg,
} from '@/discord/commands/moderation/tickets/limits.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import {
	ticketUtils,
	formatTimeThreshold,
	UI_BUILDERS,
	type TIME_VALUE_PRESETS,
} from '@/utils/tickets.js'
import * as V2 from 'discord-components-v2'

// Map to store original interactions for updates
const original_config_interactions = new Map<
	string,
	Discord.StringSelectMenuInteraction
>()

/* -------------------------------------------------------------------------- */
/*                            SECTION HELPERS                                   */
/* -------------------------------------------------------------------------- */

// Helper functions for common section patterns
const SECTION_BUILDERS = {
	addRoleLimit: (roles: string[], selectedUnit?: string) => {
		const titleSection = V2.makeSection(
			[
				'## ➕ **Add Role Time Limit**',
				'> Select roles and time unit to configure time limits.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_role_limits',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const selectedRoleSection = V2.makeTextDisplay(
			[
				'### 📊 **Selected Role**',
				roles.length > 0 ? `<@&${roles[0]}>` : 'No role selected',
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const stepsSection = V2.makeTextDisplay(
			[
				'### ⚙️ **Configuration Steps**',
				'1. ✅ Select role that should have time limit',
				selectedUnit
					? '2. ✅ Choose the time unit (seconds, minutes, hours, days)'
					: '2. ⏳ Choose the time unit (after selecting role)',
				selectedUnit
					? `3. 🔢 Choose the specific ${selectedUnit === 'predefined' ? 'time value' : selectedUnit} value`
					: '3. 🔢 Choose the specific time value',
			].join('\n')
		)

		const separator3 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			selectedRoleSection,
			separator2,
			stepsSection,
			separator3,
		}
	},

	removeRoleLimit: (
		roleTimeLimitsArray: Array<{
			role_id: string
			threshold?: number
			limit?: string
		}>,
		excludedRoles: string[] = []
	) => {
		const titleSection = V2.makeSection(
			[
				'## ➖ **Remove Role Time Limit**',
				'> Select the roles to remove time limits from or excluded roles.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_role_limits',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		// Prepare time limits content
		const timeLimitsContent =
			roleTimeLimitsArray.length === 0
				? ['> No role time limits configured yet.']
				: roleTimeLimitsArray.map((limit, index) => {
						const threshold = extractThresholdInSeconds(limit)
						const formattedTime = formatTimeThreshold(threshold * 1000)
						return `${index + 1}. <@&${limit.role_id}>: ${formattedTime}`
					})

		// Prepare excluded roles content
		const excludedContent =
			excludedRoles.length === 0
				? ['> No excluded roles configured yet.']
				: excludedRoles.map(
						(roleId, index) => `${index + 1}. <@&${roleId}>: No limit`
					)

		const limitsSection = V2.makeTextDisplay(
			[
				'### 📋 **Time Limits**',
				...timeLimitsContent,
				'',
				'### 🚫 **Excluded Roles (No Limits)**',
				...excludedContent,
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			limitsSection,
			separator2,
		}
	},

	editRoleLimit: (
		roleTimeLimitsArray: Array<{
			role_id: string
			threshold?: number
			limit?: string
		}>,
		excludedRoles: string[] = []
	) => {
		const titleSection = V2.makeSection(
			[
				'## ✏️ **Edit Role Time Limit**',
				'> Select a role to edit its time limit.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_role_limits',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		// Prepare time limits content
		const timeLimitsContent =
			roleTimeLimitsArray.length === 0
				? ['> No role time limits configured yet.']
				: roleTimeLimitsArray.map((limit, index) => {
						const threshold = extractThresholdInSeconds(limit)
						const formattedTime = formatTimeThreshold(threshold * 1000)
						return `${index + 1}. <@&${limit.role_id}>: ${formattedTime}`
					})

		// Prepare excluded roles content
		const excludedContent =
			excludedRoles.length === 0
				? ['> No excluded roles configured yet.']
				: excludedRoles.map(
						(roleId, index) => `${index + 1}. <@&${roleId}>: No limit`
					)

		const currentLimitsSection = V2.makeTextDisplay(
			[
				'### 📋 **Time Limits**',
				...timeLimitsContent,
				'',
				'### 🚫 **Excluded Roles (No Limits)**',
				...excludedContent,
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentLimitsSection,
			separator2,
		}
	},

	adminChannel: (currentChannelId?: string) => {
		const titleSection = V2.makeSection(
			[
				'## 📢 **Admin Channel Configuration**',
				'> Set the channel where ticket system notifications will be sent to administrators.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_main',
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
				`**Admin Channel**: ${currentChannelId ? `<#${currentChannelId}>` : '❌ Not Set'}`,
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const separator3 = V2.makeSeparator({
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

	transcriptChannel: (currentChannelId?: string) => {
		const titleSection = V2.makeSection(
			[
				'## 📝 **Transcript Channel Configuration**',
				'> Set the channel where ticket transcripts will be saved after closure.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_main',
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
				`**Transcript Channel**: ${currentChannelId ? `<#${currentChannelId}>` : '❌ Not Set'}`,
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

	moderatorRoles: (currentRoleIds?: string[]) => {
		const titleSection = V2.makeSection(
			[
				'## 👮 **Moderator Roles Configuration**',
				'> Set the roles that can manage and moderate tickets.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const rolesText = currentRoleIds?.length
			? currentRoleIds.map((id) => `<@&${id}>`).join(', ')
			: '❌ No roles set'

		const currentSettingsSection = V2.makeTextDisplay(
			['### 📊 **Current Settings**', `**Moderator Roles**: ${rolesText}`].join(
				'\n'
			)
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

	autoClose: (isEnabled: boolean, currentThreshold: number) => {
		const titleSection = V2.makeSection(
			[
				'## ⏰ **Auto-close Configuration**',
				'> Configure automatic ticket closing for inactive tickets to keep your server organized.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_main',
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
				`**Status**: ${isEnabled ? '✅ **Enabled**' : '❌ **Disabled**'}`,
				`**Threshold**: ${formatTimeThreshold(currentThreshold)}`,
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const configSection = V2.makeTextDisplay(
			[
				'### ⚙️ **Configuration Steps**',
				'1. **System Control** - Enable or disable the auto-close feature below',
				'2. **Time Settings** - Select time unit to configure threshold',
			].join('\n')
		)

		const separator3 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
			configSection,
			separator3,
		}
	},

	autoCloseTimeValue: (
		isEnabled: boolean,
		currentThreshold: number,
		selectedUnit: string
	) => {
		const titleSection = V2.makeSection(
			[
				'## ⏰ **Auto-close Configuration**',
				'> Configure automatic ticket closing for inactive tickets to keep your server organized.',
			],
			V2.makeButton({
				custom_id: 'ticket_back_to_autoclose',
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
				`**Status**: ${isEnabled ? '✅ **Enabled**' : '❌ **Disabled**'}`,
				`**Current Threshold**: ${formatTimeThreshold(currentThreshold)}`,
				`**Selected Unit**: ${selectedUnit === 'predefined' ? 'Predefined Values' : selectedUnit.charAt(0).toUpperCase() + selectedUnit.slice(1)}`,
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const selectionSection = V2.makeTextDisplay(
			[
				'### ⏱️ **Time Value Selection**',
				`Select the specific ${selectedUnit === 'predefined' ? 'time value' : selectedUnit} value for the auto-close threshold:`,
				'',
				'> 💡 **Tip**: Choose a value that gives users enough time to respond while keeping inactive tickets organized.',
			].join('\n')
		)

		const separator3 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
			selectionSection,
			separator3,
		}
	},
}

/* -------------------------------------------------------------------------- */
/*                              SECTION DEFINITIONS                            */
/* -------------------------------------------------------------------------- */

/**
 * Helper function to extract threshold in seconds from role limit data,
 * handling both old format (limit: string) and new format (threshold: number)
 */
function extractThresholdInSeconds(
	limit:
		| { role_id: string; threshold?: number }
		| { role_id: string; limit?: string }
): number {
	if ('threshold' in limit && typeof limit.threshold === 'number') {
		// New format: threshold in seconds
		return limit.threshold
	}

	return 0 // Fallback for invalid data
}

/**
 * Helper function to format role limits display for main config
 */
function formatRoleLimitsDisplay(config: DefaultConfigs['tickets']): string {
	const roleTimeLimitsArray = config.role_time_limits?.included || []
	const excludedRoles = config.role_time_limits?.excluded || []

	if (roleTimeLimitsArray.length === 0 && excludedRoles.length === 0) {
		return '❌ No limits set'
	}

	const parts = []
	if (roleTimeLimitsArray.length > 0) {
		parts.push(`${roleTimeLimitsArray.length} with limits`)
	}
	if (excludedRoles.length > 0) {
		parts.push(`${excludedRoles.length} excluded`)
	}
	return `✅ ${parts.join(', ')}`
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
			`[Ticket Config] Interaction already handled: ${customId}`
		)
		return
	}

	if (!inter.inGuild() || !inter.guildId) {
		StatusLogger.warn(
			`[Ticket Config] Interaction not in guild - guildId: ${inter.guildId}`
		)
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'TC001' }
		)
		return
	}

	try {
		if (inter.isChatInputCommand()) {
			await handleInitialConfig(inter)
		} else if (inter.isStringSelectMenu()) {
			if (inter.customId === ID.ROLE_LIMIT_REMOVE_SELECT) {
				await handleRoleTimeLimitRemoveSelect(inter)
			} else if (inter.customId === 'tickets:select:role_limit_edit') {
				await handleRoleTimeLimitEditSelect(inter)
			} else if (inter.customId === 'excluded_role_remove_select') {
				await handleExcludedRoleRemoveSelect(inter)
			} else if (inter.customId === 'ticket_autoclose_time_unit_select') {
				await handleAutoCloseTimeUnitSelect(inter)
			} else if (
				inter.customId.startsWith('ticket_autoclose_time_value_select_')
			) {
				await handleAutoCloseTimeValueSelect(inter)
			} else if (inter.customId.startsWith('role_limit_time_unit_')) {
				await handleRoleLimitTimeUnitSelect(inter)
			} else if (inter.customId.startsWith('role_limit_time_value_')) {
				await handleRoleLimitTimeValueSelect(inter)
			} else {
				await handleConfigSelect(inter)
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
			'[Ticket Config] Unhandled error in main config function:',
			error
		)

		// Try to respond with error using V2 components
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
				'[Ticket Config] Failed to send error response:',
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
			'You do not have permission to manage ticket configuration',
			{ code: 'TC002' }
		)
		return
	}

	const ticketConfig = await loadCfg(inter)

	// Calculate status values with migration logic for old seconds-based data
	let thresholdInMs = ticketConfig.auto_close?.[0]?.threshold ?? 0
	// If threshold is less than 1 hour in ms (3600000), assume it's in seconds and convert
	if (thresholdInMs > 0 && thresholdInMs < 3600000) {
		thresholdInMs = thresholdInMs * 1000
	}

	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(thresholdInMs)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleLimits = formatRoleLimitsDisplay(ticketConfig)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# 🎫 Ticket System Configuration\n\n',
			`System Status: ${ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/ticket.png'
		)
	)

	// Create sections with pre-generated emoji URLs
	const channelSection = V2.makeTextDisplay(
		[
			'## 📢 Channel Configuration\n',
			`Admin Channel: ${ticketConfig.admin_channel_id ? `<#${ticketConfig.admin_channel_id}>` : '❌ Not Set'}\n`,
			`Transcript Channel: ${ticketConfig.transcript_channel_id ? `<#${ticketConfig.transcript_channel_id}>` : '❌ Not Set'}`,
		].join('')
	)

	const roleSection = V2.makeTextDisplay(
		[
			'## 👮 Role Configuration\n',
			`Moderator Roles: ${ticketConfig.mods_role_ids?.length ? ticketConfig.mods_role_ids.map((r) => `<@&${r}>`).join(' ') : '❌ None Set'}`,
		].join('')
	)

	const limitSection = V2.makeTextDisplay(
		[
			'## ⚙️ System Limits\n',
			`Auto-close: ${autoClose}\n`,
			`Role Time Limits: ${roleLimits}`,
		].join('')
	)

	// Create status buttons at bottom
	const statusButtons = [
		V2.makeButton({
			custom_id: 'ticket_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: ticketConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'ticket_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !ticketConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect(ID.CONFIG_SELECT)
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Admin Channel',
				value: 'admin_channel',
				description: 'Set admin notification channel',
				emoji: '📢',
			},
			{
				label: 'Transcript Channel',
				value: 'transcript_channel',
				description: 'Set ticket transcript channel',
				emoji: '📝',
			},
			{
				label: 'Moderator Roles',
				value: 'mod_roles',
				description: 'Set ticket management roles',
				emoji: '👮',
			},
			{
				label: 'Auto-close',
				value: 'auto_close',
				description: 'Set inactive ticket auto-close',
				emoji: '⏰',
			},
			{
				label: 'Role Limits',
				value: 'role_time_limits',
				description: 'Set role-based time limits',
				emoji: '⌛',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			channelSection,
			spacer,
			roleSection,
			spacer,
			limitSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleConfigSelect(inter: Discord.StringSelectMenuInteraction) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedOption = inter.values[0]

	const ticketConfig = await loadCfg(inter)

	switch (selectedOption) {
		case 'system_status':
			await handleTicketSystemConfig(inter, ticketConfig)
			break
		case 'admin_channel':
			await handleAdminChannelConfig(inter, ticketConfig)
			break
		case 'transcript_channel':
			await handleTranscriptChannelConfig(inter, ticketConfig)
			break
		case 'mod_roles':
			await handleModRolesConfig(inter, ticketConfig)
			break
		case 'auto_close':
			await handleAutoCloseConfig(inter, ticketConfig)
			break
		case 'role_time_limits':
			await handleRoleTimeLimitsConfig(inter, ticketConfig)
			break
		default:
			StatusLogger.warn(
				`[Ticket Config] Unknown config option: ${selectedOption}`
			)
			break
	}
}

async function handleTicketSystemConfig(
	inter: Discord.StringSelectMenuInteraction | Discord.ButtonInteraction,
	config: DefaultConfigs['tickets']
) {
	const buttons = [
		V2.makeButton({
			custom_id: 'ticket_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
		}).setDisabled(config.enabled),
		V2.makeButton({
			custom_id: 'ticket_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
		}).setDisabled(config.enabled),
		V2.makeButton({
			custom_id: ID.CONFIG_BACK,
			label: '← Back to Settings',
			style: Discord.ButtonStyle.Secondary,
		}),
	]

	const buttonRow =
		new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(buttons)

	const content = [
		'# Ticket System Status',
		'',
		'## Current Status',
		config.enabled
			? '✅ The system is currently **enabled**'
			: '❌ The system is currently **disabled**',
		'',
		'## Information',
		'When the system is disabled:',
		'- Users cannot create new tickets',
		'- Existing tickets remain accessible',
		'- Moderators can still manage existing tickets',
	].join('\n')

	await inter.editReply({
		content,
		components: [buttonRow],
	})
}

async function handleChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	try {
		// Only defer if the interaction hasn't been handled yet
		if (!inter.replied && !inter.deferred) {
			await inter.deferUpdate()
		}

		const channel = inter.values[0]
		const ticketConfig = await loadCfg(inter)

		if (inter.customId === 'ticket_admin_channel_select') {
			ticketConfig.admin_channel_id = channel
			await saveCfg(inter, ticketConfig)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: `✅ Admin channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessageGeneric(inter)
		} else if (inter.customId === 'ticket_transcript_channel_select') {
			ticketConfig.transcript_channel_id = channel
			await saveCfg(inter, ticketConfig)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: `✅ Transcript channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessageGeneric(inter)
		} else {
			StatusLogger.warn(
				`[Ticket Config] Unknown channel select customId: ${inter.customId}`
			)
		}
	} catch (error) {
		StatusLogger.error('[Ticket Config] Error in handleChannelSelect:', error)

		// Try to respond with error if interaction hasn't been handled
		try {
			const errorSection = V2.makeTextDisplay(
				'❌ An error occurred while processing your selection. Please try again.'
			)

			if (!inter.replied && !inter.deferred) {
				await inter.reply({
					components: [errorSection],
					flags:
						Discord.MessageFlags.Ephemeral |
						Discord.MessageFlags.IsComponentsV2,
				})
			} else {
				await inter.followUp({
					components: [errorSection],
					flags:
						Discord.MessageFlags.Ephemeral |
						Discord.MessageFlags.IsComponentsV2,
				})
			}
		} catch (followUpError) {
			StatusLogger.error(
				'[Ticket Config] Failed to send error message:',
				followUpError
			)
		}
	}
}

async function handleRoleSelect(inter: Discord.RoleSelectMenuInteraction) {
	// Check if this will show a modal - if so, don't defer
	const willShowModal = inter.customId === 'ticket_role_limits_select'

	// Only defer if the interaction hasn't been handled yet AND it won't show a modal
	if (!inter.replied && !inter.deferred && !willShowModal) {
		await inter.deferUpdate()
	}

	const roles = inter.values
	const ticketConfig = await loadCfg(inter)

	if (inter.customId === 'ticket_mod_roles_select') {
		ticketConfig.mods_role_ids = roles
		await saveCfg(inter, ticketConfig)
		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Moderator roles set to ${roles.map((id) => `<@&${id}>`).join(', ')}`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		// Update the main config message
		await updateMainConfigMessageGeneric(inter)
	} else if (inter.customId === 'ticket_role_limits_select') {
		// Legacy modal approach
		const modal = new Discord.ModalBuilder()
			.setCustomId(`ticket_role_limits_modal_${roles.join(',')}`)
			.setTitle('Role Time Limits')

		const limitRow =
			new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
				new Discord.TextInputBuilder()
					.setCustomId('limit')
					.setLabel('Time limit between tickets (hours)')
					.setStyle(Discord.TextInputStyle.Short)
					.setValue('24')
					.setRequired(true)
			)

		modal.addComponents(limitRow)

		await inter.showModal(modal)
	} else if (inter.customId === 'ticket_excluded_role_select') {
		await handleExcludedRoleSelect(inter)
	} else if (inter.customId === ID.ROLE_LIMIT_SELECT) {
		// Use SECTION_BUILDERS for consistent structure
		const sections = SECTION_BUILDERS.addRoleLimit(roles)

		// Create time unit selector with roles encoded in custom_id
		const timeUnitSelect = V2.makeStringSelect(
			`role_limit_time_unit_${roles.join(',')}`
		)
			.setPlaceholder('Select time unit...')
			.addOptions([
				{ label: 'Seconds', value: 'seconds', emoji: '⚡' },
				{ label: 'Minutes', value: 'minutes', emoji: '⏱️' },
				{ label: 'Hours', value: 'hours', emoji: '🕐' },
				{ label: 'Days', value: 'days', emoji: '📅' },
				{ label: 'Weeks', value: 'weeks', emoji: '🗓️' },
				{ label: 'Predefined Values', value: 'predefined', emoji: '⭐' },
				{ label: 'Excluded (No limit)', value: 'excluded', emoji: '🚫' },
			])

		const timeUnitRow = V2.makeActionRow([timeUnitSelect])

		await inter.editReply({
			components: [
				sections.titleSection,
				sections.separator1,
				sections.selectedRoleSection,
				sections.separator2,
				sections.stepsSection,
				sections.separator3,
				timeUnitRow,
			],
			flags: Discord.MessageFlags.IsComponentsV2,
		})
	} else {
		StatusLogger.warn(
			`[Ticket Config] Unknown role select customId: ${inter.customId}`
		)
	}
}

async function handleModalSubmit(inter: Discord.ModalSubmitInteraction) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const ticketConfig = await loadCfg(inter)

	if (inter.customId.startsWith('ticket_role_limits_modal_')) {
		const roles = inter.customId.split('_').pop()?.split(',') ?? []
		const limit =
			Number.parseInt(inter.fields.getTextInputValue('limit')) * 3600 // Convert hours to seconds

		if (Number.isNaN(limit) || limit < 0) {
			StatusLogger.warn(`[Ticket Config] Invalid limit value: ${limit}`)
			// Send error message as ephemeral follow-up
			await inter.followUp({
				content: '❌ Time limit must be a number greater than or equal to 0',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return
		}

		ticketConfig.role_time_limits = {
			included: roles.map((roleId) => ({
				role_id: roleId,
				threshold: limit,
			})),
		}

		await saveCfg(inter, ticketConfig)

		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Time limits set to ${limit / 3600} hours for roles: ${roles.map((id) => `<@&${id}>`).join(', ')}`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		// Update the main config message
		await updateMainConfigMessageGeneric(inter)
	} else {
		StatusLogger.warn(
			`[Ticket Config] Unknown modal customId: ${inter.customId}`
		)
	}
}

/* -------------------------------------------------------------------------- */
/*                            CONFIG HANDLERS                                   */
/* -------------------------------------------------------------------------- */

async function handleAdminChannelConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
) {
	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.adminChannel(config.admin_channel_id)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'ticket_admin_channel_select',
		placeholder: 'Select admin notification channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

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

async function handleTranscriptChannelConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
) {
	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.transcriptChannel(
		config.transcript_channel_id
	)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'ticket_transcript_channel_select',
		placeholder: 'Select transcript channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

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

async function handleModRolesConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
) {
	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.moderatorRoles(config.mods_role_ids)

	const roleSelect = V2.makeRoleSelect({
		custom_id: 'ticket_mod_roles_select',
		placeholder: 'Select moderator roles',
		min_values: 1,
		max_values: 10,
	})

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

async function handleAutoCloseConfig(
	inter: Discord.StringSelectMenuInteraction | Discord.ButtonInteraction,
	config: DefaultConfigs['tickets']
) {
	const currentAutoClose = config.auto_close?.[0]
	const isEnabled = currentAutoClose?.enabled ?? false
	let currentThreshold = currentAutoClose?.threshold ?? 86400000 // 24 hours in ms

	// Migration logic: if threshold looks like seconds (< 1 hour in ms), convert to ms
	if (currentThreshold > 0 && currentThreshold < 3600000) {
		currentThreshold = currentThreshold * 1000
	}

	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.autoClose(isEnabled, currentThreshold)

	// Create enable/disable buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'ticket_autoclose_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: isEnabled,
		}),
		V2.makeButton({
			custom_id: 'ticket_autoclose_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !isEnabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	// Create time unit select menu
	const timeUnitSelect = V2.makeStringSelect(
		'ticket_autoclose_time_unit_select'
	)
		.setPlaceholder('Select time unit...')
		.addOptions([
			{
				label: 'Seconds',
				value: 'seconds',
				description: 'Configure in seconds (5-60)',
				emoji: '⏱️',
			},
			{
				label: 'Minutes',
				value: 'minutes',
				description: 'Configure in minutes (1-60)',
				emoji: '⏰',
			},
			{
				label: 'Hours',
				value: 'hours',
				description: 'Configure in hours (1-72)',
				emoji: '🕐',
			},
			{
				label: 'Days',
				value: 'days',
				description: 'Configure in days (1-30)',
				emoji: '📅',
			},
		])

	const timeUnitRow = V2.makeActionRow([timeUnitSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			statusRow,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			sections.configSection,
			sections.separator3,
			timeUnitRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleAutoCloseTimeUnitSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedUnit = inter.values[0]
	const config = await loadCfg(inter)

	// Get current settings
	const currentAutoClose = config.auto_close?.[0]
	const isEnabled = currentAutoClose?.enabled ?? false
	let currentThreshold = currentAutoClose?.threshold ?? 86400000 // 24 hours in ms

	// Migration logic: if threshold looks like seconds (< 1 hour in ms), convert to ms
	if (currentThreshold > 0 && currentThreshold < 3600000) {
		currentThreshold = currentThreshold * 1000
	}

	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.autoCloseTimeValue(
		isEnabled,
		currentThreshold,
		selectedUnit
	)

	// Generate time value options for the selected unit
	const timeOptions = generateTimeValueOptions(selectedUnit)

	// Create time value select menu
	const timeValueSelect = V2.makeStringSelect(
		`ticket_autoclose_time_value_select_${selectedUnit}`
	)
		.setPlaceholder(
			`Select ${selectedUnit === 'predefined' ? 'time value' : selectedUnit}...`
		)
		.addOptions(timeOptions)

	const timeValueRow = V2.makeActionRow([timeValueSelect])

	const statusButtons = [
		V2.makeButton({
			custom_id: 'ticket_autoclose_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: isEnabled,
		}),
		V2.makeButton({
			custom_id: 'ticket_autoclose_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !isEnabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	await inter.editReply({
		components: [
			sections.titleSection,
			statusRow,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			sections.selectionSection,
			sections.separator3,
			timeValueRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleAutoCloseTimeValueSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedValue = inter.values[0] // e.g., "1800" (seconds)
	const config = await loadCfg(inter)

	// Value is in seconds, convert to milliseconds for storage
	const thresholdInSeconds = Number.parseInt(selectedValue)
	const thresholdInMs = thresholdInSeconds * 1000

	// Update config
	config.auto_close = [
		{
			enabled: config.auto_close?.[0]?.enabled ?? false,
			threshold: thresholdInMs,
			reason: 'Ticket closed due to inactivity',
		},
	]

	await saveCfg(inter, config)

	await inter.followUp({
		content: `✅ Auto-close threshold set to ${formatTimeThreshold(thresholdInMs)}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	// Return to auto close config view
	await handleAutoCloseConfig(inter, config)
}

/**
 * Shared helper function to generate time value options for selectors
 * Used by both auto-close and role time limit functionality
 * @param timeUnit - The time unit to generate options for (seconds, minutes, hours, days, weeks)
 * @returns Array of options for select menu
 */
function generateTimeValueOptions(
	timeUnit: string
): Array<{ label: string; value: string }> {
	const options: Array<{ label: string; value: string }> = []

	switch (timeUnit) {
		case 'seconds': {
			// Add options for seconds at 5-second intervals (max 25 options)
			for (let i = 5; i <= 60; i += 5) {
				options.push({
					label: `${i} seconds`,
					value: i.toString(), // Store as seconds
				})
			}
			break
		}

		case 'minutes': {
			// Add options for minutes at intervals (max 25 options)
			const minuteValues = [
				1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
			]
			for (const i of minuteValues) {
				const seconds = i * 60
				options.push({
					label: `${i} minutes`,
					value: seconds.toString(), // Convert to seconds and store
				})
			}
			break
		}

		case 'hours': {
			// Add selected hour options within 25 option limit
			const hourValues = [1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72]
			for (const i of hourValues) {
				const seconds = i * 3600
				options.push({
					label: `${i} hours`,
					value: seconds.toString(), // Convert to seconds and store
				})
			}
			break
		}

		case 'days': {
			// Add selected day options within 25 option limit
			const dayValues = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30]
			for (const i of dayValues) {
				const seconds = i * 86400
				options.push({
					label: `${i} days`,
					value: seconds.toString(), // Convert to seconds and store
				})
			}
			break
		}

		case 'weeks': {
			// Add options 1-4 weeks with proper formatted values
			for (let i = 1; i <= 4; i++) {
				const seconds = i * 604800 // 7 days in seconds
				options.push({
					label: `${i} weeks`,
					value: seconds.toString(), // Convert to seconds and store
				})
			}
			break
		}

		case 'predefined': {
			// Add predefined time options from UI_COMPONENTS
			const predefinedOptions = [
				{ label: '5 minutes', value: '300' },
				{ label: '15 minutes', value: '900' },
				{ label: '30 minutes', value: '1800' },
				{ label: '1 hour', value: '3600' },
				{ label: '2 hours', value: '7200' },
				{ label: '6 hours', value: '21600' },
				{ label: '12 hours', value: '43200' },
				{ label: '1 day', value: '86400' },
				{ label: '2 days', value: '172800' },
				{ label: '3 days', value: '259200' },
				{ label: '1 week', value: '604800' },
			]
			options.push(...predefinedOptions)
			break
		}
	}

	return options
}

async function handleRoleLimitTimeUnitSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedUnit = inter.values[0]

	// Extract roles from custom_id
	const roles = inter.customId.replace('role_limit_time_unit_', '').split(',')

	// Handle "excluded" option directly
	if (selectedUnit === 'excluded') {
		const config = await loadCfg(inter)

		// Initialize role_time_limits structure if needed
		if (!config.role_time_limits) {
			config.role_time_limits = { included: [], excluded: [] }
		}
		if (!config.role_time_limits.excluded) {
			config.role_time_limits.excluded = []
		}
		if (!config.role_time_limits.included) {
			config.role_time_limits.included = []
		}

		// Get roles that need to be moved to excluded
		const rolesToMove = []
		const rolesToAdd = []

		for (const roleId of roles) {
			const isInIncluded = config.role_time_limits.included.some(
				(limit) => limit.role_id === roleId
			)
			const isInExcluded = config.role_time_limits.excluded.includes(roleId)

			if (isInIncluded) {
				rolesToMove.push(roleId) // Move from included to excluded
			} else if (!isInExcluded) {
				rolesToAdd.push(roleId) // Add new to excluded
			}
		}

		if (rolesToMove.length === 0 && rolesToAdd.length === 0) {
			await inter.followUp({
				content: '❌ All selected roles are already in the excluded list.',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return
		}

		// Remove roles from included list
		config.role_time_limits.included = config.role_time_limits.included.filter(
			(limit) => !roles.includes(limit.role_id)
		)

		// Add all roles to excluded list (avoid duplicates)
		const allRolesToExclude = [...rolesToMove, ...rolesToAdd]
		config.role_time_limits.excluded.push(...allRolesToExclude)

		await saveCfg(inter, config)

		// Show success message
		const allProcessedRoles = [...rolesToMove, ...rolesToAdd]
		const rolesText = allProcessedRoles.map((id) => `<@&${id}>`).join(', ')

		let message = '✅ '
		if (rolesToMove.length > 0 && rolesToAdd.length > 0) {
			message += `Moved ${rolesToMove.length} roles from time limits and added ${rolesToAdd.length} new roles to excluded: ${rolesText}`
		} else if (rolesToMove.length > 0) {
			message += `Moved to excluded roles: ${rolesText}`
		} else {
			message += `Added to excluded roles: ${rolesText}`
		}

		await inter.followUp({
			content: message,
			flags: Discord.MessageFlags.Ephemeral,
		})

		// Return to role limits config
		await handleRoleTimeLimitsConfig(inter, config)
		return
	}

	// Generate time value options for the selected unit
	const timeOptions = generateTimeValueOptions(selectedUnit)

	// Create time value select menu with roles encoded
	const timeValueSelect = V2.makeStringSelect(
		`role_limit_time_value_${selectedUnit}_${roles.join(',')}`
	)
		.setPlaceholder(
			`Select ${selectedUnit === 'predefined' ? 'time value' : selectedUnit}...`
		)
		.addOptions(timeOptions)

	const timeValueRow = V2.makeActionRow([timeValueSelect])

	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.addRoleLimit(roles, selectedUnit)

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.selectedRoleSection,
			sections.separator2,
			sections.stepsSection,
			sections.separator3,
			timeValueRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRoleLimitTimeValueSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedValue = inter.values[0] // e.g., "1800" (seconds)

	// Extract unit and roles from custom_id: role_limit_time_value_{unit}_{roles}
	const parts = inter.customId.replace('role_limit_time_value_', '').split('_')
	const unit = parts[0]
	const roles = parts.slice(1).join('_').split(',')

	// Value is already in seconds
	const thresholdInSeconds = Number.parseInt(selectedValue)

	if (Number.isNaN(thresholdInSeconds) || thresholdInSeconds <= 0) {
		await inter.followUp({
			content: '❌ Invalid time value. Please try again.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	const config = await loadCfg(inter)

	// Get existing limits
	const existingLimits = config.role_time_limits?.included || []

	// Filter out any existing limits for the same roles to avoid duplicates
	const filteredLimits = existingLimits.filter(
		(existing) => !roles.includes(existing.role_id)
	)

	// Remove roles from excluded list if they're getting time limits
	const currentExcluded = config.role_time_limits?.excluded || []
	const filteredExcluded = currentExcluded.filter(
		(roleId) => !roles.includes(roleId)
	)

	// Update the config with new time limits
	config.role_time_limits = {
		excluded: filteredExcluded,
		included: [
			...filteredLimits,
			...roles.map((roleId) => ({
				role_id: roleId,
				threshold: thresholdInSeconds,
			})),
		],
	}

	await saveCfg(inter, config)

	// Show success message
	const formattedTime = formatTimeThreshold(thresholdInSeconds * 1000)
	const roleText = `<@&${roles[0]}>`

	let actionText = 'Set'
	if (roles.length === 1) {
		const roleId = roles[0]
		const wasInExcluded = currentExcluded.includes(roleId)
		const wasInIncluded = existingLimits.some((l) => l.role_id === roleId)

		if (wasInExcluded) {
			actionText = 'Moved from excluded and set'
		} else if (wasInIncluded) {
			actionText = 'Updated'
		}
	}

	await inter.followUp({
		content: `✅ ${actionText} time limit of ${formattedTime} for role: ${roleText}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	// Return to role limits config view
	await handleRoleTimeLimitsConfig(inter, config)
}

async function handleRoleTimeLimitsConfig(
	interaction:
		| Discord.StringSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction,
	config: DefaultConfigs['tickets']
): Promise<void> {
	try {
		// Get role time limits from included and excluded properties
		const roleTimeLimitsArray = config.role_time_limits?.included || []
		const excludedRoles = config.role_time_limits?.excluded || []

		// Prepare list of limits for display
		let limitsContent = ''
		if (roleTimeLimitsArray.length === 0) {
			limitsContent = '> No role time limits configured yet.'
		} else {
			limitsContent = `\n${roleTimeLimitsArray
				.map((limit, index) => {
					// Handle migration from old format to new format
					let thresholdInSeconds: number
					if ('threshold' in limit && typeof limit.threshold === 'number') {
						// New format: threshold in seconds
						thresholdInSeconds = limit.threshold
					} else if (
						'limit' in limit &&
						typeof (limit as { role_id: string; limit: string }).limit ===
							'string'
					) {
						// Old format: convert limit string to seconds
						const legacyLimit = (limit as { role_id: string; limit: string })
							.limit
						const ms = ticketUtils.parseTimeValue(legacyLimit)
						thresholdInSeconds = Math.floor(ms / 1000)
					} else {
						thresholdInSeconds = 0 // Fallback for invalid data
					}

					const displayTime = formatTimeThreshold(thresholdInSeconds * 1000)
					return `${index + 1}. <@&${limit.role_id}> (${displayTime})`
				})
				.join('\n')}`
		}

		// Prepare list of excluded roles for display
		let excludedContent = ''
		if (excludedRoles.length === 0) {
			excludedContent = '> No excluded roles configured yet.'
		} else {
			excludedContent = `\n${excludedRoles
				.map((roleId, index) => `${index + 1}. <@&${roleId}> (No limit)`)
				.join('\n')}`
		}

		// Create V2 components with back button as accessory
		const backButton = V2.makeButton({
			custom_id: 'ticket_back_to_main',
			label: 'Back',
			style: Discord.ButtonStyle.Secondary,
		})

		const titleSection = V2.makeSection(
			[
				'## ⏰ **Role Time Limits Configuration**',
				'> Control how frequently users with specific roles can create new tickets.\n-# For example, you can set that users with @Member role can only create a new ticket every 24 hours.',
			],
			backButton
		)

		const separator = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		// Create details section for time limits and excluded roles
		const detailsSection = V2.makeTextDisplay(
			[
				'### 📊 **Time Limits**',
				roleTimeLimitsArray.length === 0
					? '> No role time limits configured yet.'
					: limitsContent,
				'',
				'### 🚫 **Excluded Roles (Bypass All Limits)**',
				excludedContent,
				'',
				'### ⚙️ **Management**',
				'Use the buttons below to manage role time limits:',
			].join('\n')
		)

		// Create action buttons using V2
		const limitsButtons = [
			V2.makeButton({
				custom_id: ID.ROLE_LIMIT_ADD,
				label: 'Add Limit',
				style: Discord.ButtonStyle.Primary,
			}),
			V2.makeButton({
				custom_id: ID.ROLE_LIMIT_EDIT,
				label: 'Edit Limit',
				style: Discord.ButtonStyle.Secondary,
				disabled: roleTimeLimitsArray.length === 0,
			}),
			V2.makeButton({
				custom_id: ID.ROLE_LIMIT_REMOVE,
				label: 'Remove Limit',
				style: Discord.ButtonStyle.Danger,
				disabled: roleTimeLimitsArray.length === 0,
			}),
		]
		const limitsRow = V2.makeActionRow(limitsButtons)

		// Send the configuration message with V2 components
		try {
			await interaction.editReply({
				components: [titleSection, separator, detailsSection, limitsRow],
				flags: Discord.MessageFlags.IsComponentsV2,
			})

			// Store the original interaction for later updates
			const cacheKey = `${interaction.guild.id}_role_time_limits`
			original_config_interactions.set(
				cacheKey,
				interaction as Discord.StringSelectMenuInteraction
			)
		} catch (err) {
			console.error(
				`Error updating role time limits config message: ${err.message}`
			)
			throw err
		}
	} catch (error) {
		console.error('Error displaying role time limits:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'Failed to load role time limits configuration.',
			{
				code: 'RTL001',
				error: error,
			}
		)
	}
}

export async function handleTimeUnitSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const config = await loadCfg(inter)

	// Get selected roles from the role select menu
	const selectedRoles = inter.values

	const selectedUnit = inter.values[0]

	// Type check the selected unit
	type TimeUnit = keyof typeof TIME_VALUE_PRESETS
	const validUnits: TimeUnit[] = [
		'seconds',
		'minutes',
		'hours',
		'days',
		'weeks',
	]

	if (!validUnits.includes(selectedUnit as TimeUnit)) {
		await inter.followUp({
			content: '❌ Invalid time unit selected. Please try again.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	const timeOptions = ticketUtils.generateTimeValueOptions(
		selectedUnit as TimeUnit
	)

	const timeValueSelect = new Discord.StringSelectMenuBuilder()
		.setCustomId(ID.ROLE_LIMIT_TIME_VALUE(selectedRoles.join(',')))
		.setPlaceholder(`Select ${selectedUnit}`)
		.addOptions(timeOptions)

	const timeValueRow =
		new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
			timeValueSelect
		)

	const roleSelectRow = UI_BUILDERS.createRoleSelectRow(
		ID.ROLE_LIMIT_SELECT,
		'Selected roles',
		1,
		10
	)

	// Disable the role select menu since roles are already selected
	roleSelectRow.components[0].setDisabled(true)

	// Convert to V2 components
	const titleSection = V2.makeTextDisplay(
		[
			'## ➕ **Add Role Time Limit**',
			`> Select the time value in ${selectedUnit}:`,
			'',
			'### ⚙️ **Configuration**',
			'1. Selected roles are shown above',
			`2. Choose the ${selectedUnit} value below`,
		].join('\n')
	)

	await inter.editReply({
		components: [titleSection, roleSelectRow, timeValueRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

export async function handleTimeValueSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const config = await loadCfg(inter)
	const selectedValue = inter.values[0]

	// Convert the selected value to milliseconds using ticketUtils
	const milliseconds = ticketUtils.parseTimeValue(selectedValue)
	if (milliseconds === 0) {
		await inter.followUp({
			content: '❌ Invalid time value format. Please try again.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	// Get selected roles from the custom_id
	const selectedRoles = inter.customId.split(':').pop()?.split(',') || []

	// Convert the selected value to seconds for new format
	const thresholdInSeconds = Math.floor(milliseconds / 1000)

	// Get existing limits
	const existingLimits = config.role_time_limits?.included || []

	// Update the config with new time limits using threshold in seconds
	config.role_time_limits = {
		excluded: config.role_time_limits?.excluded || [], // Preserve existing excluded roles
		included: [
			...existingLimits, // Keep existing limits
			...selectedRoles.map((roleId) => ({
				role_id: roleId,
				threshold: thresholdInSeconds, // Store as seconds
			})),
		],
	}

	await saveCfg(inter, config)

	// Show success message
	const formattedTime = formatTimeThreshold(milliseconds)
	const rolesText = selectedRoles.map((id) => `<@&${id}>`).join(', ')
	await inter.followUp({
		content: `✅ Set time limit of ${formattedTime} for roles: ${rolesText}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	// Return to main config view after a short delay
	setTimeout(async () => {
		await handleRoleTimeLimitsConfig(inter, config)
	}, 2000)
}

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                     */
/* -------------------------------------------------------------------------- */

export async function handleRoleTimeLimitAdd(inter: Discord.ButtonInteraction) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	// Create role select menu for adding new time limit (single role only)
	const roleSelect = V2.makeRoleSelect({
		custom_id: ID.ROLE_LIMIT_SELECT,
		placeholder: 'Select role to add time limit',
		min_values: 1,
		max_values: 1,
	})

	const roleSelectRow = V2.makeActionRow([roleSelect])

	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.addRoleLimit([])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.stepsSection,
			sections.separator2,
			roleSelectRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

export async function handleRoleTimeLimitEditSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	await inter.deferUpdate()

	const selectedRoleId = inter.values[0]

	// Use the same time unit selector as in "Add Limit" with emojis
	const timeUnitSelect = V2.makeStringSelect(
		`role_limit_time_unit_${selectedRoleId}`
	)
		.setPlaceholder('Select time unit...')
		.addOptions([
			{ label: 'Seconds', value: 'seconds', emoji: '⚡' },
			{ label: 'Minutes', value: 'minutes', emoji: '⏱️' },
			{ label: 'Hours', value: 'hours', emoji: '🕐' },
			{ label: 'Days', value: 'days', emoji: '📅' },
			{ label: 'Weeks', value: 'weeks', emoji: '🗓️' },
			{ label: 'Predefined Values', value: 'predefined', emoji: '⭐' },
			{ label: 'Excluded (No limit)', value: 'excluded', emoji: '🚫' },
		])

	const timeUnitRow = V2.makeActionRow([timeUnitSelect])

	// Create title section with back button as accessory
	const titleSection = V2.makeSection(
		[
			'## ✏️ **Edit Role Time Limit**',
			'> Select time unit to modify the time limit for this role.',
		],
		V2.makeButton({
			custom_id: 'ticket_back_to_role_limits',
			label: 'Back',
			style: Discord.ButtonStyle.Secondary,
		})
	)

	const separator1 = V2.makeSeparator({
		spacing: Discord.SeparatorSpacingSize.Large,
		divider: false,
	})

	const stepsSection = V2.makeTextDisplay(
		[
			'### ⚙️ **Configuration Steps**',
			'1. ✅ Role selected for editing',
			'2. 🔢 Choose the time unit (seconds, minutes, hours, days, weeks)',
			'3. 🔢 Choose the specific time value',
		].join('\n')
	)

	const separator2 = V2.makeSeparator({
		spacing: Discord.SeparatorSpacingSize.Large,
		divider: false,
	})

	await inter.editReply({
		components: [
			titleSection,
			separator1,
			stepsSection,
			separator2,
			timeUnitRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

export async function handleRoleTimeLimitEdit(
	inter: Discord.ButtonInteraction
) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const config = await loadCfg(inter)
	const roleTimeLimitsArray = config.role_time_limits?.included || []
	const excludedRoles = config.role_time_limits?.excluded || []

	if (roleTimeLimitsArray.length === 0 && excludedRoles.length === 0) {
		await inter.followUp({
			content:
				'No role limits or excluded roles to edit. Add some limits first.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	// Create select menu with existing roles (time limits + excluded)
	const timeLimitOptions = await Promise.all(
		roleTimeLimitsArray.map(async (limit, index) => {
			const threshold = extractThresholdInSeconds(limit)
			const formattedTime = formatTimeThreshold(threshold * 1000) // convert back to ms for formatting

			// Fetch role name instead of using Role 1, Role 2, etc.
			const role = await inter.guild?.roles
				.fetch(limit.role_id)
				.catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${limit.role_id})`

			return {
				label: `${roleName}: ${formattedTime}`,
				value: limit.role_id,
				description: 'Edit time limit for this role',
			}
		})
	)

	// Filter excluded roles to avoid duplicates (roles that already have time limits)
	const uniqueExcludedRoles = excludedRoles.filter(
		(roleId) => !roleTimeLimitsArray.some((limit) => limit.role_id === roleId)
	)

	const excludedOptions = await Promise.all(
		uniqueExcludedRoles.map(async (roleId) => {
			const role = await inter.guild?.roles.fetch(roleId).catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${roleId})`

			return {
				label: `${roleName}: No limit`,
				value: roleId,
				description: 'Edit excluded role (currently no limit)',
			}
		})
	)

	const allOptions = [...timeLimitOptions, ...excludedOptions]

	const roleEditSelect = V2.makeStringSelect('tickets:select:role_limit_edit')
		.setPlaceholder('Select role to edit...')
		.addOptions(allOptions)

	const roleEditRow = V2.makeActionRow([roleEditSelect])

	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.editRoleLimit(
		roleTimeLimitsArray,
		excludedRoles
	)

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentLimitsSection,
			sections.separator2,
			roleEditRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

export async function handleRoleTimeLimitRemove(
	inter: Discord.ButtonInteraction
) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const config = await loadCfg(inter)

	// Get role time limits from included property and excluded roles
	const roleTimeLimits = config.role_time_limits?.included || []
	const excludedRoles = config.role_time_limits?.excluded || []

	if (roleTimeLimits.length === 0 && excludedRoles.length === 0) {
		await inter.followUp({
			content: '❌ No role limits or excluded roles to remove.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	// Create options for time limit roles
	const timeLimitOptions = await Promise.all(
		roleTimeLimits.map(async (limit, index) => {
			// Handle migration from old format to new format
			let thresholdInSeconds: number
			if ('threshold' in limit && typeof limit.threshold === 'number') {
				// New format: threshold in seconds
				thresholdInSeconds = limit.threshold
			} else if (
				'limit' in limit &&
				typeof (limit as { role_id: string; limit: string }).limit === 'string'
			) {
				// Old format: convert limit string to seconds
				const legacyLimit = (limit as { role_id: string; limit: string }).limit
				const ms = ticketUtils.parseTimeValue(legacyLimit)
				thresholdInSeconds = Math.floor(ms / 1000)
			} else {
				thresholdInSeconds = 0 // Fallback for invalid data
			}

			const displayTime = formatTimeThreshold(thresholdInSeconds * 1000)

			// Fetch role name instead of using Role 1, Role 2, etc.
			const role = await inter.guild?.roles
				.fetch(limit.role_id)
				.catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${limit.role_id})`

			return {
				label: `${roleName}: ${displayTime}`,
				value: limit.role_id,
				description: 'Remove time limit',
			}
		})
	)

	// Create options for excluded roles
	const excludedOptions = await Promise.all(
		excludedRoles.map(async (roleId) => {
			const role = await inter.guild?.roles.fetch(roleId).catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${roleId})`

			return {
				label: `${roleName}: No limit`,
				value: roleId,
				description: 'Remove from excluded roles',
			}
		})
	)

	// Combine all options
	const allOptions = [...timeLimitOptions, ...excludedOptions]

	// Create select menu with all options
	const removeSelect = V2.makeStringSelect(ID.ROLE_LIMIT_REMOVE_SELECT)
		.setPlaceholder('Select roles to remove limits/exclusions')
		.setMinValues(1)
		.setMaxValues(allOptions.length)
		.addOptions(allOptions)

	const removeRow = V2.makeActionRow([removeSelect])

	// Use SECTION_BUILDERS for consistent structure
	const sections = SECTION_BUILDERS.removeRoleLimit(
		roleTimeLimits,
		excludedRoles
	)

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.limitsSection,
			sections.separator2,
			removeRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

export async function handleRoleTimeLimitRemoveSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const config = await loadCfg(inter)

	// Get selected role IDs to remove
	const selectedRoles = inter.values

	// Get current limits and excluded roles
	const currentLimits = config.role_time_limits?.included || []
	const currentExcluded = config.role_time_limits?.excluded || []

	// Separate roles into time limits to remove and excluded to remove
	const timeLimitRolesToRemove = selectedRoles.filter((roleId) =>
		currentLimits.some((limit) => limit.role_id === roleId)
	)
	const excludedRolesToRemove = selectedRoles.filter((roleId) =>
		currentExcluded.includes(roleId)
	)

	// Update config by removing selected roles from both lists
	config.role_time_limits = {
		included: currentLimits.filter(
			(limit) => !selectedRoles.includes(limit.role_id)
		),
		excluded: currentExcluded.filter(
			(roleId) => !selectedRoles.includes(roleId)
		),
	}

	await saveCfg(inter, config)

	// Create success message based on what was removed
	let message = '✅ '
	const messages = []

	if (timeLimitRolesToRemove.length > 0) {
		const timeLimitRolesText = timeLimitRolesToRemove
			.map((id) => `<@&${id}>`)
			.join(', ')
		messages.push(`Removed time limits for: ${timeLimitRolesText}`)
	}

	if (excludedRolesToRemove.length > 0) {
		const excludedRolesText = excludedRolesToRemove
			.map((id) => `<@&${id}>`)
			.join(', ')
		messages.push(`Removed from excluded roles: ${excludedRolesText}`)
	}

	message += messages.join('\n')

	await inter.followUp({
		content: message,
		flags: Discord.MessageFlags.Ephemeral,
	})

	// Return to role time limits config after a short delay
	setTimeout(async () => {
		await handleRoleTimeLimitsConfig(inter, config)
	}, 2000)
}

async function handleAddExcludedRole(inter: Discord.ButtonInteraction) {
	await inter.deferUpdate()

	const roleSelect = V2.makeRoleSelect({
		custom_id: 'ticket_excluded_role_select',
		placeholder: 'Select roles to exclude from time limits',
		min_values: 1,
		max_values: 10,
	})

	const roleSelectRow = V2.makeActionRow([roleSelect])

	const titleSection = V2.makeTextDisplay(
		[
			'## 🚫 **Add Excluded Roles**',
			'> Select roles that should bypass all time limits.',
			'',
			'### ℹ️ **Information**',
			'Users with excluded roles can create tickets without any time restrictions,',
			'even if they also have other roles with time limits.',
		].join('\n')
	)

	const backButton = V2.makeButton({
		custom_id: ID.CONFIG_BACK,
		label: 'Back to Limits Menu',
		style: Discord.ButtonStyle.Secondary,
	})
	const backRow = V2.makeActionRow([backButton])

	await inter.editReply({
		components: [titleSection, roleSelectRow, backRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRemoveExcludedRole(inter: Discord.ButtonInteraction) {
	await inter.deferUpdate()
	const config = await loadCfg(inter)

	const excludedRoles = config.role_time_limits?.excluded || []

	if (excludedRoles.length === 0) {
		await inter.followUp({
			content: '❌ No excluded roles to remove.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	const options = await Promise.all(
		excludedRoles.map(async (roleId) => {
			const role = await inter.guild?.roles.fetch(roleId).catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${roleId})`
			return {
				label: roleName,
				value: roleId,
				description: 'Remove from excluded roles',
			}
		})
	)

	const removeSelect = V2.makeStringSelect('excluded_role_remove_select')
		.setPlaceholder('Select roles to remove from excluded list')
		.addOptions(options)

	const selectRow = V2.makeActionRow([removeSelect])

	const titleSection = V2.makeTextDisplay(
		[
			'## 🚫 **Remove Excluded Roles**',
			'> Select roles to remove from the excluded list.',
			'',
			'### ℹ️ **Information**',
			'Removed roles will be subject to time limits again if they have any configured.',
		].join('\n')
	)

	const backButton = V2.makeButton({
		custom_id: ID.CONFIG_BACK,
		label: 'Back to Limits Menu',
		style: Discord.ButtonStyle.Secondary,
	})
	const backRow = V2.makeActionRow([backButton])

	await inter.editReply({
		components: [titleSection, selectRow, backRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleExcludedRoleSelect(
	inter: Discord.RoleSelectMenuInteraction
) {
	await inter.deferUpdate()
	const config = await loadCfg(inter)

	const selectedRoles = inter.values

	// Initialize role_time_limits structure if needed
	if (!config.role_time_limits) {
		config.role_time_limits = { included: [], excluded: [] }
	}
	if (!config.role_time_limits.excluded) {
		config.role_time_limits.excluded = []
	}

	// Check for duplicates and add new roles
	const newRoles = selectedRoles.filter(
		(roleId) => !config.role_time_limits.excluded.includes(roleId)
	)

	if (newRoles.length === 0) {
		await inter.followUp({
			content: '❌ All selected roles are already in the excluded list.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	// Add new roles to excluded list
	config.role_time_limits.excluded.push(...newRoles)

	await saveCfg(inter, config)

	// Show success message
	const rolesText = newRoles.map((id) => `<@&${id}>`).join(', ')
	await inter.followUp({
		content: `✅ Added to excluded roles: ${rolesText}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	// Return to role limits config
	await handleRoleTimeLimitsConfig(inter, config)
}

async function handleExcludedRoleRemoveSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	await inter.deferUpdate()
	const config = await loadCfg(inter)

	const selectedRoles = inter.values

	// Remove selected roles from excluded list
	if (!config.role_time_limits) {
		config.role_time_limits = { included: [], excluded: [] }
	}

	config.role_time_limits.excluded = config.role_time_limits.excluded.filter(
		(roleId) => !selectedRoles.includes(roleId)
	)

	await saveCfg(inter, config)

	// Show success message
	const rolesText = selectedRoles.map((id) => `<@&${id}>`).join(', ')
	await inter.followUp({
		content: `✅ Removed from excluded roles: ${rolesText}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	// Return to role limits config
	await handleRoleTimeLimitsConfig(inter, config)
}

async function handleButtonClick(inter: Discord.ButtonInteraction) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	StatusLogger.info(`[Ticket Config] Handling button: ${inter.customId}`)
	const ticketConfig = await loadCfg(inter)

	switch (inter.customId) {
		case 'ticket_system_enable':
			ticketConfig.enabled = true
			await saveCfg(inter, ticketConfig)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: '✅ Ticket system has been enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessage(inter)
			break

		case 'ticket_system_disable':
			ticketConfig.enabled = false
			await saveCfg(inter, ticketConfig)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: '✅ Ticket system has been disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessage(inter)
			break

		case ID.ROLE_LIMIT_ADD:
			await handleRoleTimeLimitAdd(inter)
			break

		case ID.ROLE_LIMIT_EDIT:
			await handleRoleTimeLimitEdit(inter)
			break

		case ID.ROLE_LIMIT_REMOVE:
			await handleRoleTimeLimitRemove(inter)
			break

		case 'role_limit_add_excluded':
			await handleAddExcludedRole(inter)
			break

		case 'role_limit_remove_excluded':
			await handleRemoveExcludedRole(inter)
			break

		case 'ticket_back_to_role_limits': {
			// Return to role time limits config
			const config = await loadCfg(inter)
			await handleRoleTimeLimitsConfig(inter, config)
			break
		}

		case 'ticket_back_to_autoclose': {
			// Return to auto-close config
			const config = await loadCfg(inter)
			await handleAutoCloseConfig(inter, config)
			break
		}

		case 'ticket_back_to_main': {
			// Return to main config
			await updateMainConfigMessage(inter)
			break
		}

		case 'ticket_autoclose_enable':
			ticketConfig.auto_close = [
				{
					enabled: true,
					threshold: ticketConfig.auto_close?.[0]?.threshold ?? 86400, // Keep existing or default to 24h
					reason: 'Ticket closed due to inactivity',
				},
			]
			await saveCfg(inter, ticketConfig)
			await inter.followUp({
				content: '✅ Auto-close has been enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Refresh the auto close config view
			await handleAutoCloseConfig(inter, ticketConfig)
			break

		case 'ticket_autoclose_disable':
			ticketConfig.auto_close = [
				{
					enabled: false,
					threshold: ticketConfig.auto_close?.[0]?.threshold ?? 86400,
					reason: 'Ticket closed due to inactivity',
				},
			]
			await saveCfg(inter, ticketConfig)
			await inter.followUp({
				content: '✅ Auto-close has been disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Refresh the auto close config view
			await handleAutoCloseConfig(inter, ticketConfig)
			break

		case 'ticket_autoclose_back_step': {
			// Return to auto-close main config (reload config first)
			const autoCloseConfig = await loadCfg(inter)
			await handleAutoCloseConfig(inter, autoCloseConfig)
			break
		}

		case 'ticket_config_back':
		case ID.CONFIG_BACK:
			await updateMainConfigMessage(inter)
			break

		default:
			StatusLogger.warn(
				`[Ticket Config] Unhandled button ID: ${inter.customId}`
			)
			break
	}
}

// Helper function to update the main config message without deferring
async function updateMainConfigMessage(inter: Discord.ButtonInteraction) {
	// Load current config
	const ticketConfig = await loadCfg(inter)

	// Calculate status values with migration logic for old seconds-based data
	let thresholdInMs = ticketConfig.auto_close?.[0]?.threshold ?? 0
	// If threshold is less than 1 hour in ms (3600000), assume it's in seconds and convert
	if (thresholdInMs > 0 && thresholdInMs < 3600000) {
		thresholdInMs = thresholdInMs * 1000
	}

	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(thresholdInMs)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleLimits = formatRoleLimitsDisplay(ticketConfig)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# 🎫 Ticket System Configuration\n\n',
			`System Status: ${ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/ticket.png'
		)
	)

	// Create sections with pre-generated emoji URLs
	const channelSection = V2.makeTextDisplay(
		[
			'## 📢 Channel Configuration\n',
			`Admin Channel: ${ticketConfig.admin_channel_id ? `<#${ticketConfig.admin_channel_id}>` : '❌ Not Set'}\n`,
			`Transcript Channel: ${ticketConfig.transcript_channel_id ? `<#${ticketConfig.transcript_channel_id}>` : '❌ Not Set'}`,
		].join('')
	)

	const roleSection = V2.makeTextDisplay(
		[
			'## 👮 Role Configuration\n',
			`Moderator Roles: ${ticketConfig.mods_role_ids?.length ? ticketConfig.mods_role_ids.map((r) => `<@&${r}>`).join(' ') : '❌ None Set'}`,
		].join('')
	)

	const limitSection = V2.makeTextDisplay(
		[
			'## ⚙️ System Limits\n',
			`Auto-close: ${autoClose}\n`,
			`Role Time Limits: ${roleLimits}`,
		].join('')
	)

	// Create status buttons at bottom
	const statusButtons = [
		V2.makeButton({
			custom_id: 'ticket_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: ticketConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'ticket_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !ticketConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect(ID.CONFIG_SELECT)
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Admin Channel',
				value: 'admin_channel',
				description: 'Set admin notification channel',
				emoji: '📢',
			},
			{
				label: 'Transcript Channel',
				value: 'transcript_channel',
				description: 'Set ticket transcript channel',
				emoji: '📝',
			},
			{
				label: 'Moderator Roles',
				value: 'mod_roles',
				description: 'Set ticket management roles',
				emoji: '👮',
			},
			{
				label: 'Auto-close',
				value: 'auto_close',
				description: 'Set inactive ticket auto-close',
				emoji: '⏰',
			},
			{
				label: 'Role Limits',
				value: 'role_time_limits',
				description: 'Set role-based time limits',
				emoji: '⌛',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	// Update the existing message with V2 components (no content field allowed)
	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			channelSection,
			spacer,
			roleSection,
			spacer,
			limitSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleBackToMainMenu(inter: Discord.ButtonInteraction) {
	// Use deferUpdate since we're updating the existing message
	await inter.deferUpdate()
	// Now call the helper function to update the message
	await updateMainConfigMessage(inter)
}

// Helper function to update the main config message from any interaction
async function updateMainConfigMessageGeneric(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ModalSubmitInteraction
) {
	const ticketConfig = await loadCfg(inter)

	// Calculate status values with migration logic for old seconds-based data
	let thresholdInMs = ticketConfig.auto_close?.[0]?.threshold ?? 0
	// If threshold is less than 1 hour in ms (3600000), assume it's in seconds and convert
	if (thresholdInMs > 0 && thresholdInMs < 3600000) {
		thresholdInMs = thresholdInMs * 1000
	}

	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(thresholdInMs)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleLimits = formatRoleLimitsDisplay(ticketConfig)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# 🎫 Ticket System Configuration\n\n',
			`System Status: ${ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/ticket.png'
		)
	)

	// Create sections with pre-generated emoji URLs
	const channelSection = V2.makeTextDisplay(
		[
			'## 📢 Channel Configuration\n',
			`Admin Channel: ${ticketConfig.admin_channel_id ? `<#${ticketConfig.admin_channel_id}>` : '❌ Not Set'}\n`,
			`Transcript Channel: ${ticketConfig.transcript_channel_id ? `<#${ticketConfig.transcript_channel_id}>` : '❌ Not Set'}`,
		].join('')
	)

	const roleSection = V2.makeTextDisplay(
		[
			'## 👮 Role Configuration\n',
			`Moderator Roles: ${ticketConfig.mods_role_ids?.length ? ticketConfig.mods_role_ids.map((r) => `<@&${r}>`).join(' ') : '❌ None Set'}`,
		].join('')
	)

	const limitSection = V2.makeTextDisplay(
		[
			'## ⚙️ System Limits\n',
			`Auto-close: ${autoClose}\n`,
			`Role Time Limits: ${roleLimits}`,
		].join('')
	)

	// Create status buttons at bottom
	const statusButtons = [
		V2.makeButton({
			custom_id: 'ticket_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: ticketConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'ticket_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !ticketConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect(ID.CONFIG_SELECT)
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Admin Channel',
				value: 'admin_channel',
				description: 'Set admin notification channel',
				emoji: '📢',
			},
			{
				label: 'Transcript Channel',
				value: 'transcript_channel',
				description: 'Set ticket transcript channel',
				emoji: '📝',
			},
			{
				label: 'Moderator Roles',
				value: 'mod_roles',
				description: 'Set ticket management roles',
				emoji: '👮',
			},
			{
				label: 'Auto-close',
				value: 'auto_close',
				description: 'Set inactive ticket auto-close',
				emoji: '⏰',
			},
			{
				label: 'Role Limits',
				value: 'role_time_limits',
				description: 'Set role-based time limits',
				emoji: '⌛',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			channelSection,
			spacer,
			roleSection,
			spacer,
			limitSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}
