import * as Discord from 'discord.js'
import { ticketUtils } from '@/utils/tickets.js'
import * as api from '@/api/index.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'
import * as V2 from 'discord-components-v2'
import { ID } from '../../constants.js'

// Add missing ID constant
const ROLE_LIMIT_ROLE_SELECT = 'role_limit_role_select'

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
	if (!cfg.role_time_limits?.length) return { allowed: true }

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
		raw: Discord.Snowflake
		ms: number
	} | null = null

	for (const rl of cfg.role_time_limits ?? []) {
		if (!member.roles.cache.has(rl.role_id)) continue

		const ms = ticketUtils.parseTimeValue(rl.limit)
		if (!best || ms < best.ms) best = { raw: rl.limit, ms }
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
	i: Discord.ButtonInteraction | Discord.StringSelectMenuInteraction,
	cfg: PluginResponse<DefaultConfigs['tickets']>
) {
	const lines =
		cfg.role_time_limits?.map(
			(l, idx) => `**${idx + 1}.** <@&${l.role_id}> - ${l.limit}`
		) ?? []

	const content = [
		'# Role Time-Limits',
		'',
		lines.length ? lines.join('\n') : 'No limits set',
	].join('\n')

	const row = V2.makeActionRow([
		V2.makeButton({
			custom_id: ID.ROLE_LIMIT_ADD,
			label: 'Add',
			style: Discord.ButtonStyle.Primary,
		}),
		V2.makeButton({
			custom_id: ID.ROLE_LIMIT_REMOVE,
			label: 'Remove',
			style: Discord.ButtonStyle.Danger,
			disabled: !lines.length,
		}),
		V2.makeButton({
			custom_id: ID.CONFIG_BACK,
			label: 'Back To Menu',
			style: Discord.ButtonStyle.Secondary,
			disabled: !lines.length,
		}),
	])

	const reply = i.replied || i.deferred ? i.editReply : i.reply
	await reply.call(i, {
		content,
		components: [row],
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
	if (!cfg.role_time_limits?.length) return showLimitsPanel(i, cfg)

	const options = await Promise.all(
		cfg.role_time_limits.map(async (l, idx) => {
			const role = (await i.guild.roles
				.fetch(l.role_id)
				.catch(() => null)) as Discord.Role | null
			return {
				label: role ? `@${role.name}` : `ID:${l.role_id}`,
				value: idx.toString(),
				description: `Limit: ${l.limit}`,
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

	cfg.role_time_limits?.splice(idx, 1)
	await saveCfg(inter, cfg)
	await showLimitsPanel(inter, cfg)
	await inter.followUp({
		content: 'Limit Removed',
		flags: Discord.MessageFlags.Ephemeral,
	})
}

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

const cfgCache = new Map<
	Discord.Guild['id'],
	PluginResponse<DefaultConfigs['tickets']>
>()

export async function loadCfg(
	i:
		| Discord.ButtonInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ChatInputCommandInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ModalSubmitInteraction
) {
	return (await api.getPluginConfig(
		i.client.user.id,
		i.guild?.id as Discord.Guild['id'],
		'tickets'
	)) as PluginResponse<DefaultConfigs['tickets']>
}

export async function saveCfg(
	i:
		| Discord.ButtonInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ChatInputCommandInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ModalSubmitInteraction,
	cfg: PluginResponse<DefaultConfigs['tickets']>
) {
	await api.updatePluginConfig(
		i.client.user.id,
		i.guild?.id as Discord.Guild['id'],
		'tickets',
		cfg
	)
}
