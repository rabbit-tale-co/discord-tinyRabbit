import * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import * as api from '@/discord/api/index.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'

type RoleSelectHandler = (
	inter: Discord.RoleSelectMenuInteraction
) => Promise<void>

interface RoleSelectStructure {
	handler: RoleSelectHandler
}

// Role select menu map structure for different menu types
const roleSelectMap: Record<string, RoleSelectStructure> = {
	ticket: {
		handler: async (inter: Discord.RoleSelectMenuInteraction) => {
			if (
				inter.custom_id === 'ticket_mod_roles_select' ||
				inter.custom_id === 'ticket_role_limits_select'
			) {
				await commands.ticket.config(inter)
				return
			}
		},
	},
}

export async function roleSelectInteractionHandler(
	inter: Discord.RoleSelectMenuInteraction
): Promise<void> {
	// Extract the base identifier from the custom_id
	const baseId = inter.custom_id.split('_')[0]

	const roleSelectConfig = roleSelectMap[baseId]
	if (!roleSelectConfig) return

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
		.setcustom_id(`ticket_role_limits_modal_${roles.join(',')}`)
		.setTitle('Role Time Limits')

	const limitRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			new Discord.TextInputBuilder()
				.setcustom_id('limit')
				.setLabel('Time limit between tickets (hours)')
				.setStyle(Discord.TextInputStyle.Short)
				.setValue('24')
				.setRequired(true)
		)

	modal.addComponents(limitRow)

	await inter.showModal(modal)
}
