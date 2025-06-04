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
	CONTENT_BUILDERS,
	type TIME_VALUE_PRESETS,
} from '@/utils/tickets.js'
import * as V2 from 'discord-components-v2'

// Map to store original interactions for updates
const original_config_interactions = new Map<
	string,
	Discord.StringSelectMenuInteraction
>()

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
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'TC001' }
		)
		return
	}

	if (inter.isChatInputCommand()) {
		await handleInitialConfig(inter)
	} else if (inter.isStringSelectMenu()) {
		if (inter.customId === ID.ROLE_LIMIT_REMOVE_SELECT) {
			await handleRoleTimeLimitRemoveSelect(inter)
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

	// Calculate status values
	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(ticketConfig.auto_close[0].threshold)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleTimeLimitsArray = Array.isArray(ticketConfig.role_time_limits)
		? ticketConfig.role_time_limits
		: ticketConfig.role_time_limits?.included || []

	const roleLimits = roleTimeLimitsArray.length
		? `✅ ${roleTimeLimitsArray.length} roles configured`
		: '❌ No limits set'

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
	await inter.deferUpdate()

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
	}
}

async function handleTicketSystemConfig(
	inter: Discord.StringSelectMenuInteraction | Discord.ButtonInteraction,
	config: DefaultConfigs['tickets']
) {
	const buttons = [
		V2.makeButton({
			custom_id: 'ticket_system_enable',
			label: '✅ Enable',
			style: Discord.ButtonStyle.Success,
		}).setDisabled(config.enabled),
		V2.makeButton({
			custom_id: 'ticket_system_disable',
			label: '❌ Disable',
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
		'• Users cannot create new tickets',
		'• Existing tickets remain accessible',
		'• Moderators can still manage existing tickets',
	].join('\n')

	await inter.editReply({
		content,
		components: [buttonRow],
	})
}

async function handleChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	await inter.deferUpdate()

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
		await updateMainConfigMessageFromChannelSelect(inter)
	} else if (inter.customId === 'ticket_transcript_channel_select') {
		ticketConfig.transcript_channel_id = channel
		await saveCfg(inter, ticketConfig)
		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Transcript channel set to <#${channel}>`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		// Update the main config message
		await updateMainConfigMessageFromChannelSelect(inter)
	}
}

async function handleRoleSelect(inter: Discord.RoleSelectMenuInteraction) {
	await inter.deferUpdate()

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
		await updateMainConfigMessageFromRoleSelect(inter)
	} else if (inter.customId === 'ticket_role_limits_select') {
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
	}
}

async function handleModalSubmit(inter: Discord.ModalSubmitInteraction) {
	await inter.deferUpdate()

	const ticketConfig = await loadCfg(inter)

	if (inter.customId === 'ticket_auto_close_modal') {
		const enabled =
			inter.fields.getTextInputValue('enabled').toLowerCase() === 'true'
		const threshold =
			Number.parseInt(inter.fields.getTextInputValue('threshold')) * 3600 // Convert hours to seconds

		ticketConfig.auto_close = [
			{
				enabled,
				threshold,
				reason: 'Ticket closed due to inactivity',
			},
		]

		await saveCfg(inter, ticketConfig)

		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Auto-close settings updated:\nEnabled: ${enabled ? '✅' : '❌'}\nThreshold: ${threshold / 3600} hours`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		// Update the main config message
		await updateMainConfigMessageFromModal(inter)
	} else if (inter.customId.startsWith('ticket_role_limits_modal_')) {
		const roles = inter.customId.split('_').pop()?.split(',') ?? []
		const limit =
			Number.parseInt(inter.fields.getTextInputValue('limit')) * 3600 // Convert hours to seconds

		ticketConfig.role_time_limits = {
			included: roles.map((roleId) => ({
				role_id: roleId,
				limit: limit.toString(),
			})),
		}

		await saveCfg(inter, ticketConfig)

		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Time limits set to ${limit / 3600} hours for roles: ${roles.map((id) => `<@&${id}>`).join(', ')}`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		// Update the main config message
		await updateMainConfigMessageFromModal(inter)
	}
}

/* -------------------------------------------------------------------------- */
/*                            CONFIG HANDLERS                                   */
/* -------------------------------------------------------------------------- */

async function handleAdminChannelConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
) {
	const channelSelect = new Discord.ChannelSelectMenuBuilder()
		.setCustomId('ticket_admin_channel_select')
		.setPlaceholder('Select admin notification channel')
		.setChannelTypes(Discord.ChannelType.GuildText)

	const row =
		new Discord.ActionRowBuilder<Discord.ChannelSelectMenuBuilder>().addComponents(
			channelSelect
		)

	await inter.editReply({
		content: '# Select Admin Channel\nChoose a channel for admin notifications',
		components: [row],
	})
}

async function handleTranscriptChannelConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
) {
	const channelSelect = new Discord.ChannelSelectMenuBuilder()
		.setCustomId('ticket_transcript_channel_select')
		.setPlaceholder('Select transcript channel')
		.setChannelTypes(Discord.ChannelType.GuildText)

	const row =
		new Discord.ActionRowBuilder<Discord.ChannelSelectMenuBuilder>().addComponents(
			channelSelect
		)

	await inter.editReply({
		content:
			'# Select Transcript Channel\nChoose a channel for ticket transcripts',
		components: [row],
	})
}

async function handleModRolesConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
) {
	const roleSelect = new Discord.RoleSelectMenuBuilder()
		.setCustomId('ticket_mod_roles_select')
		.setPlaceholder('Select moderator roles')
		.setMinValues(1)
		.setMaxValues(10)

	const row =
		new Discord.ActionRowBuilder<Discord.RoleSelectMenuBuilder>().addComponents(
			roleSelect
		)

	await inter.editReply({
		content: '# Select Moderator Roles\nChoose roles that can manage tickets',
		components: [row],
	})
}

async function handleAutoCloseConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
) {
	const modal = new Discord.ModalBuilder()
		.setCustomId('ticket_auto_close_modal')
		.setTitle('Auto-close Settings')

	const enabledRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			new Discord.TextInputBuilder()
				.setCustomId('enabled')
				.setLabel('Enable auto-close (true/false)')
				.setStyle(Discord.TextInputStyle.Short)
				.setValue(String(config.auto_close?.[0]?.enabled ?? false))
				.setRequired(true)
		)

	const thresholdRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			new Discord.TextInputBuilder()
				.setCustomId('threshold')
				.setLabel('Threshold (hours)')
				.setStyle(Discord.TextInputStyle.Short)
				.setValue(String(config.auto_close?.[0]?.threshold ?? 24))
				.setRequired(true)
		)

	modal.addComponents(enabledRow, thresholdRow)

	await inter.showModal(modal)
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
					value: `${i}s`, // Include the 's' unit directly in the value
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
				options.push({
					label: `${i} minutes`,
					value: `${i}m`, // Include the 'm' unit directly in the value
				})
			}
			break
		}

		case 'hours': {
			// Add selected hour options within 25 option limit
			const hourValues = [1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72]
			for (const i of hourValues) {
				options.push({
					label: `${i} hours`,
					value: `${i}h`, // Include the 'h' unit directly in the value
				})
			}
			break
		}

		case 'days': {
			// Add selected day options within 25 option limit
			const dayValues = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30]
			for (const i of dayValues) {
				options.push({
					label: `${i} days`,
					value: `${i}d`,
				})
			}
			break
		}

		case 'weeks': {
			// Add options 1-4 weeks with proper formatted values
			for (let i = 1; i <= 4; i++) {
				options.push({
					label: `${i} weeks`,
					value: `${i}w`, // Include the 'w' unit directly in the value
				})
			}
			break
		}
	}

	return options
}

async function handleRoleTimeLimitsConfig(
	interaction: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['tickets']
): Promise<void> {
	try {
		// Handle role_time_limits as either array or object with included property
		const roleTimeLimits = Array.isArray(config.role_time_limits)
			? config.role_time_limits
			: config.role_time_limits?.included || []

		// Prepare list of limits for display
		let limitsContent = ''
		if (roleTimeLimits.length === 0) {
			limitsContent = '> No role time limits configured yet.'
		} else {
			limitsContent = `\n${roleTimeLimits
				.map((limit, index) => {
					const limitMs = ticketUtils.parseTimeValue(limit.limit)
					return `${index + 1}. <@&${limit.role_id}> (${formatTimeThreshold(limitMs)})`
				})
				.join('\n')}`
		}

		// Create action buttons including Back button
		const actionRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId(ID.ROLE_LIMIT_ADD)
					.setLabel('Add Limit')
					.setStyle(Discord.ButtonStyle.Primary),
				new Discord.ButtonBuilder()
					.setCustomId(ID.ROLE_LIMIT_REMOVE)
					.setLabel('Remove Limit')
					.setStyle(Discord.ButtonStyle.Danger)
					.setDisabled(roleTimeLimits.length === 0),
				new Discord.ButtonBuilder()
					.setCustomId(ID.CONFIG_BACK)
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Create custom content
		const content = [
			'# Role Time Limits Configuration',
			'',
			'Role time limits allow you to control how frequently users with specific roles can create new tickets.',
			'For example, you can set that users with @Member role can only create a new ticket every 24 hours.',
			'',
			'## Current Limits',
			limitsContent,
			'',
			'Use the buttons below to manage role time limits:',
		].join('\n')

		// Send the configuration message
		try {
			await interaction.editReply({
				content,
				components: [actionRow],
			})

			// Store the original interaction for later updates
			const cacheKey = `${interaction.guild.id}_role_time_limits`
			original_config_interactions.set(cacheKey, interaction)
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
	await inter.deferUpdate()
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
		await utils.handleResponse(
			inter,
			'error',
			'Invalid time unit selected. Please try again.'
		)
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

	await inter.editReply({
		content: CONTENT_BUILDERS.createConfigHeader(
			'Add Role Time Limit',
			`Select the time value in ${selectedUnit}:`
		),
		components: [roleSelectRow, timeValueRow],
	})
}

export async function handleTimeValueSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	await inter.deferUpdate()
	const config = await loadCfg(inter)
	const selectedValue = inter.values[0]

	// Convert the selected value to milliseconds using ticketUtils
	const milliseconds = ticketUtils.parseTimeValue(selectedValue)
	if (milliseconds === 0) {
		await utils.handleResponse(
			inter,
			'error',
			'Invalid time value format. Please try again.'
		)
		return
	}

	// Get selected roles from the custom_id
	const selectedRoles = inter.customId.split(':').pop()?.split(',') || []

	// Update the config with new time limits
	config.role_time_limits = {
		included: selectedRoles.map((roleId) => ({
			role_id: roleId,
			limit: selectedValue, // Store the original format (e.g., "24h", "3d")
		})),
	}

	await saveCfg(inter, config)

	// Show success message
	const formattedTime = formatTimeThreshold(milliseconds)
	const rolesText = selectedRoles.map((id) => `<@&${id}>`).join(', ')
	await utils.handleResponse(
		inter,
		'success',
		`Set time limit of ${formattedTime} for roles: ${rolesText}`
	)

	// Return to main config view after a short delay
	setTimeout(async () => {
		await handleRoleTimeLimitsConfig(inter, config)
	}, 2000)
}

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                     */
/* -------------------------------------------------------------------------- */

export async function handleRoleTimeLimitAdd(inter: Discord.ButtonInteraction) {
	await inter.deferUpdate()

	// Create role select menu for adding new time limit
	const roleSelectRow = UI_BUILDERS.createRoleSelectRow(
		ID.ROLE_LIMIT_SELECT,
		'Select roles to add time limit',
		1,
		10
	)

	// Create time unit select menu
	const timeUnitRow = UI_BUILDERS.createTimeUnitMenuRow(
		ID.ROLE_LIMIT_TIME_UNIT,
		'Select time unit'
	)

	await inter.editReply({
		content: CONTENT_BUILDERS.createConfigHeader(
			'Add Role Time Limit',
			'Select roles and time unit:'
		),
		components: [roleSelectRow, timeUnitRow],
	})
}

export async function handleRoleTimeLimitRemove(
	inter: Discord.ButtonInteraction
) {
	await inter.deferUpdate()
	const config = await loadCfg(inter)

	// Handle role_time_limits as either array or object with included property
	const roleTimeLimits = Array.isArray(config.role_time_limits)
		? config.role_time_limits
		: config.role_time_limits?.included || []

	if (roleTimeLimits.length === 0) {
		await utils.handleResponse(
			inter,
			'error',
			'No role time limits configured yet.'
		)
		return
	}

	// Create select menu with current role time limits
	const removeSelect = new Discord.StringSelectMenuBuilder()
		.setCustomId(ID.ROLE_LIMIT_REMOVE_SELECT)
		.setPlaceholder('Select roles to remove time limit')
		.setMinValues(1)
		.setMaxValues(roleTimeLimits.length)
		.addOptions(
			roleTimeLimits.map((limit, index) => ({
				label: `Role ${index + 1}`,
				value: limit.role_id,
				description: `Current limit: ${formatTimeThreshold(Number(limit.limit))}`,
			}))
		)

	const removeRow =
		new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
			removeSelect
		)

	await inter.editReply({
		content: '# Remove Role Time Limit\nSelect roles to remove:',
		components: [removeRow],
	})
}

export async function handleRoleTimeLimitRemoveSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	await inter.deferUpdate()
	const config = await loadCfg(inter)

	// Get selected role IDs to remove
	const selectedRoles = inter.values

	// Handle role_time_limits as either array or object with included property
	const currentLimits = Array.isArray(config.role_time_limits)
		? config.role_time_limits
		: config.role_time_limits?.included || []

	// Remove selected roles from config
	config.role_time_limits = {
		included: currentLimits.filter(
			(limit) => !selectedRoles.includes(limit.role_id)
		),
	}

	await saveCfg(inter, config)

	// Show success message
	const rolesText = selectedRoles.map((id) => `<@&${id}>`).join(', ')
	await utils.handleResponse(
		inter,
		'success',
		`Removed time limits for roles: ${rolesText}`
	)

	// Return to role time limits config after a short delay
	setTimeout(async () => {
		await handleRoleTimeLimitsConfig(inter, config)
	}, 2000)
}

async function handleButtonClick(inter: Discord.ButtonInteraction) {
	await inter.deferUpdate()
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

		case ID.ROLE_LIMIT_REMOVE:
			await handleRoleTimeLimitRemove(inter)
			break

		case ID.CONFIG_BACK:
			await updateMainConfigMessage(inter)
			break

		default:
			StatusLogger.warn(`Unhandled button ID: ${inter.customId}`)
			break
	}
}

// Helper function to update the main config message without deferring
async function updateMainConfigMessage(inter: Discord.ButtonInteraction) {
	// Load current config
	const ticketConfig = await loadCfg(inter)

	// Calculate status values
	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(ticketConfig.auto_close[0].threshold)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleTimeLimitsArray = Array.isArray(ticketConfig.role_time_limits)
		? ticketConfig.role_time_limits
		: ticketConfig.role_time_limits?.included || []

	const roleLimits = roleTimeLimitsArray.length
		? `✅ ${roleTimeLimitsArray.length} roles configured`
		: '❌ No limits set'

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
			channelSection,
			roleSection,
			limitSection,
			spacer,
			menuRow,
			statusRow,
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

// Helper function to update the main config message from channel select interactions
async function updateMainConfigMessageFromChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	// Load current config
	const ticketConfig = await loadCfg(inter)

	// Calculate status values
	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(ticketConfig.auto_close[0].threshold)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleTimeLimitsArray = Array.isArray(ticketConfig.role_time_limits)
		? ticketConfig.role_time_limits
		: ticketConfig.role_time_limits?.included || []

	const roleLimits = roleTimeLimitsArray.length
		? `✅ ${roleTimeLimitsArray.length} roles configured`
		: '❌ No limits set'

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
			channelSection,
			roleSection,
			limitSection,
			spacer,
			menuRow,
			statusRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

// Helper function to update the main config message from role select interactions
async function updateMainConfigMessageFromRoleSelect(
	inter: Discord.RoleSelectMenuInteraction
) {
	// Load current config
	const ticketConfig = await loadCfg(inter)

	// Calculate status values
	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(ticketConfig.auto_close[0].threshold)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleTimeLimitsArray = Array.isArray(ticketConfig.role_time_limits)
		? ticketConfig.role_time_limits
		: ticketConfig.role_time_limits?.included || []

	const roleLimits = roleTimeLimitsArray.length
		? `✅ ${roleTimeLimitsArray.length} roles configured`
		: '❌ No limits set'

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
			channelSection,
			roleSection,
			limitSection,
			spacer,
			menuRow,
			statusRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

// Helper function to update the main config message from modal interactions
async function updateMainConfigMessageFromModal(
	inter: Discord.ModalSubmitInteraction
) {
	// Load current config
	const ticketConfig = await loadCfg(inter)

	// Calculate status values
	const autoClose = ticketConfig.auto_close?.[0]?.enabled
		? `✅ ${formatTimeThreshold(ticketConfig.auto_close[0].threshold)}`
		: '❌ Disabled'

	// Handle role_time_limits as either array or object with included property
	const roleTimeLimitsArray = Array.isArray(ticketConfig.role_time_limits)
		? ticketConfig.role_time_limits
		: ticketConfig.role_time_limits?.included || []

	const roleLimits = roleTimeLimitsArray.length
		? `✅ ${roleTimeLimitsArray.length} roles configured`
		: '❌ No limits set'

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
			channelSection,
			roleSection,
			limitSection,
			spacer,
			menuRow,
			statusRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}
