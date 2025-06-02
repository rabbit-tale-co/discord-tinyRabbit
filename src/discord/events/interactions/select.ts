import type * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { PLUGINS, TICKET_ACTIONS } from '@/discord/commands/constants.js'
import {
	openTicketFromSelect,
	handleTicketActionSelect,
} from '@/discord/commands/moderation/tickets/open.js'
import { StatusLogger, EventLogger } from '@/utils/bunnyLogger.js'

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
					await openTicketFromSelect(inter)
					break
				}
				default:
					StatusLogger.warn(`Unhandled tickets action: ${action}`)
					break
			}
		},
	},
}

export async function selectMenuInteractionHandler(
	inter: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		// Handle direct ticket actions - these use the select menu for ticket creation
		if (inter.customId.startsWith('open_ticket_')) {
			await openTicketFromSelect(inter)
			return
		}

		// For structured menu IDs (baseId:action)
		const [baseId] = inter.customId.split(':')
		const selectMenuConfig = selectMenuMap[baseId]

		if (!selectMenuConfig) {
			StatusLogger.warn(`No handler found for select menu: ${inter.customId}`)
			return
		}

		await selectMenuConfig.handler(inter)
	} catch (error) {
		EventLogger.error('select menu interaction', error as Error)
	}
}
