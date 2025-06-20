import type * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { config as centralizedConfig } from '@/discord/commands/config/index.js'
import * as api from '@/discord/api/index.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'

type ModalHandler = (inter: Discord.ModalSubmitInteraction) => Promise<void>

interface ModalStructure {
	handler: ModalHandler
}

// Modal map structure for different modal types (non-config modals only)
const modalMap: Record<string, ModalStructure> = {
	// Reserved for future non-config modals
	// ticket_auto_close_modal: { handler: ... }, - now handled by centralized config
}

export async function modalInteractionHandler(
	inter: Discord.ModalSubmitInteraction
): Promise<void> {
	// Check for close ticket modal (with thread ID suffix) - non-config modal
	if (inter.customId.startsWith('close_ticket_modal:')) {
		await commands.ticket.modalClose(inter)
		return
	}

	// For all configuration-related modals, delegate to centralized config
	if (
		inter.customId.startsWith('ticket_') ||
		inter.customId.startsWith('tickets:') ||
		inter.customId.startsWith('starboard_') ||
		inter.customId.startsWith('starboard:') ||
		inter.customId.startsWith('welcome_goodbye_') ||
		inter.customId.includes('_modal') ||
		inter.customId.includes('config')
	) {
		await centralizedConfig(inter)
		return
	}

	const modalConfig = modalMap[inter.customId]
	if (!modalConfig) return

	await modalConfig.handler(inter)
}

/* -------------------------------------------------------------------------- */
/*                            MODAL HANDLERS                                    */
/* -------------------------------------------------------------------------- */

async function handleAutoCloseModal(inter: Discord.ModalSubmitInteraction) {
	await inter.deferUpdate()

	const enabled =
		inter.fields.getTextInputValue('enabled').toLowerCase() === 'true'
	const threshold =
		Number.parseInt(inter.fields.getTextInputValue('threshold')) * 3600 // Convert hours to seconds

	const ticketConfig = (await api.getPluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets'
	)) as PluginResponse<DefaultConfigs['tickets']>

	ticketConfig.auto_close = [
		{
			enabled,
			threshold,
			reason: 'Ticket closed due to inactivity',
		},
	]

	await api.updatePluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets',
		ticketConfig
	)

	await utils.handleResponse(
		inter,
		'success',
		`Auto-close settings updated:\nEnabled: ${enabled ? '✅' : '❌'}\nThreshold: ${threshold / 3600} hours`
	)
}

async function handleRoleLimitsModal(inter: Discord.ModalSubmitInteraction) {
	await inter.deferUpdate()

	const roles = inter.customId.split('_').pop()?.split(',') ?? []
	const limit = Number.parseInt(inter.fields.getTextInputValue('limit')) * 3600 // Convert hours to seconds

	const ticketConfig = (await api.getPluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets'
	)) as PluginResponse<DefaultConfigs['tickets']>

	ticketConfig.role_time_limits = {
		included: roles.map((roleId) => ({
			role_id: roleId,
			limit: limit.toString(),
		})),
	}

	await api.updatePluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets',
		ticketConfig
	)

	await utils.handleResponse(
		inter,
		'success',
		`Time limits set to ${limit / 3600} hours for roles: ${roles.map((id) => `<@&${id}>`).join(', ')}`
	)
}
