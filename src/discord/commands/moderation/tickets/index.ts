export * from './config.js'
export * from './close.js'
export * from './open.js'
export * from './message.js'
export * from './state.js'
export * from './limits.js'
export * from '@/commands/constants.js'

// Add inactivity checker functionality
import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import { ticketStore } from './state.js'
import { loadCfg } from './limits.js'
import { perfromClose } from './close.js'
import type { ThreadMetadata } from '@/types/tickets.js'

const INACTIVITY_CHECK_INTERVAL = 60 * 1000 // Check every minute
const DEFAULT_INACTIVITY_THRESHOLD = 72 * 60 * 60 * 1000 // 72 hours

/**
 * Initialize the ticket inactivity checker
 */
export async function initTicketInactivityChecker(client: Discord.Client) {
	bunnyLog.info('Initializing ticket inactivity checker')

	// Run check immediately
	await checkTicketsForInactivity(client)

	// Set up periodic checks
	setInterval(async () => {
		try {
			await checkTicketsForInactivity(client)
		} catch (error) {
			bunnyLog.error('Error in ticket inactivity checker:', error)
		}
	}, INACTIVITY_CHECK_INTERVAL)
}

/**
 * Check all active tickets for inactivity
 */
async function checkTicketsForInactivity(client: Discord.Client) {
	try {
		const activeTickets = ticketStore
			.values()
			.filter((ticket) => ticket.status !== 'closed')

		for (const ticket of activeTickets) {
			try {
				// Get the guild for this ticket
				const guild = client.guilds.cache.get(ticket.guild_id)
				if (!guild) continue

				// Get plugin config to check if auto-close is enabled
				const config = await loadCfg({
					client,
					guild: { id: guild.id },
				} as Discord.ButtonInteraction)

				// Skip if auto-close is not enabled
				if (!config?.auto_close?.[0]?.enabled) continue

				const inactivityThreshold =
					config.auto_close[0].threshold || DEFAULT_INACTIVITY_THRESHOLD

				await checkInactiveTicket(client, guild, ticket, inactivityThreshold)
			} catch (error) {
				bunnyLog.error(
					`Error checking ticket ${ticket.ticket_id} for inactivity:`,
					error
				)
			}
		}
	} catch (error) {
		bunnyLog.error('Error in ticket inactivity checker:', error)
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
		// Fetch the thread
		const thread = (await guild.channels.fetch(
			ticket.thread_id
		)) as Discord.ThreadChannel
		if (!thread?.isThread()) return

		// Check if thread is already archived or locked
		if (thread.archived || thread.locked) {
			// Remove from memory if it's already closed
			ticketStore.delete(ticket.thread_id)
			return
		}

		// Check last message time
		const messages = await thread.messages.fetch({ limit: 1 })
		if (messages.size === 0) return

		const lastMessage = messages.first()
		if (!lastMessage) return

		const timeSinceLastMessage = Date.now() - lastMessage.createdTimestamp

		// If ticket is inactive, close it
		if (timeSinceLastMessage > inactivityThreshold) {
			await closeInactiveTicket(client, thread, ticket)
		}
	} catch (error) {
		bunnyLog.error(
			`Error checking ticket ${ticket.ticket_id} for inactivity:`,
			error
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
		bunnyLog.info(`Auto-closing inactive ticket: ${thread.name} (${thread.id})`)

		// Create a mock interaction for the close function
		const mockInteraction = {
			client,
			guild: thread.guild,
			user: client.user,
			channel: thread,
			member: null,
		} as unknown as Discord.ButtonInteraction

		// Close the ticket
		const reason = 'Ticket automatically closed due to inactivity'
		await perfromClose(mockInteraction, thread, reason)
	} catch (error) {
		bunnyLog.error(`Error auto-closing ticket ${ticket.ticket_id}:`, error)
	}
}
