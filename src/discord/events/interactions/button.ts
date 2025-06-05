import type { ButtonInteraction, ThreadChannel } from 'discord.js'
import * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { config as centralizedConfig } from '@/discord/commands/config/index.js'
import { config as starboardConfig } from '@/discord/commands/config/starboard.js'
import { PLUGINS } from '@/discord/commands/constants.js'
import { updateTicketRating } from '@/discord/api/tickets.js'
import { StatusLogger, EventLogger } from '@/utils/bunnyLogger.js'

type ButtonHandler = (inter: ButtonInteraction) => Promise<void>

interface ButtonStructure {
	handler: ButtonHandler
}

// Button map structure for different button types
const buttonMap: Record<string, ButtonStructure> = {
	// Legacy rating format support
	rate_ticket: {
		handler: async (inter: ButtonInteraction) => {
			const [_, threadId, rating] = inter.customId.split(':')
			await handleTicketRating(inter, threadId, Number.parseInt(rating))
		},
	},
	// Auto-close rating buttons (rate_1, rate_2, rate_3, rate_4, rate_5)
	rate_1: {
		handler: async (inter: ButtonInteraction) => {
			const [_, guildId, threadId] = inter.customId.split(':')
			await handleTicketRating(inter, threadId, 1)
		},
	},
	rate_2: {
		handler: async (inter: ButtonInteraction) => {
			const [_, guildId, threadId] = inter.customId.split(':')
			await handleTicketRating(inter, threadId, 2)
		},
	},
	rate_3: {
		handler: async (inter: ButtonInteraction) => {
			const [_, guildId, threadId] = inter.customId.split(':')
			await handleTicketRating(inter, threadId, 3)
		},
	},
	rate_4: {
		handler: async (inter: ButtonInteraction) => {
			const [_, guildId, threadId] = inter.customId.split(':')
			await handleTicketRating(inter, threadId, 4)
		},
	},
	rate_5: {
		handler: async (inter: ButtonInteraction) => {
			const [_, guildId, threadId] = inter.customId.split(':')
			await handleTicketRating(inter, threadId, 5)
		},
	},
	[PLUGINS.TICKETS]: {
		handler: async (inter: ButtonInteraction) => {
			const [_, action, ...params] = inter.customId.split(':')

			switch (action) {
				case 'open':
					await commands.ticket.openTicket(inter)
					break
				case 'confirm': {
					if (params[0] === 'close') {
						await commands.ticket.confirmClose(inter)
					} else {
						StatusLogger.warn(`Unhandled confirm action: ${params[0]}`)
					}
					break
				}
				case 'back': {
					if (params[0] === 'config') {
						await centralizedConfig(inter)
					}
					break
				}
				case 'add': {
					if (params[0] === 'role_limit') {
						await centralizedConfig(inter)
					}
					break
				}
				case 'remove': {
					if (params[0] === 'role_limit') {
						await centralizedConfig(inter)
					}
					break
				}
				case 'rate': {
					await handleTicketRating(inter, params[0], Number.parseInt(params[1]))
					break
				}
				default:
					StatusLogger.warn(`Unhandled tickets action: ${action}`)
					break
			}
		},
	},
}

export async function buttonInteractionHandler(
	inter: ButtonInteraction
): Promise<void> {
	try {
		// Handle starboard interactions directly
		if (inter.customId.startsWith('starboard_')) {
			await starboardConfig(inter)
			return
		}

		// Check for other configuration buttons (centralized config system)
		if (inter.customId.startsWith('ticket_')) {
			await centralizedConfig(inter)
			return
		}

		// First check if it's a direct ticket action
		if (inter.customId.startsWith('open_ticket:')) {
			await commands.ticket.openTicket(inter)
			return
		}

		if (inter.customId.startsWith('claim_ticket:')) {
			await commands.ticket.claimTicket(inter)
			return
		}

		if (inter.customId.startsWith('join_ticket:')) {
			await commands.ticket.joinTicket(inter)
			return
		}

		if (inter.customId.startsWith('close_ticket:')) {
			await commands.ticket.requestClose(inter)
			return
		}

		if (inter.customId.startsWith('close_ticket_reason:')) {
			await showCloseReasonModal(inter)
			return
		}

		if (inter.customId.startsWith('confirm_close:')) {
			await commands.ticket.confirmClose(inter)
			return
		}

		// For structured button IDs (baseId:action:params)
		const baseId = inter.customId.split(':')[0]

		const buttonConfig = buttonMap[baseId]
		if (!buttonConfig) {
			StatusLogger.warn(
				`No handler found for button with baseId: ${baseId}, custom_id: ${inter.customId}`
			)
			return
		}

		await buttonConfig.handler(inter)
	} catch (error) {
		EventLogger.error('button interaction', error as Error)
		await inter.reply({
			content: 'An error occurred while processing your request.',
			flags: Discord.MessageFlags.Ephemeral,
		})
	}
}

/* -------------------------------------------------------------------------- */
/*                            BUTTON HANDLERS                                 */
/* -------------------------------------------------------------------------- */

async function showCloseReasonModal(inter: ButtonInteraction): Promise<void> {
	try {
		const threadId = inter.customId.split(':')[1]

		const modal = new Discord.ModalBuilder()
			.setCustomId(`close_ticket_modal:${threadId}`)
			.setTitle('Close Ticket')

		const reasonRow =
			new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
				new Discord.TextInputBuilder()
					.setCustomId('close_reason')
					.setLabel('Reason for closing (optional)')
					.setStyle(Discord.TextInputStyle.Paragraph)
					.setMaxLength(500)
					.setRequired(false)
					.setPlaceholder('Please provide a reason for closing this ticket...')
			)

		modal.addComponents(reasonRow)
		await inter.showModal(modal)
	} catch (error) {
		StatusLogger.error('Error showing close reason modal', error as Error)
		await inter.reply({
			content: 'An error occurred while showing the close reason form.',
			flags: Discord.MessageFlags.Ephemeral,
		})
	}
}

async function handleTicketRating(
	inter: Discord.ButtonInteraction,
	threadId: string,
	rating: number
): Promise<void> {
	try {
		// Update the ticket rating in the database
		await updateTicketRating(
			inter.client.user.id,
			threadId,
			rating,
			inter.message.id
		)

		// Extract and disable only the rating buttons from the original message
		const updatedActionRows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] =
			[]

		for (const row of inter.message.components) {
			if (row.type === Discord.ComponentType.ActionRow) {
				const buttonComponents: Discord.ButtonBuilder[] = []

				for (const component of row.components) {
					if (component.type === Discord.ComponentType.Button) {
						const button = Discord.ButtonBuilder.from(component)
						button.setDisabled(true)

						// Highlight the selected rating button
						const buttonRating = Number.parseInt(
							component.customId?.split(':')[2] ?? '0'
						)
						if (buttonRating === rating) {
							button.setStyle(Discord.ButtonStyle.Success)
						}

						buttonComponents.push(button)
					}
				}

				if (buttonComponents.length > 0) {
					updatedActionRows.push(
						new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
							...buttonComponents
						)
					)
				}
			}
		}

		// Edit the original message to show the rating result with disabled buttons
		const stars = '⭐'.repeat(rating)

		// Check if the original message used V2 components
		const hasV2Components = inter.message.flags?.has(
			Discord.MessageFlags.IsComponentsV2
		)

		if (hasV2Components) {
			// For V2 messages, completely replace with new thank you components
			const thankYouComponents = [
				{
					type: Discord.ComponentType.TextDisplay,
					content: '## Thank You For Your Feedback!',
				},
				{
					type: Discord.ComponentType.Separator,
					spacing: Discord.SeparatorSpacingSize.Large,
					divider: false,
				},
				{
					type: Discord.ComponentType.TextDisplay,
					content: `You rated your support experience: ${stars} (${rating}/5)`,
				},
				{
					type: Discord.ComponentType.Separator,
					spacing: Discord.SeparatorSpacingSize.Large,
					divider: false,
				},
				{
					type: Discord.ComponentType.TextDisplay,
					content: '-# Your feedback helps us improve our support services.',
				},
				...updatedActionRows, // Add only the disabled rating buttons
			]

			await inter.update({
				components: thankYouComponents,
				flags: Discord.MessageFlags.IsComponentsV2,
			})
		} else {
			// For regular messages, use content field
			await inter.update({
				content: `## Thank You For Your Feedback!\n\nYou rated your support experience: ${stars} (${rating}/5)\n\n*Your feedback helps us improve our support services.* (edited)`,
				components: updatedActionRows,
			})
		}

		// Update transcript message rating
		await updateTranscriptRating(inter, threadId, rating)
	} catch (error) {
		StatusLogger.error('Error processing ticket rating', error as Error)

		try {
			await inter.reply({
				content:
					'❌ Sorry, there was an error saving your rating. Please try again later.',
				flags: Discord.MessageFlags.Ephemeral,
			})
		} catch (replyError) {
			StatusLogger.error('Failed to send error response', replyError as Error)
		}
	}
}

async function updateTranscriptRating(
	inter: Discord.ButtonInteraction,
	threadId: string,
	rating: number
): Promise<void> {
	try {
		// Import API functions
		const { findTicketByThreadId } = await import('@/discord/api/tickets.js')

		const ticketData = await findTicketByThreadId(
			inter.client.user.id,
			threadId
		)
		if (!ticketData) {
			return
		}

		const { guild_id, metadata } = ticketData

		// Check if transcript message info is saved in metadata
		if (
			!metadata.transcript_channel?.id ||
			!metadata.transcript_channel?.message_id
		) {
			return
		}

		// Get the guild object to fetch the transcript channel
		const guild = await inter.client.guilds.fetch(guild_id)
		if (!guild) {
			return
		}

		// Find the transcript channel
		const transcriptChannel = await guild.channels.fetch(
			metadata.transcript_channel.id
		)
		if (!transcriptChannel?.isTextBased()) {
			return
		}

		// Fetch the specific transcript message directly by ID
		let transcriptMessage: Discord.Message
		try {
			transcriptMessage = await transcriptChannel.messages.fetch(
				metadata.transcript_channel.message_id
			)
		} catch (error) {
			return
		}

		// Only try to edit if the message was authored by this bot
		if (transcriptMessage.author.id !== inter.client.user.id) {
			return
		}

		// Update the transcript message with the rating
		const stars = '⭐'.repeat(rating)

		// Check if it's a V2 components message
		const hasV2Components = transcriptMessage.flags?.has(
			Discord.MessageFlags.IsComponentsV2
		)

		if (hasV2Components) {
			try {
				// Make a deep copy of the current components
				const currentComponents = JSON.parse(
					JSON.stringify(transcriptMessage.components)
				)
				let hasRatingUpdate = false

				// Look for TextDisplay components (type 10) that contain rating information
				for (const component of currentComponents) {
					if (
						component.type === 10 &&
						component.content &&
						typeof component.content === 'string'
					) {
						// Check if this component contains rating information
						if (
							component.content.includes('**Rating:**') ||
							component.content.includes('Rating:') ||
							component.content.includes('{rating}')
						) {
							const originalText = component.content

							// Update rating in the text
							const updatedText = originalText
								.replace(
									/\*\*Rating:\*\* Not rated/g,
									`**Rating:** ${stars} (${rating}/5)`
								)
								.replace(
									/\*\*Rating:\*\* ⭐+ \(\d+\/5\)/g,
									`**Rating:** ${stars} (${rating}/5)`
								)
								.replace(/Rating: Not rated/g, `Rating: ${stars} (${rating}/5)`)
								.replace(
									/Rating: ⭐+ \(\d+\/5\)/g,
									`Rating: ${stars} (${rating}/5)`
								)
								.replace(/\{rating\}/g, `${stars} (${rating}/5)`)

							if (updatedText !== originalText) {
								component.content = updatedText
								hasRatingUpdate = true
							}
						}
					}
				}

				if (hasRatingUpdate) {
					// Update the message with the modified components
					await transcriptMessage.edit({
						components: currentComponents,
						flags: Discord.MessageFlags.IsComponentsV2,
					})
				}
			} catch (error) {
				StatusLogger.error('Error updating V2 components', error as Error)
			}
		} else {
			// For regular messages, update the content
			const updatedContent = transcriptMessage.content
				.replace(/Rating: Not rated/g, `Rating: ${stars} (${rating}/5)`)
				.replace(/Rating: ⭐+ \(\d+\/5\)/g, `Rating: ${stars} (${rating}/5)`)

			await transcriptMessage.edit({
				content: updatedContent,
				components: transcriptMessage.components,
			})
		}
	} catch (error) {
		StatusLogger.error('Error updating transcript rating', error as Error)
		// Don't fail the entire rating process if transcript update fails
	}
}
