import { setUserXpAndLevel, levelCommand } from '../commands/xp'
import * as ticket from '../commands/tickets'
import { getPluginConfig } from '../api/plugins'
import type {
	ButtonInteraction,
	CommandInteraction,
	Interaction,
	ModalSubmitInteraction,
} from 'discord.js'
import { handleBdayCommand } from '../commands/bday'
import { bunnyLog } from 'bunny-log'

const commandHandlers: Record<
	string,
	(interaction: CommandInteraction) => Promise<void>
> = {
	level: levelCommand,
	set_level: setUserXpAndLevel,
	send_embed: ticket.sendEmbed,
	bday: handleBdayCommand,
}

const buttonInteractionHandlers: Record<
	string,
	(interaction: ButtonInteraction) => Promise<void>
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
 * @param {Interaction} interaction - The interaction object.
 */
async function interactionHandler(interaction: Interaction): Promise<void> {
	try {
		// Handle command interactions
		if (interaction.isCommand()) {
			const commandHandler = commandHandlers[interaction.commandName]

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

			if (handler) {
				return await handler(interaction)
			}
			bunnyLog.warn(
				'No handler found for button interaction:',
				interaction.customId
			)
		}

		// Handle modal submissions
		if (interaction.isModalSubmit()) {
			return await ticket.modalSubmit(interaction as ModalSubmitInteraction)
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
		// Zapewnij odpowiednią odpowiedź/followUp w zależności od statusu interakcji
		if (interaction.isRepliable()) {
			const replyMethod =
				interaction.replied || interaction.deferred ? 'followUp' : 'reply'
			await interaction[replyMethod]({
				content: 'Wystąpił błąd podczas wykonywania polecenia.',
				ephemeral: true,
			})
		}
	}
}

export { interactionHandler }
