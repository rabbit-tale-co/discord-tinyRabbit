import { setUserXpAndLevel, levelCommand } from '../commands/xp'
import * as ticket from '../commands/tickets'
import type * as Discord from 'discord.js'
import { handleBdayCommand } from '../commands/bday'
import { bunnyLog } from 'bunny-log'

// Command handlers
const commandHandlers: Record<
	string,
	(interaction: Discord.ChatInputCommandInteraction) => Promise<void>
> = {
	level: levelCommand,
	set_level: setUserXpAndLevel,
	send_embed: ticket.sendEmbed,
	bday: handleBdayCommand,
}

// Button interaction handlers
const buttonInteractionHandlers: Record<
	string,
	(interaction: Discord.ButtonInteraction) => Promise<void>
> = {
	open_ticket: ticket.openTicket,
	close_ticket_with_reason: ticket.closeTicketWithReason,
	close_ticket: ticket.closeTicket,
	confirm_close_ticket: ticket.confirmCloseTicket,
	join_ticket: ticket.joinTicket,
	claim_ticket: ticket.claimTicket,
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
			const commandHandler = commandHandlers[interaction.commandName]

			// Check if the command handler exists
			if (!commandHandler) {
				bunnyLog.warn('No command handler found for:', interaction.commandName)
				return
			}

			// Execute the command handler
			return await commandHandler(interaction)
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
			return await ticket.modalSubmit(
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
			const replyMethod =
				interaction.replied || interaction.deferred ? 'followUp' : 'reply'
			// Send an ephemeral error message
			await interaction[replyMethod]({
				content: 'Wystąpił błąd podczas wykonywania polecenia.',
				ephemeral: true,
			})
		}
	}
}

export { interactionHandler }
