import type * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { PLUGINS, TICKET_ACTIONS } from '@/discord/commands/constants.js'
import {
	openTicketFromSelect,
	handleTicketActionSelect,
} from '@/discord/commands/moderation/tickets/open.js'
import { bunnyLog } from 'bunny-log'

type SelectMenuHandler = (
	inter: Discord.StringSelectMenuInteraction
) => Promise<void>

interface SelectMenuStructure {
	handler: SelectMenuHandler
}

// Select menu map structure for different menu types
const selectMenuMap: Record<string, SelectMenuStructure> = {
	[PLUGINS.TICKETS]: {
		handler: async (inter: Discord.StringSelectMenuInteraction) => {
			const [plugin, action] = inter.customId.split(':')

			switch (action) {
				case 'config_select':
					await commands.ticket.config(inter)
					break
				case 'select':
					// Handle ticket selection actions
					if (inter.customId === TICKET_ACTIONS.CONFIG.SELECT) {
						await commands.ticket.config(inter)
					} else if (inter.customId === TICKET_ACTIONS.ROLE_LIMITS.SELECT) {
						await commands.ticket.config(inter)
					} else {
						// Handle regular ticket action selection
						await handleTicketActionSelect(inter)
					}
					break
				case 'role_limit_time_unit':
					await commands.ticket.config(inter)
					break
				case 'role_limit_time_value':
					await commands.ticket.config(inter)
					break
				case 'open': {
					// Handle ticket opening with the selected value
					const customId = inter.values[0] // Get the selected value which should be the ticket type
					bunnyLog.info(`Opening ticket with type: ${customId}`)
					await openTicketFromSelect(inter)
					break
				}
				default:
					bunnyLog.warn(`Unhandled tickets action: ${action}`)
					break
			}
		},
	},
}

export async function selectMenuInteractionHandler(
	inter: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		bunnyLog.info(`Processing select menu interaction: ${inter.customId}`)

		// Handle direct ticket actions
		if (inter.customId.startsWith('open_ticket_')) {
			bunnyLog.info(
				`Handling direct ticket open via select menu: ${inter.customId}, selected value: ${inter.values[0]}`
			)
			await openTicketFromSelect(inter)
			return
		}

		// For structured menu IDs (baseId:action)
		const [baseId] = inter.customId.split(':')
		const selectMenuConfig = selectMenuMap[baseId]

		if (!selectMenuConfig) {
			bunnyLog.warn(`No handler found for select menu: ${inter.customId}`)
			return
		}

		await selectMenuConfig.handler(inter)
	} catch (error) {
		bunnyLog.error('Failed to handle select menu interaction:', error)
	}
}
