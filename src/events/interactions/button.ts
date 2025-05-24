import * as Discord from 'discord.js'
import * as commands from '@/commands/index.js'
import { PLUGINS, ID } from '@/commands/constants.js'
import { cid, ACTIONS } from '@/components/ui-builder.js'

type ButtonHandler = (inter: Discord.ButtonInteraction) => Promise<void>

interface ButtonStructure {
	handler: ButtonHandler
}

// Button map structure for different button types
const buttonMap: Record<string, ButtonStructure> = {
	[PLUGINS[0]]: {
		// 'tickets'
		handler: async (inter: Discord.ButtonInteraction) => {
			const [_, action, ...params] = inter.customId.split(':')

			switch (action) {
				case 'open':
					await commands.ticket.openTicket(inter)
					break
				case 'confirm':
					if (params[0] === 'close') {
						await commands.ticket.confirmClose(inter)
					}
					break
				case 'cancel':
					if (params[0] === 'close') {
						await commands.ticket.cancelClose(inter)
					}
					break
				case 'back':
					if (params[0] === 'config') {
						await commands.ticket.config(inter)
					}
					break
				case 'add':
					if (params[0] === 'role_limit') {
						await commands.ticket.handleRoleTimeLimitAdd(inter)
					}
					break
				case 'remove':
					if (params[0] === 'role_limit') {
						await commands.ticket.handleRoleTimeLimitRemove(inter)
					}
					break
			}
		},
	},
	ticket: {
		handler: async (inter: Discord.ButtonInteraction) => {
			if (inter.customId === 'ticket_role_limits_edit') {
				await handleRoleTimeLimitsConfig(inter)
				return
			}
		},
	},
}

export async function buttonInteractionHandler(
	inter: Discord.ButtonInteraction
): Promise<void> {
	try {
		// Extract the base identifier from the customId
		const baseId = inter.customId.split(':')[0]

		const buttonConfig = buttonMap[baseId]
		if (!buttonConfig) {
			console.log(
				`No handler found for button with baseId: ${baseId}, customId: ${inter.customId}`
			)
			return
		}

		await buttonConfig.handler(inter)
	} catch (error) {
		console.error(
			'Error handling button interaction:',
			error,
			'customId:',
			inter.customId
		)
		await inter.reply({
			content: 'An error occurred while processing your request.',
			ephemeral: true,
		})
	}
}

/* -------------------------------------------------------------------------- */
/*                            BUTTON HANDLERS                                 */
/* -------------------------------------------------------------------------- */

async function handleRoleTimeLimitsConfig(inter: Discord.ButtonInteraction) {
	await inter.deferUpdate()

	const roleSelect = new Discord.RoleSelectMenuBuilder()
		.setCustomId(`${PLUGINS[0]}:select:role_limit`)
		.setPlaceholder('Select roles to configure time limits')
		.setMinValues(1)
		.setMaxValues(10)

	const row =
		new Discord.ActionRowBuilder<Discord.RoleSelectMenuBuilder>().addComponents(
			roleSelect
		)

	await inter.editReply({
		content:
			'# Configure Role Time Limits\nSelect roles to set ticket creation time limits',
		components: [row],
	})
}
