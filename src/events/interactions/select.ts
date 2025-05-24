import type * as Discord from 'discord.js'
import * as commands from '@/commands/index.js'
import { ID, PLUGINS } from '@/commands/constants.js'

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
			const action = inter.customId.split(':')[1]

			switch (action) {
				case 'config_select':
				case 'role_limit_select':
				case 'role_limit_time_unit':
				case 'role_limit_time_value':
					await commands.ticket.config(inter)
					break
			}
		},
	},
}

export async function selectMenuInteractionHandler(
	inter: Discord.StringSelectMenuInteraction
): Promise<void> {
	// Extract the base identifier from the customId
	const baseId = inter.customId.split(':')[0]

	const selectMenuConfig = selectMenuMap[baseId]
	if (!selectMenuConfig) return

	await selectMenuConfig.handler(inter)
}
