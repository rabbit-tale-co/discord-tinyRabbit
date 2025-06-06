import * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { config as centralizedConfig } from '@/discord/commands/config/index.js'
import * as api from '@/discord/api/index.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'

type RoleSelectHandler = (
	inter: Discord.RoleSelectMenuInteraction
) => Promise<void>

interface RoleSelectStructure {
	handler: RoleSelectHandler
}

// Role select menu map structure for different menu types (non-config interactions only)
const roleSelectMap: Record<string, RoleSelectStructure> = {
	// Reserved for future non-config role selects
	// ticket: { handler: ... }, - now handled by centralized config
}

export async function roleSelectInteractionHandler(
	inter: Discord.RoleSelectMenuInteraction
): Promise<void> {
	// For all configuration-related role selects, delegate to centralized config
	if (
		inter.customId.startsWith('ticket_') ||
		inter.customId.startsWith('tickets:') ||
		inter.customId.startsWith('starboard_') ||
		inter.customId.startsWith('starboard:') ||
		inter.customId.startsWith('levels_') ||
		inter.customId.startsWith('welcome_goodbye_') ||
		inter.customId.includes('_roles_select') ||
		inter.customId.includes('_role_limits_select') ||
		inter.customId.includes('config')
	) {
		await centralizedConfig(inter)
		return
	}

	// Extract the base identifier from the customId for non-config interactions
	const baseId = inter.customId.split('_')[0]

	const roleSelectConfig = roleSelectMap[baseId]
	if (!roleSelectConfig) {
		// If no specific handler found, log and ignore
		console.log(
			`[Role Select] No handler found for customId: ${inter.customId}`
		)
		return
	}

	await roleSelectConfig.handler(inter)
}

/* -------------------------------------------------------------------------- */
/*                            ROLE HANDLERS                                     */
/* -------------------------------------------------------------------------- */

async function handleModRolesSelect(inter: Discord.RoleSelectMenuInteraction) {
	await inter.deferUpdate()

	const roles = inter.values
	const ticketConfig = (await api.getPluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets'
	)) as PluginResponse<DefaultConfigs['tickets']>

	ticketConfig.mods_role_ids = roles

	await api.updatePluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets',
		ticketConfig
	)

	await utils.handleResponse(
		inter,
		'success',
		`Moderator roles set to ${roles.map((id) => `<@&${id}>`).join(', ')}`
	)
}

async function handleRoleLimitsSelect(
	inter: Discord.RoleSelectMenuInteraction
) {
	await inter.deferUpdate()

	const roles = inter.values
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
