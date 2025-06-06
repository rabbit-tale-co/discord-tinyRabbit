import * as Discord from 'discord.js'
import { ticketUtils, formatTimeThreshold } from '@/utils/tickets.js'
import * as api from '@/discord/api/index.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'
import * as V2 from 'discord-components-v2'
import { ID } from '@/commands/constants.js'

// Add missing ID constants
const ROLE_LIMIT_ROLE_SELECT = 'role_limit_role_select'
const EXCLUDED_ROLES_ADD = 'excluded_roles_add'
const EXCLUDED_ROLES_REMOVE = 'excluded_roles_remove'
const EXCLUDED_ROLES_REMOVE_SELECT = 'excluded_roles_remove_select'
const EXCLUDED_ROLES_ROLE_SELECT = 'excluded_roles_role_select'

/* -------------------------------------------------------------------------- */
/*                           BUSINESS‑LOGIC  (CHECK)                          */
/* -------------------------------------------------------------------------- */

export async function canUserOpenTicket(
	member: Discord.GuildMember,
	cfg: PluginResponse<DefaultConfigs['tickets']>,
	lastOpenUnix: number | null
): Promise<{
	allowed: boolean
	retryAt?: number
	limit?: Discord.Snowflake
}> {
	if (!cfg.role_time_limits) return { allowed: true }

	// Check if user has any excluded roles - these bypass all limits
	if (cfg.role_time_limits.excluded?.length) {
		const hasExcludedRole = cfg.role_time_limits.excluded.some((roleId) =>
			member.roles.cache.has(roleId)
		)
		if (hasExcludedRole) {
			return { allowed: true }
		}
	}

	// Check time limits from included roles
	if (!cfg.role_time_limits.included?.length) return { allowed: true }

	const strictest = findStrictestLimit(member, cfg)
	if (!strictest) return { allowed: true }

	const retryAt = lastOpenUnix * 1_000 + strictest.ms
	const allowed = Date.now() >= retryAt
	return {
		allowed,
		retryAt,
		limit: strictest.raw,
	}
}

function findStrictestLimit(
	member: Discord.GuildMember,
	cfg: PluginResponse<DefaultConfigs['tickets']>
) {
	let best: {
		raw: string
		ms: number
	} | null = null

	for (const rl of cfg.role_time_limits?.included ?? []) {
		if (!member.roles.cache.has(rl.role_id)) continue

		// Handle migration from old format to new format
		let thresholdInSeconds: number
		if ('threshold' in rl && typeof rl.threshold === 'number') {
			// New format: threshold in seconds
			thresholdInSeconds = rl.threshold
		} else if (
			'limit' in rl &&
			typeof (rl as { role_id: string; limit: string }).limit === 'string'
		) {
			// Old format: convert limit string to seconds
			const legacyLimit = (rl as { role_id: string; limit: string }).limit
			const ms = ticketUtils.parseTimeValue(legacyLimit)
			thresholdInSeconds = Math.floor(ms / 1000)
		} else {
			continue // Skip invalid entries
		}

		if (thresholdInSeconds === 0) continue // Skip invalid time values

		const ms = thresholdInSeconds * 1000 // Convert to milliseconds for time calculations

		if (!best || ms < best.ms) best = { raw: thresholdInSeconds.toString(), ms }
	}

	return best
}

/* -------------------------------------------------------------------------- */
/*                           CONFIG‑UI ENTRY POINTS                           */
/* -------------------------------------------------------------------------- */

export async function openConfig(interaction: Discord.ButtonInteraction) {
	const cfg = await loadCfg(interaction)
	await showLimitsPanel(interaction, cfg)
}

export async function handleComponent(
	interaction:
		| Discord.ButtonInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
) {
	switch (interaction.customId) {
		case ID.ROLE_LIMIT_ADD:
			return handleAddLimit(interaction as Discord.ButtonInteraction)
		case ID.ROLE_LIMIT_REMOVE:
			return handleRemovePicker(interaction as Discord.ButtonInteraction)
		case ID.ROLE_LIMIT_REMOVE_SELECT:
			return handleRemoveLimit(
				interaction as Discord.StringSelectMenuInteraction
			)
		case EXCLUDED_ROLES_ADD:
			return handleAddExcludedRole(interaction as Discord.ButtonInteraction)
		case EXCLUDED_ROLES_REMOVE:
			return handleRemoveExcludedRolePicker(
				interaction as Discord.ButtonInteraction
			)
		case EXCLUDED_ROLES_REMOVE_SELECT:
			return handleRemoveExcludedRole(
				interaction as Discord.StringSelectMenuInteraction
			)
		case EXCLUDED_ROLES_ROLE_SELECT:
			return handleExcludedRoleSelect(
				interaction as Discord.RoleSelectMenuInteraction
			)
	}

	if (
		interaction.isRoleSelectMenu() &&
		interaction.customId === ID.ROLE_LIMIT_ADD
	) {
		//
	}
}

/* -------------------------------------------------------------------------- */
/*                               LIMIT PANEL                                  */
/* -------------------------------------------------------------------------- */

async function showLimitsPanel(
	i:
		| Discord.ButtonInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction,
	cfg: PluginResponse<DefaultConfigs['tickets']>
) {
	// Get included and excluded roles from new structure
	const includedLimits = cfg.role_time_limits?.included ?? []
	const excludedRoles = cfg.role_time_limits?.excluded ?? []

	const limitsLines = await Promise.all(
		includedLimits.map(async (l, idx) => {
			// Handle migration from old format to new format
			let thresholdInSeconds: number
			if ('threshold' in l && typeof l.threshold === 'number') {
				// New format: threshold in seconds
				thresholdInSeconds = l.threshold
			} else if (
				'limit' in l &&
				typeof (l as { role_id: string; limit: string }).limit === 'string'
			) {
				// Old format: convert limit string to seconds
				const legacyLimit = (l as { role_id: string; limit: string }).limit
				const ms = ticketUtils.parseTimeValue(legacyLimit)
				thresholdInSeconds = Math.floor(ms / 1000)
			} else {
				thresholdInSeconds = 0 // Fallback for invalid data
			}

			const displayTime = formatTimeThreshold(thresholdInSeconds * 1000)

			// Fetch role name instead of using numbered list
			const role = await i.guild?.roles.fetch(l.role_id).catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${l.role_id})`

			return `**${roleName}** - ${displayTime}`
		})
	)

	const excludedLines = await Promise.all(
		excludedRoles.map(async (roleId, idx) => {
			// Fetch role name instead of using numbered list
			const role = await i.guild?.roles.fetch(roleId).catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${roleId})`
			return `**${roleName}**`
		})
	)

	const content = [
		'# Role Time-Limits Configuration',
		'',
		'## ⏰ Time Limits',
		limitsLines.length ? limitsLines.join('\n') : 'No limits set',
		'',
		'## 🚫 Excluded Roles (Bypass All Limits)',
		excludedLines.length ? excludedLines.join('\n') : 'No excluded roles set',
	].join('\n')

	const row1 = V2.makeActionRow([
		V2.makeButton({
			custom_id: ID.ROLE_LIMIT_ADD,
			label: 'Add Time Limit',
			style: Discord.ButtonStyle.Primary,
		}),
		V2.makeButton({
			custom_id: ID.ROLE_LIMIT_REMOVE,
			label: 'Remove Time Limit',
			style: Discord.ButtonStyle.Danger,
			disabled: !includedLimits.length,
		}),
	])

	const row2 = V2.makeActionRow([
		V2.makeButton({
			custom_id: EXCLUDED_ROLES_ADD,
			label: 'Add Excluded Role',
			style: Discord.ButtonStyle.Secondary,
		}),
		V2.makeButton({
			custom_id: EXCLUDED_ROLES_REMOVE,
			label: 'Remove Excluded Role',
			style: Discord.ButtonStyle.Danger,
			disabled: !excludedRoles.length,
		}),
	])

	const row3 = V2.makeActionRow([
		V2.makeButton({
			custom_id: ID.CONFIG_BACK,
			label: 'Back To Menu',
			style: Discord.ButtonStyle.Secondary,
		}),
	])

	const reply = i.replied || i.deferred ? i.editReply : i.reply
	await reply.call(i, {
		content,
		components: [row1, row2, row3],
		flags: Discord.MessageFlags.Ephemeral,
	})
}

/* -------------------------------------------------------------------------- */
/*                               ADD LIMIT FLOW                               */
/* -------------------------------------------------------------------------- */

async function handleAddLimit(i: Discord.ButtonInteraction) {
	await i.deferUpdate()

	const roleSelect = V2.makeRoleSelect({
		custom_id: ROLE_LIMIT_ROLE_SELECT,
		placeholder: 'Select a role',
		min_values: 1,
		max_values: 1,
	})

	const roleSelectRow = V2.makeActionRow([roleSelect])
	const buttonRow = V2.makeActionRow([
		V2.makeButton({
			custom_id: ID.CONFIG_BACK,
			label: 'Back To Limits Menu',
			style: Discord.ButtonStyle.Secondary,
		}),
	])

	await i.editReply({
		content: '## Pick a role to add a time-limit to',
		components: [roleSelectRow, buttonRow],
	})
}

/* -------------------------------------------------------------------------- */
/*                              REMOVE LIMIT FLOW                             */
/* -------------------------------------------------------------------------- */

async function handleRemovePicker(i: Discord.ButtonInteraction) {
	await i.deferUpdate()
	const cfg = await loadCfg(i)

	// Get only regular limits from included array
	const includedLimits = cfg.role_time_limits?.included ?? []

	if (!includedLimits.length) {
		return showLimitsPanel(i, cfg)
	}

	const options = await Promise.all(
		includedLimits.map(async (l, idx) => {
			const role = (await i.guild.roles
				.fetch(l.role_id)
				.catch(() => null)) as Discord.Role | null

			// Handle migration from old format to new format
			let thresholdInSeconds: number
			if ('threshold' in l && typeof l.threshold === 'number') {
				// New format: threshold in seconds
				thresholdInSeconds = l.threshold
			} else if (
				'limit' in l &&
				typeof (l as { role_id: string; limit: string }).limit === 'string'
			) {
				// Old format: convert limit string to seconds
				const legacyLimit = (l as { role_id: string; limit: string }).limit
				const ms = ticketUtils.parseTimeValue(legacyLimit)
				thresholdInSeconds = Math.floor(ms / 1000)
			} else {
				thresholdInSeconds = 0 // Fallback for invalid data
			}

			const displayTime = formatTimeThreshold(thresholdInSeconds * 1000)

			return {
				label: role ? `@${role.name}` : `ID:${l.role_id}`,
				value: idx.toString(),
				description: `Limit: ${displayTime}`,
			}
		})
	)

	const removeSelect = V2.makeStringSelect(ID.ROLE_LIMIT_REMOVE_SELECT)
		.setPlaceholder('Select a role to remove')
		.addOptions(options)

	const selectRow = V2.makeActionRow([removeSelect])
	const buttonRow = V2.makeActionRow([
		V2.makeButton({
			custom_id: ID.CONFIG_BACK,
			label: 'Back To Limits Menu',
			style: Discord.ButtonStyle.Secondary,
		}),
	])

	await i.editReply({
		content: '## Pick a role to remove',
		components: [selectRow, buttonRow],
	})
}

async function handleRemoveLimit(inter: Discord.StringSelectMenuInteraction) {
	await inter.deferUpdate()

	const cfg = await loadCfg(inter)
	const idx = Number(inter.values[0])

	// Initialize structure if needed
	if (!cfg.role_time_limits) {
		cfg.role_time_limits = { included: [], excluded: [] }
	}
	if (!cfg.role_time_limits.included) {
		cfg.role_time_limits.included = []
	}

	// Get the limit to remove from included array
	const limitToRemove = cfg.role_time_limits.included[idx]

	if (!limitToRemove) {
		await inter.followUp({
			content: '❌ Failed to find the limit to remove',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	// Remove from the included array
	cfg.role_time_limits.included.splice(idx, 1)

	await saveCfg(inter, cfg)
	await showLimitsPanel(inter, cfg)
	await inter.followUp({
		content: 'Limit Removed',
		flags: Discord.MessageFlags.Ephemeral,
	})
}

/* -------------------------------------------------------------------------- */
/*                           EXCLUDED ROLES FLOW                              */
/* -------------------------------------------------------------------------- */

async function handleAddExcludedRole(i: Discord.ButtonInteraction) {
	await i.deferUpdate()

	const roleSelect = V2.makeRoleSelect({
		custom_id: EXCLUDED_ROLES_ROLE_SELECT,
		placeholder: 'Select a role to exclude from limits',
		min_values: 1,
		max_values: 1,
	})

	const roleSelectRow = V2.makeActionRow([roleSelect])
	const buttonRow = V2.makeActionRow([
		V2.makeButton({
			custom_id: ID.CONFIG_BACK,
			label: 'Back To Limits Menu',
			style: Discord.ButtonStyle.Secondary,
		}),
	])

	await i.editReply({
		content: '## Pick a role to exclude from time limits',
		components: [roleSelectRow, buttonRow],
	})
}

async function handleExcludedRoleSelect(i: Discord.RoleSelectMenuInteraction) {
	await i.deferUpdate()
	const cfg = await loadCfg(i)

	const selectedRoleId = i.values[0]

	// Initialize role_time_limits structure if it doesn't exist
	if (!cfg.role_time_limits) {
		cfg.role_time_limits = { included: [], excluded: [] }
	}
	if (!cfg.role_time_limits.included) {
		cfg.role_time_limits.included = []
	}
	if (!cfg.role_time_limits.excluded) {
		cfg.role_time_limits.excluded = []
	}

	// Check if role already has any limit (excluded or regular)
	const existingInIncluded = cfg.role_time_limits.included.find(
		(rl) => rl.role_id === selectedRoleId
	)
	const existingInExcluded =
		cfg.role_time_limits.excluded.includes(selectedRoleId)

	if (existingInIncluded || existingInExcluded) {
		await i.followUp({
			content: '❌ This role already has a configuration',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	// Add the role to excluded list
	cfg.role_time_limits.excluded.push(selectedRoleId)

	await saveCfg(i, cfg)
	await showLimitsPanel(i, cfg)

	await i.followUp({
		content: '✅ Role added to excluded list',
		flags: Discord.MessageFlags.Ephemeral,
	})
}

async function handleRemoveExcludedRolePicker(i: Discord.ButtonInteraction) {
	await i.deferUpdate()
	const cfg = await loadCfg(i)

	// Get excluded roles
	const excludedRoles = cfg.role_time_limits?.excluded ?? []

	if (!excludedRoles.length) {
		return showLimitsPanel(i, cfg)
	}

	const options = await Promise.all(
		excludedRoles.map(async (roleId, idx) => {
			const role = (await i.guild.roles
				.fetch(roleId)
				.catch(() => null)) as Discord.Role | null
			return {
				label: role ? `@${role.name}` : `ID:${roleId}`,
				value: roleId, // Use role_id as value for easier removal
				description: 'Remove from excluded roles',
			}
		})
	)

	const removeSelect = V2.makeStringSelect(EXCLUDED_ROLES_REMOVE_SELECT)
		.setPlaceholder('Select a role to remove from excluded list')
		.addOptions(options)

	const selectRow = V2.makeActionRow([removeSelect])
	const buttonRow = V2.makeActionRow([
		V2.makeButton({
			custom_id: ID.CONFIG_BACK,
			label: 'Back To Limits Menu',
			style: Discord.ButtonStyle.Secondary,
		}),
	])

	await i.editReply({
		content: '## Pick a role to remove from excluded list',
		components: [selectRow, buttonRow],
	})
}

async function handleRemoveExcludedRole(
	inter: Discord.StringSelectMenuInteraction
) {
	await inter.deferUpdate()

	const cfg = await loadCfg(inter)
	const roleIdToRemove = inter.values[0]

	// Initialize structure if needed
	if (!cfg.role_time_limits) {
		cfg.role_time_limits = { included: [], excluded: [] }
	}
	if (!cfg.role_time_limits.excluded) {
		cfg.role_time_limits.excluded = []
	}

	// Remove the role from excluded array
	const initialLength = cfg.role_time_limits.excluded.length
	cfg.role_time_limits.excluded = cfg.role_time_limits.excluded.filter(
		(roleId) => roleId !== roleIdToRemove
	)

	if (cfg.role_time_limits.excluded.length < initialLength) {
		await saveCfg(inter, cfg)
		await showLimitsPanel(inter, cfg)

		await inter.followUp({
			content: '✅ Role removed from excluded list',
			flags: Discord.MessageFlags.Ephemeral,
		})
	} else {
		await inter.followUp({
			content: '❌ Failed to remove role from excluded list',
			flags: Discord.MessageFlags.Ephemeral,
		})
	}
}

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

const cfgCache = new Map<
	Discord.Guild['id'],
	PluginResponse<DefaultConfigs['tickets']>
>()

export async function loadCfg(i: Discord.Interaction) {
	if (!i.inGuild()) {
		throw new Error('This interaction must be used in a guild')
	}
	return api.getPluginConfig(i.client.user.id, i.guildId, 'tickets')
}

export async function saveCfg(
	i: Discord.Interaction,
	cfg: PluginResponse<DefaultConfigs['tickets']>
) {
	if (!i.inGuild()) {
		throw new Error('This interaction must be used in a guild')
	}
	await api.updatePluginConfig(i.client.user.id, i.guildId, 'tickets', cfg)
}
