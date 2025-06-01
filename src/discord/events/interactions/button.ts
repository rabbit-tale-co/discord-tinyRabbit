import type { ButtonInteraction, ThreadChannel } from 'discord.js'
import * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { PLUGINS } from '@/discord/commands/constants.js'
import { bunnyLog } from 'bunny-log'
import { updateTicketRating } from '@/discord/api/tickets.js'

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
						bunnyLog.warn(`⚠️ Unhandled confirm action: ${params[0]}`)
					}
					break
				}
				case 'back': {
					if (params[0] === 'config') {
						await commands.ticket.config(inter)
					}
					break
				}
				case 'add': {
					if (params[0] === 'role_limit') {
						await commands.ticket.handleRoleTimeLimitAdd(inter)
					}
					break
				}
				case 'remove': {
					if (params[0] === 'role_limit') {
						await commands.ticket.handleRoleTimeLimitRemove(inter)
					}
					break
				}
				case 'rate': {
					await handleTicketRating(inter, params[0], Number.parseInt(params[1]))
					break
				}
				default:
					bunnyLog.warn(`⚠️ Unhandled tickets action: ${action}`)
					break
			}
		},
	},
}

export async function buttonInteractionHandler(
	inter: ButtonInteraction
): Promise<void> {
	try {
		// First check if it's a direct ticket action
		if (inter.customId.startsWith('open_ticket_')) {
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
			bunnyLog.warn(
				`❌ No handler found for button with baseId: ${baseId}, custom_id: ${inter.customId}`
			)
			return
		}

		await buttonConfig.handler(inter)
	} catch (error) {
		bunnyLog.error(
			'❌ Error handling button interaction:',
			error,
			'custom_id:',
			inter.customId
		)
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
		bunnyLog.error('❌ Error showing close reason modal:', error)
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

		// Disable all rating buttons and highlight the selected one
		const updatedComponents = inter.message.components.map((row) => {
			if (row.type === Discord.ComponentType.ActionRow) {
				const newComponents = row.components.map((component) => {
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

						return button
					}
					return component
				})
				return new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					...(newComponents as Discord.ButtonBuilder[])
				)
			}
			return row
		}) as Discord.ActionRowBuilder<Discord.ButtonBuilder>[]

		// Edit the original message to show the rating result with disabled buttons
		const stars = '⭐'.repeat(rating)

		// Check if the original message used V2 components
		const hasV2Components = inter.message.flags?.has(
			Discord.MessageFlags.IsComponentsV2
		)

		if (hasV2Components) {
			// For V2 messages, create V2 thank you components
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
				...updatedComponents, // Add the disabled rating buttons
			]

			await inter.update({
				components: thankYouComponents,
				flags: Discord.MessageFlags.IsComponentsV2,
			})
		} else {
			// For regular messages, use content field
			await inter.update({
				content: `## Thank You For Your Feedback!\n\nYou rated your support experience: ${stars} (${rating}/5)\n\n*Your feedback helps us improve our support services.* (edited)`,
				components: updatedComponents,
			})
		}

		// Update transcript message rating
		await updateTranscriptRating(inter, threadId, rating)
	} catch (error) {
		bunnyLog.error('❌ Error processing ticket rating:', error)

		try {
			await inter.reply({
				content:
					'❌ Sorry, there was an error saving your rating. Please try again later.',
				flags: Discord.MessageFlags.Ephemeral,
			})
		} catch (replyError) {
			bunnyLog.error('❌ Failed to send error response:', replyError)
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
				bunnyLog.error('❌ Error updating V2 components:', error)
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
		bunnyLog.error('❌ Error updating transcript rating:', error)
		// Don't fail the entire rating process if transcript update fails
	}
}
