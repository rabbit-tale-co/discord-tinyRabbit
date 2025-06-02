import type * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as services from '@/discord/services/index.js'
import * as api from '@/discord/api/index.js'
import { bunnyLog } from 'bunny-log'

/**
 * Event handler for message creation.
 * @param {Discord.Message} message - The message object from Discord.
 * @returns {Promise<void>} A promise that resolves when the message is handled.
 */
async function messageHandler(message: Discord.Message): Promise<void> {
	// Ignore messages from bots
	if (message.author.bot) return

	// Ignore messages in DMs
	if (!message.guild) return // TODO: add error handling

	// Handle ticket thread activity before ignoring other threads
	if (message.channel.isThread()) {
		// Only handle ticket threads for activity tracking
		try {
			await handleTicketThreadActivity(message)
		} catch (error) {
			bunnyLog.error('Error handling ticket thread activity:', error)
		}
		return
	}

	try {
		// Manage slowmode
		await services.manageSlowmode(message)

		if (message.content.startsWith('!purge') && message.reference?.messageId) {
			const targetMessage = await message.channel.messages.fetch(
				message.reference.messageId
			)

			const messages = await message.channel.messages.fetch({
				limit: 100,
				after: targetMessage.id,
			})

			const messagesToDelete = messages.filter(
				(m) => m.createdTimestamp > targetMessage.createdTimestamp
			)

			await (message.channel as Discord.TextChannel).bulkDelete([
				...messagesToDelete.values(),
				message,
			])

			await utils.handleResponse(
				message as unknown as Discord.ChatInputCommandInteraction,
				'success',
				`Deleted ${messagesToDelete.size} messages`,
				{ ephemeral: false }
			)
		}

		// Levels plugin check (only for XP assignment)
		const config = await api.getPluginConfig(
			message.client.user.id,
			message.guild.id,
			'levels'
		)

		if (config?.enabled) {
			await services.assignXP(message)
		}
	} catch (error) {
		// Log any errors that may occur during message handling
		bunnyLog.error('Error handling message:', error)
	}
}

/**
 * Handle activity in ticket threads to reset reminder status
 */
async function handleTicketThreadActivity(
	message: Discord.Message
): Promise<void> {
	// Only process messages from users, not bots
	if (message.author.bot) return

	const thread = message.channel as Discord.ThreadChannel

	try {
		// Import ticket store to check if this is a ticket thread
		const { ticketStore } = await import(
			'@/discord/commands/moderation/tickets/state.js'
		)

		// Check if this thread is a ticket
		const ticketMeta = ticketStore.get(thread.id)
		if (!ticketMeta) return // Not a ticket thread

		// Reset reminder_sent flag if it was previously sent
		if (ticketMeta.reminder_sent) {
			ticketMeta.reminder_sent = false
			ticketStore.set(thread.id, ticketMeta)

			// Update in database as well
			try {
				if (message.guild) {
					await api.updateTicketMetadata(
						message.client.user.id,
						message.guild.id,
						thread.id,
						ticketMeta
					)
				}
			} catch (dbError) {
				bunnyLog.error(
					`Failed to reset reminder status in database for ticket ${ticketMeta.ticket_id}:`,
					dbError
				)
			}

			bunnyLog.info(
				`Reset reminder status for ticket ${ticketMeta.ticket_id} due to user activity`
			)
		}
	} catch (error) {
		bunnyLog.error('Error in handleTicketThreadActivity:', error)
	}
}

export { messageHandler }
