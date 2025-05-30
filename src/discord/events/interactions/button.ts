import type { ButtonInteraction, ThreadChannel } from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { PLUGINS } from '@/discord/commands/constants.js'
import { bunnyLog } from 'bunny-log'

type ButtonHandler = (inter: ButtonInteraction) => Promise<void>

interface ButtonStructure {
	handler: ButtonHandler
}

// Button map structure for different button types
const buttonMap: Record<string, ButtonStructure> = {
	[PLUGINS.TICKETS]: {
		handler: async (inter: ButtonInteraction) => {
			const [_, action, ...params] = inter.customId.split(':')

			bunnyLog.info(
				`🎫 Tickets handler: action="${action}", params=[${params.join(', ')}]`
			)

			switch (action) {
				case 'open':
					bunnyLog.info('🎫 Executing open ticket handler')
					await commands.ticket.openTicket(inter)
					break
				case 'confirm': {
					bunnyLog.info(`🎫 Confirm action: params[0]="${params[0]}"`)
					if (params[0] === 'close') {
						bunnyLog.info('✅ Executing confirmClose handler')
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
					bunnyLog.info(
						`⭐ Rating action: threadId="${params[0]}", rating="${params[1]}"`
					)
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
		bunnyLog.info(
			`🔘 Button interaction received: ${inter.customId} in guild ${inter.guildId}`
		)
		bunnyLog.info(`👤 User: ${inter.user.username} (${inter.user.id})`)
		bunnyLog.info(`📍 Channel: ${inter.channelId} (${inter.channel?.type})`)

		// First check if it's a direct ticket action
		if (inter.customId.startsWith('open_ticket_')) {
			bunnyLog.info(`🎫 Handling direct ticket open: ${inter.customId}`)
			await commands.ticket.openTicket(inter)
			return
		}

		if (inter.customId.startsWith('claim_ticket:')) {
			bunnyLog.info(`🛡️ Handling ticket claim: ${inter.customId}`)
			await commands.ticket.claimTicket(inter)
			return
		}

		if (inter.customId.startsWith('join_ticket:')) {
			bunnyLog.info(`👥 Handling ticket join: ${inter.customId}`)
			await commands.ticket.joinTicket(inter)
			return
		}

		if (inter.customId.startsWith('close_ticket:')) {
			bunnyLog.info(`❌ Handling ticket close request: ${inter.customId}`)
			bunnyLog.info(
				`🧵 Thread context: threadId: ${inter.channelId}, threadName: ${(inter.channel as ThreadChannel)?.name}`
			)
			await commands.ticket.requestClose(inter)
			return
		}

		// For structured button IDs (baseId:action:params)
		const baseId = inter.customId.split(':')[0]
		bunnyLog.info(
			`🔍 Checking structured button with baseId: ${baseId}, full custom_id: ${inter.customId}`
		)

		const buttonConfig = buttonMap[baseId]
		if (!buttonConfig) {
			bunnyLog.warn(
				`❌ No handler found for button with baseId: ${baseId}, custom_id: ${inter.customId}`
			)
			return
		}

		bunnyLog.info(`⚙️ Found handler for baseId: ${baseId}, executing...`)
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
			ephemeral: true,
		})
	}
}

/* -------------------------------------------------------------------------- */
/*                            BUTTON HANDLERS                                 */
/* -------------------------------------------------------------------------- */

async function handleTicketRating(
	inter: ButtonInteraction,
	threadId: string,
	rating: number
): Promise<void> {
	try {
		bunnyLog.info(
			`⭐ Processing rating: ${rating} stars for thread ${threadId}`
		)

		// Import the API function
		const { updateTicketRating } = await import('@/api/tickets.js')

		// Update the ticket rating in the database
		await updateTicketRating(
			inter.client.user.id,
			threadId,
			rating,
			inter.message.id
		)

		// Send confirmation response
		await inter.reply({
			content: `⭐ Thank you for your feedback! You rated this support experience **${rating}** out of 5 stars.\n\nYour feedback helps us improve our support services.`,
			ephemeral: true,
		})

		bunnyLog.success(`✅ Rating ${rating} stars saved for ticket ${threadId}`)

		// Try to delete the original rating message
		try {
			await inter.message.delete()
			bunnyLog.info('🗑️ Deleted rating message after submission')
		} catch (deleteError) {
			bunnyLog.warn('⚠️ Could not delete rating message:', deleteError)
		}
	} catch (error) {
		bunnyLog.error('❌ Error processing ticket rating:', error)

		try {
			await inter.reply({
				content:
					'❌ Sorry, there was an error saving your rating. Please try again later.',
				ephemeral: true,
			})
		} catch (replyError) {
			bunnyLog.error('❌ Failed to send error response:', replyError)
		}
	}
}
