import type * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { config as centralizedConfig } from '@/discord/commands/config/index.js'
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
				case 'open': {
					// Handle ticket opening with the selected value
					await openTicketFromSelect(inter)
					break
				}
				default:
					// For other ticket actions, let the main handler route them
					if (!inter.customId.startsWith('ticket_')) {
						await handleTicketActionSelect(inter)
					}
					break
			}
		},
	},
}

export async function selectMenuInteractionHandler(
	inter: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		// For all configuration-related select menus, delegate to centralized config
		if (
			inter.customId.startsWith('ticket_') ||
			inter.customId.startsWith('tickets:') ||
			inter.customId.startsWith('starboard_') ||
			inter.customId.startsWith('starboard:') ||
			inter.customId.startsWith('role_limit_') ||
			inter.customId.includes('config_select') ||
			inter.customId.includes('config')
		) {
			await centralizedConfig(inter)
			return
		}

		// Handle direct ticket actions - these use the select menu for ticket creation
		if (inter.customId.startsWith('open_ticket:')) {
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
