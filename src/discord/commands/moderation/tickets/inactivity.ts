import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import { threadMetadataStore } from './state.js'
import * as api from '@/discord/api/index.js'
import { loadCfg } from './limits.js'
import type { ThreadMetadata } from '@/types/tickets.js'

export async function checkTicketInactivity(
	client: Discord.Client,
	guildId: string,
	threadId: string,
	metadata: ThreadMetadata
) {
	try {
		// Get the guild
		const guild = await client.guilds.fetch(guildId)
		if (!guild) {
			bunnyLog.warn(`Guild ${guildId} not found for ticket inactivity check`)
			return
		}

		// Get the thread
		const thread = (await guild.channels.fetch(
			threadId
		)) as Discord.ThreadChannel
		if (!thread?.isThread()) {
			bunnyLog.warn(`Thread ${threadId} not found or is not a thread`)
			return
		}

		// Load ticket configuration
		const cfg = await loadCfg({
			guildId: guild.id,
			client,
		} as Discord.ChatInputCommandInteraction)
		if (!cfg.enabled || !cfg.auto_close?.[0]?.enabled) {
			return
		}

		// Get last message timestamp
		const messages = await thread.messages.fetch({ limit: 1 })
		const lastMessage = messages.first()
		if (!lastMessage) {
			return
		}

		const now = Date.now()
		const lastActivity = lastMessage.createdTimestamp
		const inactivityThreshold = cfg.auto_close[0].threshold

		if (now - lastActivity > inactivityThreshold) {
			// Close the ticket due to inactivity
			metadata.status = 'closed'
			metadata.close_time = new Date()
			metadata.close_reason = 'Closed due to inactivity'

			// Update metadata in memory and database
			threadMetadataStore.set(threadId, metadata)
			if (client.user) {
				await api.updateTicketMetadata(
					client.user.id,
					guildId,
					threadId,
					metadata
				)
			} else {
				bunnyLog.error('Client user is null when updating ticket metadata')
				return
			}

			// Archive and lock the thread
			await thread.setArchived(true)
			await thread.setLocked(true)

			// Send closure notification
			const thresholdHours = Math.floor(inactivityThreshold / (60 * 60 * 1000))
			await thread.send({
				content: `This ticket has been automatically closed due to ${thresholdHours} hours of inactivity.`,
				flags: Discord.MessageFlags.SuppressEmbeds,
			})

			bunnyLog.info(`Closed ticket ${threadId} due to inactivity`)
		}
	} catch (error) {
		bunnyLog.error('Error checking ticket inactivity:', error)
	}
}

/**
 * Check all active tickets for inactivity
 */
export async function checkAllTicketsInactivity(client: Discord.Client) {
	try {
		// Get all guilds the bot is in
		const guilds = await client.guilds.fetch()

		for (const [guildId, guild] of guilds) {
			try {
				// Get all active tickets for this guild
				if (client.user) {
					const activeTickets = await api.getAllActiveTickets(
						client.user.id,
						guildId
					)

					// Check each ticket for inactivity
					for (const ticket of activeTickets) {
						await checkTicketInactivity(
							client,
							guildId,
							ticket.thread_id,
							ticket.metadata
						)
					}
				}
			} catch (error) {
				bunnyLog.error(`Error checking tickets for guild ${guildId}:`, error)
			}
		}
	} catch (error) {
		bunnyLog.error('Error in checkAllTicketsInactivity:', error)
	}
}

// Start periodic inactivity checks
export function startInactivityChecker(client: Discord.Client) {
	// Check every hour
	setInterval(
		() => {
			checkAllTicketsInactivity(client).catch((error) => {
				bunnyLog.error('Error in inactivity checker interval:', error)
			})
		},
		60 * 60 * 1000
	) // 1 hour in milliseconds

	// Also check once at startup
	checkAllTicketsInactivity(client).catch((error) => {
		bunnyLog.error('Error in initial inactivity check:', error)
	})
}
