import * as commands from '../commands/index.js'
import * as utils from '../utils/index.js'
import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'

type CommandHandler = (
	interaction: Discord.ChatInputCommandInteraction
) => Promise<void>

type SubcommandMap = Record<string, CommandHandler>

interface CommandStructure {
	handler?: CommandHandler
	subcommands?: SubcommandMap
}

const commandMap: Record<string, CommandStructure> = {
	// Level management
	level: {
		subcommands: {
			show: commands.showLevel,
			set: commands.setLevel,
		},
	},

	// Ticket system - fix structure
	send_embed: {
		handler: commands.ticket.sendEmbed,
	},

	// plugin: {
	// 	subcommands: {
	// 		create_license: commands.plugin.createLicense,
	// 		info: commands.plugin.info,
	// 	},
	// },

	// Birthday tracking

	bday: {
		subcommands: {
			set: commands.setBirthday,
			show: commands.showBirthday,
			remove: commands.removeBirthday,
		},
	},
}

// Button interaction handlers
const buttonInteractionHandlers: Record<
	string,
	(interaction: Discord.ButtonInteraction) => Promise<void>
> = {
	open_ticket: commands.ticket.openTicket,
	close_ticket_with_reason: commands.ticket.closeTicketWithReason,
	close_ticket: commands.ticket.closeTicket,
	confirm_close_ticket: commands.ticket.confirmCloseTicket,
	join_ticket: commands.ticket.joinTicket,
	claim_ticket: commands.ticket.claimTicket,
}

/**
 * Handles interaction commands.
 * @param {Discord.ChatInputCommandInteraction | Discord.ButtonInteraction | Discord.ModalSubmitInteraction} interaction - The interaction object.
 */
async function interactionHandler(
	interaction: Discord.Interaction
): Promise<void> {
	try {
		// Handle command interactions
		if (interaction.isChatInputCommand()) {
			const command = commandMap[interaction.commandName]

			if (command?.subcommands) {
				const subcommand = interaction.options.getSubcommand()
				const handler = command.subcommands[subcommand]

				if (handler) {
					return await handler(interaction)
				}
			} else if (command?.handler) {
				return await command.handler(interaction)
			}
		}

		// Handle button interactions
		if (interaction.isButton()) {
			const handler = Object.entries(buttonInteractionHandlers).find(
				([prefix]) => interaction.customId.startsWith(prefix)
			)?.[1]

			// Check if the button handler exists
			if (handler) {
				// Execute the button handler
				return await handler(interaction)
			}
			bunnyLog.warn(
				'No handler found for button interaction:',
				interaction.customId
			)
		}

		// Handle modal submissions
		if (interaction.isModalSubmit()) {
			return await commands.ticket.modalSubmit(
				interaction as Discord.ModalSubmitInteraction
			)
		}
	} catch (error) {
		// Log the error with bunnyLog
		bunnyLog.error('Error handling interaction:', {
			error: error.message,
			stack: error.stack,
			interaction: interaction.isCommand()
				? interaction.commandName
				: interaction.id,
		})

		// Provide the appropriate reply/followUp depending on the interaction status
		if (interaction.isRepliable()) {
			// Check if the interaction has already been replied to or deferred
			utils.handleResponse(interaction, 'error', `${error.message}`, {
				ephemeral: true,
				code: 'E001',
				error: error.message,
			})
		}
	}
}

export { interactionHandler }
