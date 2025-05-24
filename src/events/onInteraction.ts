import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import * as Inter from '@/events/interactions/index.js'

/**
 * Handle Discord interactions
 * @param {Discord.Interaction} inter - The interaction to handle
 */
export async function interactionHandler(
	inter: Discord.Interaction
): Promise<void> {
	try {
		// Handle slash commands using the interaction handler
		if (inter.isChatInputCommand()) {
			await Inter.commandInteractionHandler(inter)
			return
		}

		// Handle button interactions
		if (inter.isButton()) {
			await Inter.buttonInteractionHandler(inter)
			return
		}

		// Handle modal submissions
		if (inter.isModalSubmit()) {
			await Inter.modalInteractionHandler(inter)
			return
		}

		// Handle select menu interactions
		if (inter.isStringSelectMenu()) {
			await Inter.selectMenuInteractionHandler(inter)
			return
		}

		// Handle channel select menu interactions
		if (inter.isChannelSelectMenu()) {
			await Inter.channelSelectInteractionHandler(inter)
			return
		}

		// Handle role select menu interactions
		if (inter.isRoleSelectMenu()) {
			await Inter.roleSelectInteractionHandler(inter)
			return
		}

		// Unhandled interaction - log it
		console.log('Unhandled interaction:', {
			type: inter.type,
			id: inter.id,
			customId: 'customId' in inter ? inter.customId : undefined,
			commandName: 'commandName' in inter ? inter.commandName : undefined,
		})
	} catch (error) {
		bunnyLog.error('Error handling interaction:', error)

		// Try to respond with an error message if possible
		if (inter.isRepliable() && !inter.replied && !inter.deferred) {
			try {
				await inter.reply({
					content: 'An error occurred while processing your request.',
					ephemeral: true,
				})
			} catch (e) {
				// Ignore errors related to already replied interactions
			}
		}
	}
}

// Default export for backward compatibility
export default interactionHandler
