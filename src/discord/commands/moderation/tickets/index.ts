export * from './config.js'
export * from './close.js'
export * from './open.js'
export * from './message.js'
export * from './state.js'
export * from './limits.js'
export * from '@/commands/constants.js'

// Add inactivity checker functionality
import * as Discord from 'discord.js'
import { StatusLogger, ServiceLogger } from '@/utils/bunnyLogger.js'
import { ticketStore } from './state.js'
import { autoCloseTicket } from './close.js'
import type { ThreadMetadata } from '@/types/tickets.js'
import * as api from '@/discord/api/index.js'

const INACTIVITY_CHECK_INTERVAL = 60 * 1000 // Check every minute
const DEFAULT_INACTIVITY_THRESHOLD = 72 * 60 * 60 * 1000 // 72 hours

/**
 * Initialize the ticket inactivity checker
 */
export async function initTicketInactivityChecker(client: Discord.Client) {
	// Scan all existing tickets on startup
	await scanAllExistingTickets(client)

	// Run periodic check immediately after startup scan
	await checkTicketsForInactivity(client)

	// Set up periodic checks
	setInterval(async () => {
		try {
			await checkTicketsForInactivity(client)
		} catch (error) {
			StatusLogger.error('Error in ticket inactivity checker:', error)
		}
	}, INACTIVITY_CHECK_INTERVAL)
}

/**
 * Scan all existing tickets across all guilds on startup
 */
async function scanAllExistingTickets(client: Discord.Client) {
	try {
		if (!client.user) {
			StatusLogger.error('Client user not available for ticket scan')
			return
		}

		const guilds = await client.guilds.fetch()
		let totalTicketsScanned = 0
		let totalTicketsClosed = 0

		for (const [guildId, guildBasic] of guilds) {
			try {
				// Get full guild object
				const guild = await client.guilds.fetch(guildId)
				if (!guild) continue

				// Get plugin config to check if tickets are enabled and auto-close is configured
				const config = await api.getPluginConfig(
					client.user.id,
					guildId,
					'tickets'
				)

				// Skip if tickets disabled or auto-close not enabled
				if (!config?.enabled || !config?.auto_close?.[0]?.enabled) {
					continue
				}

				// Get all active tickets for this guild from database
				const activeTickets = await api.getAllActiveTickets(
					client.user.id,
					guildId
				)

				const inactivityThreshold =
					config.auto_close[0].threshold || DEFAULT_INACTIVITY_THRESHOLD

				for (const ticket of activeTickets) {
					try {
						totalTicketsScanned++

						// Check if this ticket should be closed
						const shouldClose = await checkTicketForInactivityOnStartup(
							client,
							guild,
							ticket.metadata,
							ticket.thread_id,
							inactivityThreshold
						)

						if (shouldClose) {
							totalTicketsClosed++
						}
					} catch (error) {
						StatusLogger.error(
							`Error scanning ticket ${ticket.metadata.ticket_id}:`,
							error
						)
					}
				}
			} catch (error) {
				StatusLogger.error(`Error scanning guild ${guildId}:`, error)
			}
		}

		// Only log if there's something meaningful to report
		if (totalTicketsScanned > 0) {
			if (totalTicketsClosed > 0) {
				StatusLogger.success(
					`🎫 Auto-closed ${totalTicketsClosed}/${totalTicketsScanned} inactive tickets`
				)
			} else {
				StatusLogger.success(
					`🎫 Scanned ${totalTicketsScanned} tickets - all active`
				)
			}
		}
	} catch (error) {
		StatusLogger.error('Error in scanAllExistingTickets:', error)
	}
}

/**
 * Check a specific ticket for inactivity during startup scan
 */
async function checkTicketForInactivityOnStartup(
	client: Discord.Client,
	guild: Discord.Guild,
	ticketMetadata: ThreadMetadata,
	threadId: string,
	inactivityThreshold: number
): Promise<boolean> {
	try {
		// Fetch the thread
		const thread = (await guild.channels.fetch(
			threadId
		)) as Discord.ThreadChannel
		if (!thread?.isThread()) {
			ticketStore.delete(threadId)
			return false
		}

		// Check if thread is already archived or locked
		if (thread.archived || thread.locked) {
			ticketStore.delete(threadId)
			return false
		}

		// Add to memory store if not already there
		if (!ticketStore.has(threadId)) {
			ticketStore.set(threadId, ticketMetadata)
		}

		// Check last message time
		const messages = await thread.messages.fetch({ limit: 50 }) // Fetch more messages to find non-bot message
		if (messages.size === 0) {
			StatusLogger.warn(`No messages found in ticket ${ticketMetadata.ticket_id}`)
			return false
		}

		// Find the last message that was NOT sent by a bot
		const lastUserMessage = messages.find((message) => !message.author.bot)

		let timeSinceLastActivity: number

		if (!lastUserMessage) {
			// No user messages found - use ticket creation time as fallback
			// StatusLogger.info(
			// 	`No user messages found in ticket ${ticketMetadata.ticket_id}, using creation time`
			// )
			const ticketCreationTime =
				(ticketMetadata.open_time || Math.floor(Date.now() / 1000)) * 1000
			timeSinceLastActivity = Date.now() - ticketCreationTime
		} else {
			timeSinceLastActivity = Date.now() - lastUserMessage.createdTimestamp
		}

		// Calculate reminder threshold (70% of inactivity threshold)
		const reminderThreshold = Math.floor(inactivityThreshold * 0.7)

		// If ticket is inactive enough for auto-close, close it
		if (timeSinceLastActivity > inactivityThreshold) {
			const reason = 'Ticket automatically closed due to inactivity'
			await autoCloseTicket(client, thread, reason)
			return true
		}
		// If ticket reached reminder threshold and reminder hasn't been sent, send reminder
		if (
			timeSinceLastActivity > reminderThreshold &&
			!ticketMetadata.reminder_sent
		) {
			await sendInactivityReminder(
				client,
				thread,
				ticketMetadata,
				inactivityThreshold
			)
		}

		return false
	} catch (error) {
		StatusLogger.error(`Error checking ticket #${ticketMetadata.ticket_id}:`, error)
		return false
	}
}

/**
 * Check all active tickets for inactivity
 */
async function checkTicketsForInactivity(client: Discord.Client) {
	try {
		const activeTickets = ticketStore
			.values()
			.filter((ticket) => ticket.status !== 'closed')

		// StatusLogger.info(
		// 	`🔍 Checking ${activeTickets.length} active tickets for inactivity`
		// )

		for (const ticket of activeTickets) {
			try {
				// Get the guild for this ticket
				const guild = client.guilds.cache.get(ticket.guild_id)
				if (!guild) {
					StatusLogger.warn(
						`Guild ${ticket.guild_id} not found for ticket ${ticket.ticket_id}`
					)
					continue
				}

				// Get plugin config to check if auto-close is enabled
				const config = await api.getPluginConfig(
					client.user.id,
					ticket.guild_id,
					'tickets'
				)

				// Log config status
				// StatusLogger.info(
				// 	`📋 Ticket ${ticket.ticket_id} - Auto-close enabled: ${config?.auto_close?.[0]?.enabled}, Threshold: ${config?.auto_close?.[0]?.threshold}ms`
				// )

				// Skip if auto-close is not enabled
				if (!config?.auto_close?.[0]?.enabled) {
					// StatusLogger.info(
					// 	`⏭️ Skipping ticket ${ticket.ticket_id} - auto-close disabled`
					// )
					continue
				}

				const inactivityThreshold =
					config.auto_close[0].threshold || DEFAULT_INACTIVITY_THRESHOLD

				await checkInactiveTicket(client, guild, ticket, inactivityThreshold)
			} catch (error) {
				StatusLogger.error(
					`Error checking ticket ${ticket.ticket_id} for inactivity: ${error}`
				)
			}
		}
	} catch (error) {
		StatusLogger.error('Error in ticket inactivity checker:', error)
	}
}

/**
 * Check if a specific ticket is inactive and close it if needed
 */
async function checkInactiveTicket(
	client: Discord.Client,
	guild: Discord.Guild,
	ticket: ThreadMetadata,
	inactivityThreshold: number
) {
	try {
		// StatusLogger.info(
		// 	`🎫 Checking ticket ${ticket.ticket_id} for inactivity (threshold: ${Math.floor(inactivityThreshold / (60 * 60 * 1000))}h)`
		// )

		// Fetch the thread
		const thread = (await guild.channels.fetch(
			ticket.thread_id
		)) as Discord.ThreadChannel
		if (!thread?.isThread()) {
			// StatusLogger.warn(`Thread ${ticket.thread_id} not found or not a thread`)
			return
		}

		// Check if thread is already archived or locked
		if (thread.archived || thread.locked) {
			// StatusLogger.info(
			// 	`Thread ${thread.name} is already archived/locked, removing from store`
			// )
			// Remove from memory if it's already closed
			ticketStore.delete(ticket.thread_id)
			return
		}

		// Check last message time
		const messages = await thread.messages.fetch({ limit: 50 }) // Fetch more messages to find non-bot message
		if (messages.size === 0) {
			StatusLogger.warn(`No messages found in ticket ${ticket.ticket_id}`)
			return false
		}

		// Find the last message that was NOT sent by a bot
		const lastUserMessage = messages.find((message) => !message.author.bot)

		let timeSinceLastActivity: number

		if (!lastUserMessage) {
			// No user messages found - use ticket creation time as fallback
			// StatusLogger.info(
			// 	`No user messages found in ticket ${ticket.ticket_id}, using creation time`
			// )
			const ticketCreationTime =
				(ticket.open_time || Math.floor(Date.now() / 1000)) * 1000
			timeSinceLastActivity = Date.now() - ticketCreationTime
		} else {
			timeSinceLastActivity = Date.now() - lastUserMessage.createdTimestamp
		}

		const hoursInactive = Math.floor(timeSinceLastActivity / (60 * 60 * 1000))
		const thresholdHours = Math.floor(inactivityThreshold / (60 * 60 * 1000))

		// StatusLogger.info(
		// 	`⏱️ Ticket ${ticket.ticket_id}: Last user message ${hoursInactive}h ago (threshold: ${thresholdHours}h)`
		// )

		// StatusLogger.info(
		// 	`📊 Ticket ${ticket.ticket_id} timing: ${timeSinceLastActivity}ms since activity > ${inactivityThreshold}ms threshold = ${timeSinceLastActivity > inactivityThreshold ? 'SHOULD CLOSE' : 'STILL ACTIVE'}`
		// )

		// Calculate reminder threshold (70% of inactivity threshold)
		const reminderThreshold = Math.floor(inactivityThreshold * 0.7)

		// If ticket is inactive enough for auto-close, close it
		if (timeSinceLastActivity > inactivityThreshold) {
			// StatusLogger.info(
			// 	`🚨 Ticket ${ticket.ticket_id} exceeded threshold, closing now`
			// )
			await closeInactiveTicket(client, thread, ticket)
		}
		// If ticket reached reminder threshold and reminder hasn't been sent, send reminder
		else if (
			timeSinceLastActivity > reminderThreshold &&
			!ticket.reminder_sent
		) {
			// StatusLogger.info(
			// 	`⚠️ Ticket ${ticket.ticket_id} reached reminder threshold, sending reminder`
			// )
			await sendInactivityReminder(client, thread, ticket, inactivityThreshold)
		} else {
			// StatusLogger.info(`✅ Ticket ${ticket.ticket_id} is still active`)
		}
	} catch (error) {
		StatusLogger.error(
			`Error checking ticket ${ticket.ticket_id} for inactivity: ${error}`
		)
	}
}

/**
 * Close an inactive ticket
 */
async function closeInactiveTicket(
	client: Discord.Client,
	thread: Discord.ThreadChannel,
	ticket: ThreadMetadata
) {
	try {
		// StatusLogger.info(`Auto-closing inactive ticket: ${thread.name} (${thread.id})`)

		// Close the ticket using the new auto-close function
		const reason = 'Ticket automatically closed due to inactivity'
		await autoCloseTicket(client, thread, reason)
	} catch (error) {
		StatusLogger.error(`Error auto-closing ticket ${ticket.ticket_id}:`, error)
	}
}

/**
 * Send an inactivity reminder to the ticket opener
 */
async function sendInactivityReminder(
	client: Discord.Client,
	thread: Discord.ThreadChannel,
	ticket: ThreadMetadata,
	inactivityThreshold: number
) {
	try {
		if (!ticket.opened_by?.id) {
			StatusLogger.warn(
				`Cannot send reminder: ticket ${ticket.ticket_id} has no opener info`
			)
			return
		}

		// Get the last message to calculate exact auto-close time
		const messages = await thread.messages.fetch({ limit: 50 }) // Fetch more messages to find non-bot message
		if (messages.size === 0) return

		// Find the last message that was NOT sent by a bot
		const lastUserMessage = messages.find((message) => !message.author.bot)

		let lastActivityTimestamp: number

		if (!lastUserMessage) {
			// No user messages found - use ticket creation time as fallback
			// StatusLogger.info(
			// 	`No user messages found for reminder in ticket ${ticket.ticket_id}, using creation time`
			// )
			lastActivityTimestamp =
				(ticket.open_time || Math.floor(Date.now() / 1000)) * 1000
		} else {
			lastActivityTimestamp = lastUserMessage.createdTimestamp
		}

		// Calculate exact timestamp when ticket will be auto-closed
		const autoCloseTimestamp = Math.floor(
			(lastActivityTimestamp + inactivityThreshold) / 1000
		)

		// Try to get the ticket configuration for reminder components
		try {
			const config = await api.getPluginConfig(
				client.user?.id ?? '',
				thread.guild.id,
				'tickets'
			)

			// Check if custom reminder component is configured
			if (config.components?.auto_close_warning) {
				const placeholders = {
					user: `<@${ticket.opened_by.id}>`,
					ticket_id: ticket.ticket_id?.toString() ?? 'unknown',
					thread_id: thread.id,
					threshold: `<t:${autoCloseTimestamp}:R>`, // Relative time (e.g., "in 2 hours")
					close_time: `<t:${autoCloseTimestamp}:F>`, // Full date and time
					guild_name: thread.guild.name,
				}

				// Build components using ticket opener's member instead of bot member
				let member: Discord.GuildMember
				try {
					// Try to get the ticket opener's member
					member = await thread.guild.members.fetch(ticket.opened_by.id)
				} catch (error) {
					// If we can't fetch the opener, use bot member as fallback
					StatusLogger.warn(
						`Could not fetch ticket opener member for inactivity reminder, using bot member: ${error}`
					)
					member = await thread.guild.members.fetchMe()
				}

				const { buildUniversalComponents } = await import(
					'@/discord/components/index.js'
				)

				const { v2Components, actionRows } = buildUniversalComponents(
					config.components.auto_close_warning,
					member,
					thread.guild,
					placeholders
				)

				// Send the configured reminder
				if (v2Components.length > 0) {
					// Cannot use content field with MessageFlags.IsComponentsV2
					await thread.send({
						components: v2Components,
						flags: Discord.MessageFlags.IsComponentsV2,
					})
				} else if (actionRows.length > 0) {
					await thread.send({
						content: `<@${ticket.opened_by.id}>`,
						components: actionRows,
					})
				} else {
					// Fallback if no components were generated
					throw new Error('No components generated from configuration')
				}
			} else {
				// Fallback to simple text reminder
				throw new Error('No auto_close_warning configuration found')
			}
		} catch (configError) {
			// Fallback to simple text reminder if configuration fails
			StatusLogger.warn(
				`Using fallback reminder for ticket ${ticket.ticket_id}: ${configError instanceof Error ? configError.message : String(configError)}`
			)
		}

		// Mark reminder as sent and update metadata
		ticket.reminder_sent = true
		ticketStore.set(thread.id, ticket)

		// Also update in database
		if (client.user) {
			try {
				await api.updateTicketMetadata(
					client.user.id,
					thread.guild.id,
					thread.id,
					ticket as ThreadMetadata
				)
			} catch (dbError) {
				StatusLogger.error(
					`Failed to update reminder status in database for ticket ${ticket.ticket_id}:`,
					dbError
				)
			}
		}

		// StatusLogger.info(
		// 	`Sent inactivity reminder for ticket ${ticket.ticket_id} in ${thread.guild.name}`
		// )
	} catch (error) {
		StatusLogger.error(
			`Error sending inactivity reminder for ticket ${ticket.ticket_id}:`,
			error
		)
	}
}
