import { loadCfg } from './limits.js'
import type { PlaceholderMap } from '@/discord/components/ui-builder.js'
import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/discord/api/index.js'
import * as limits from './limits.js'
import { threadMetadataStore as store } from './state.js'
import type { ThreadMetadata } from '@/types/tickets.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'
import { bunnyLog } from 'bunny-log'
import { buildUniversalComponents } from '@/discord/components/index.js'
import {
	replacePlaceholders,
	replacecustom_idPlaceholders,
} from '@/utils/replacePlaceholders.js'
import type { ButtonBuilder } from 'discord.js'

// Add these types at the top of the file after imports
type TicketInteraction =
	| Discord.ButtonInteraction
	| Discord.StringSelectMenuInteraction

// Update the function signatures that need both types
type TicketResponse = (
	inter: TicketInteraction,
	error: string,
	message: string,
	options: { code: string }
) => Promise<void>

/* -------------------------------------------------------------------------- */
/*                               PUBLIC ENTRY                                 */
/* -------------------------------------------------------------------------- */

// Helper function to get the effective custom ID
function getEffectiveCustomId(inter: TicketInteraction): string {
	if ('values' in inter && inter.values.length > 0) {
		return inter.values[0]
	}
	return inter.customId
}

export async function openTicket(inter: Discord.ButtonInteraction) {
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'OT001' }
		)
		return
	}

	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		const cfg = await loadCfg(inter)
		if (!cfg.enabled) {
			await utils.handleResponse(
				inter,
				'error',
				'Tickets are not enabled on this server',
				{ code: 'OT002' }
			)
			return
		}

		/* ------------------------------------------------------ */
		/*                  ROLE‑BASED COOL‑DOWN                  */
		/* ------------------------------------------------------ */
		const member = inter.member as Discord.GuildMember

		// Check role time limits if configured
		if (cfg.role_time_limits?.length > 0) {
			const cooldownResult = await checkRoleTimeLimits(member, cfg, inter)
			if (!cooldownResult.allowed) {
				await utils.handleResponse(
					inter,
					'warning',
					`You need to wait ${cooldownResult.limit} between tickets. You can open a new ticket <t:${Math.floor(cooldownResult.retryAt / 1000)}:R>`,
					{ code: 'OT003' }
				)
				return
			}
		}

		/* ------------------------------------------------------ */
		/*                  RESOLVE TICKET CATEGORY               */
		/* ------------------------------------------------------ */
		const category = resolveCategory(inter.customId, cfg)
		bunnyLog.info(
			`Resolved ticket category: ${category} from custom_id: ${inter.customId}`
		)

		/* ------------------------------------------------------ */
		/*                OBTAIN NEXT TICKET NUMBER               */
		/* ------------------------------------------------------ */
		const ticket_id = await api.getTicketCounter(
			inter.client.user.id,
			inter.guild.id
		)
		if (!ticket_id) {
			await utils.handleResponse(
				inter,
				'error',
				'Failed to get ticket counter',
				{ code: 'OT004' }
			)
			return
		}

		/* ------------------------------------------------------ */
		/*                CREATE THE PRIVATE THREAD               */
		/* ------------------------------------------------------ */
		const parent = inter.channel as Discord.TextChannel
		const thread = await parent.threads.create({
			name: `Ticket #${ticket_id}`,
			autoArchiveDuration: Discord.ThreadAutoArchiveDuration.ThreeDays,
			type: Discord.ChannelType.PrivateThread,
			reason: `Ticket #${ticket_id} - ${category}`,
		})

		await thread.members.add(inter.user.id)

		/* ------------------------------------------------------ */
		/*                     SAVE METADATA                      */
		/* ------------------------------------------------------ */
		const author = toAuthor(inter)
		const meta: ThreadMetadata = {
			ticket_id,
			thread_id: thread.id,
			opened_by: author,
			open_time: Math.floor(Date.now() / 1_000),
			ticket_type: category,
			guild_id: inter.guild.id,
			status: 'open',
		}

		// Store in memory
		store.set(thread.id, meta)

		// Save to database
		await api.saveTicketMetadata(
			inter.client.user.id,
			inter.guild.id,
			thread.id,
			meta,
			[]
		)

		// Increment counter
		await api.incrementTicketCounter(inter.client.user.id, inter.guild.id)

		/* ------------------------------------------------------ */
		/*                 SEND TEMPLATE MESSAGES                 */
		/* ------------------------------------------------------ */
		const placeholders: PlaceholderMap = {
			ticket_id: ticket_id.toString(),
			ticket_type: category,
			category: category,
			opened_by: inter.user.toString(),
			thread_id: thread.id,
			channel_id: `<#${thread.id}>`,
			claimed_by: 'Not claimed',
			open_time: Math.floor(Date.now() / 1000).toString(),
		}

		// Send welcome message to thread
		if (cfg.components?.opened_ticket) {
			try {
				// Convert placeholders to string format
				const additionalPlaceholders = {
					ticket_id: ticket_id.toString(),
					category,
					thread_id: thread.id,
					channel_id: `<#${thread.id}>`,
					open_time: Math.floor(Date.now() / 1000).toString(),
				}

				const { v2Components, actionRows } = buildUniversalComponents(
					cfg.components.opened_ticket,
					member,
					inter.guild,
					additionalPlaceholders
				)

				// Process components to replace placeholders in custom_ids
				for (const row of actionRows) {
					for (const component of row.components) {
						if (
							'data' in component &&
							component.data &&
							typeof component.data === 'object'
						) {
							const button = component as ButtonBuilder
							const data = component.data as { custom_id?: string }
							if (data.custom_id) {
								// Remove any action_ prefix if it exists
								const cleancustom_id = data.custom_id.startsWith('action_')
									? data.custom_id.replace('action_', '')
									: data.custom_id
								button.setCustomId(
									replacecustom_idPlaceholders(
										cleancustom_id,
										additionalPlaceholders
									)
								)
							}
						}
					}
				}

				// Convert text displays to content
				const contentParts: string[] = []
				for (const comp of v2Components) {
					if ('content' in comp) {
						contentParts.push(
							replacePlaceholders(
								comp.content,
								member,
								inter.guild,
								additionalPlaceholders
							)
						)
					}
				}

				// Prepare message options
				const messageOptions: Discord.MessageCreateOptions = {
					content:
						contentParts.length > 0 ? contentParts.join('\n') : undefined,
				}

				// Add components if we have any
				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags = Discord.MessageFlags.IsComponentsV2
				}

				// Add action rows if we have any
				if (actionRows.length > 0) {
					if (messageOptions.components) {
						messageOptions.components = [
							...messageOptions.components,
							...actionRows,
						]
					} else {
						messageOptions.components = actionRows
					}
				}

				// Send the message
				const sentMessage = await thread.send(messageOptions)

				// Update metadata with message info
				if (sentMessage) {
					meta.join_ticket_message_id = sentMessage.id
					meta.admin_channel_id = cfg.admin_channel_id

					// Update in memory and database
					store.set(thread.id, meta)
					await api.updateTicketMetadata(
						inter.client.user.id,
						inter.guild.id,
						thread.id,
						meta
					)
				}
			} catch (error) {
				bunnyLog.error(
					'Error sending thread message with universal components:',
					error
				)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to send welcome message to ticket',
					{ code: 'OT005' }
				)
			}
		}

		// Send confirmation to user
		if (cfg.components?.user_ticket) {
			try {
				// Convert placeholders to string format
				const additionalPlaceholders = {
					ticket_id: ticket_id.toString(),
					category,
					thread_id: thread.id,
					channel_id: `<#${thread.id}>`,
					open_time: Math.floor(Date.now() / 1000).toString(),
				}

				const { v2Components, actionRows } = buildUniversalComponents(
					cfg.components.user_ticket,
					member,
					inter.guild,
					additionalPlaceholders
				)

				// Process components to replace placeholders in custom_ids
				for (const row of actionRows) {
					for (const component of row.components) {
						if (
							'data' in component &&
							component.data &&
							typeof component.data === 'object'
						) {
							const button = component as ButtonBuilder
							const data = component.data as { custom_id?: string }
							if (data.custom_id) {
								// Remove any action_ prefix if it exists
								const cleancustom_id = data.custom_id.startsWith('action_')
									? data.custom_id.replace('action_', '')
									: data.custom_id
								button.setCustomId(
									replacecustom_idPlaceholders(
										cleancustom_id,
										additionalPlaceholders
									)
								)
							}
						}
					}
				}

				// Convert text displays to content
				const contentParts: string[] = []
				for (const comp of v2Components) {
					if ('content' in comp) {
						contentParts.push(
							replacePlaceholders(
								comp.content,
								member,
								inter.guild,
								additionalPlaceholders
							)
						)
					}
				}

				// Prepare message options
				const messageOptions: Discord.InteractionEditReplyOptions = {
					content:
						contentParts.length > 0 ? contentParts.join('\n') : undefined,
					flags: Discord.MessageFlags.SuppressEmbeds,
				}

				// Add components if we have any
				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags =
						Discord.MessageFlags.SuppressEmbeds |
						Discord.MessageFlags.IsComponentsV2
				}

				// Add action rows if we have any
				if (actionRows.length > 0) {
					if (messageOptions.components) {
						messageOptions.components = [
							...messageOptions.components,
							...actionRows,
						]
					} else {
						messageOptions.components = actionRows
					}
				}

				// Send the message
				await inter.editReply(messageOptions)

				// Send admin notification
				await sendAdminNotification(inter, cfg, thread, meta, placeholders)
			} catch (error) {
				bunnyLog.error(
					'Error sending user confirmation with universal components:',
					error
				)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to send user confirmation',
					{ code: 'OT006' }
				)
			}
		}
	} catch (error) {
		bunnyLog.error('Failed to create ticket:', error)
		await utils.handleResponse(
			inter,
			'error',
			'Failed to create ticket. Please try again.',
			{
				code: 'OT005',
				error: error as Error,
			}
		)
	}
}

export async function openTicketFromSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'OT001' }
		)
		return
	}

	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		const cfg = await loadCfg(inter)
		if (!cfg.enabled) {
			await utils.handleResponse(
				inter,
				'error',
				'Tickets are not enabled on this server',
				{ code: 'OT002' }
			)
			return
		}

		const member = inter.member as Discord.GuildMember

		// Check role time limits if configured
		if (cfg.role_time_limits?.length > 0) {
			const cooldownResult = await checkRoleTimeLimits(
				member,
				cfg,
				inter as unknown as Discord.ButtonInteraction
			)
			if (!cooldownResult.allowed) {
				await utils.handleResponse(
					inter,
					'warning',
					`You need to wait ${cooldownResult.limit} between tickets. You can open a new ticket <t:${Math.floor(cooldownResult.retryAt / 1000)}:R>`,
					{ code: 'OT003' }
				)
				return
			}
		}

		const category = resolveCategory(inter.values[0], cfg)
		const ticket_id = await api.getTicketCounter(
			inter.client.user.id,
			inter.guild.id
		)

		if (!ticket_id) {
			await utils.handleResponse(
				inter,
				'error',
				'Failed to get ticket counter',
				{ code: 'OT004' }
			)
			return
		}

		const parent = inter.channel as Discord.TextChannel
		const thread = await parent.threads.create({
			name: `Ticket #${ticket_id}`,
			autoArchiveDuration: Discord.ThreadAutoArchiveDuration.ThreeDays,
			type: Discord.ChannelType.PrivateThread,
			reason: `Ticket #${ticket_id} - ${category}`,
		})

		await thread.members.add(inter.user.id)

		const meta: ThreadMetadata = {
			ticket_id,
			thread_id: thread.id,
			opened_by: {
				id: inter.user.id,
				username: inter.user.username,
				displayName: member.displayName,
				avatar: inter.user.displayAvatarURL(),
			},
			open_time: Math.floor(Date.now() / 1_000),
			ticket_type: category,
			guild_id: inter.guild.id,
			status: 'open',
		}

		store.set(thread.id, meta)
		await api.saveTicketMetadata(
			inter.client.user.id,
			inter.guild.id,
			thread.id,
			meta,
			[]
		)
		await api.incrementTicketCounter(inter.client.user.id, inter.guild.id)

		const placeholders: PlaceholderMap = {
			ticket_id: ticket_id.toString(),
			ticket_type: category,
			category: category,
			opened_by: inter.user.toString(),
			thread_id: thread.id,
			channel_id: `<#${thread.id}>`,
			claimed_by: 'Not claimed',
			open_time: Math.floor(Date.now() / 1000).toString(),
		}

		if (cfg.components?.opened_ticket) {
			try {
				const additionalPlaceholders = {
					ticket_id: ticket_id.toString(),
					category,
					thread_id: thread.id,
					channel_id: `<#${thread.id}>`,
					open_time: Math.floor(Date.now() / 1000).toString(),
				}

				const { v2Components, actionRows } = buildUniversalComponents(
					cfg.components.opened_ticket,
					member,
					inter.guild,
					additionalPlaceholders
				)

				const messageOptions: Discord.MessageCreateOptions = {
					content: '',
					components: [],
				}

				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags = Discord.MessageFlags.IsComponentsV2
				}

				if (actionRows.length > 0) {
					messageOptions.components =
						messageOptions.components.concat(actionRows)
				}

				const sentMessage = await thread.send(messageOptions)

				if (sentMessage) {
					meta.join_ticket_message_id = sentMessage.id
					meta.admin_channel_id = cfg.admin_channel_id
					store.set(thread.id, meta)
					await api.updateTicketMetadata(
						inter.client.user.id,
						inter.guild.id,
						thread.id,
						meta
					)
				}
			} catch (error) {
				bunnyLog.error('Error sending thread message:', error)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to send welcome message to ticket',
					{ code: 'OT005' }
				)
			}
		}

		if (cfg.components?.user_ticket) {
			try {
				const additionalPlaceholders = {
					ticket_id: ticket_id.toString(),
					category,
					thread_id: thread.id,
					channel_id: `<#${thread.id}>`,
					open_time: Math.floor(Date.now() / 1000).toString(),
				}

				const { v2Components, actionRows } = buildUniversalComponents(
					cfg.components.user_ticket,
					member,
					inter.guild,
					additionalPlaceholders
				)

				const messageOptions: Discord.InteractionEditReplyOptions = {
					content: '',
					components: [],
					flags: Discord.MessageFlags.SuppressEmbeds,
				}

				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags =
						Discord.MessageFlags.SuppressEmbeds |
						Discord.MessageFlags.IsComponentsV2
				}

				if (actionRows.length > 0) {
					messageOptions.components =
						messageOptions.components.concat(actionRows)
				}

				await inter.editReply(messageOptions)
				await sendAdminNotification(
					inter as unknown as Discord.ButtonInteraction,
					cfg,
					thread,
					meta,
					placeholders
				)
			} catch (error) {
				bunnyLog.error('Error sending user confirmation:', error)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to send user confirmation',
					{ code: 'OT006' }
				)
			}
		}
	} catch (error) {
		bunnyLog.error('Failed to create ticket:', error)
		await utils.handleResponse(
			inter,
			'error',
			'Failed to create ticket. Please try again.',
			{
				code: 'OT005',
				error: error as Error,
			}
		)
	}
}

/**
 * Claim a ticket - allows a moderator to assign themselves to a ticket
 */
export async function claimTicket(inter: Discord.ButtonInteraction) {
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'CT001' }
		)
		return
	}

	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		const cfg = await loadCfg(inter)
		if (!cfg.enabled) {
			await utils.handleResponse(
				inter,
				'error',
				'Tickets are not enabled on this server',
				{ code: 'CT002' }
			)
			return
		}

		// Check if user has permission to claim tickets (moderator role or admin)
		const member = inter.member as Discord.GuildMember
		const hasModRole = cfg.mods_role_ids?.some((roleId) =>
			member.roles.cache.has(roleId)
		)
		const hasAdminPerms = member.permissions.has(
			Discord.PermissionFlagsBits.Administrator
		)

		if (!hasModRole && !hasAdminPerms) {
			await utils.handleResponse(
				inter,
				'error',
				"You don't have permission to claim tickets",
				{ code: 'CT003' }
			)
			return
		}

		// Parse the thread ID from the custom ID (format: claim_ticket:threadId)
		const [, threadId] = inter.customId.split(':')
		if (!threadId) {
			await utils.handleResponse(inter, 'error', 'Invalid ticket reference', {
				code: 'CT004',
			})
			return
		}

		// Get the ticket metadata
		const ticketData = store.get(threadId)
		if (!ticketData) {
			await utils.handleResponse(
				inter,
				'error',
				'Could not find the associated ticket',
				{ code: 'CT005' }
			)
			return
		}

		// Check if ticket is already claimed
		if (ticketData.claimed_by) {
			const claimedById =
				typeof ticketData.claimed_by === 'string'
					? ticketData.claimed_by
					: ticketData.claimed_by.id
			await utils.handleResponse(
				inter,
				'error',
				`This ticket is already claimed by <@${claimedById}>`,
				{ code: 'CT006' }
			)
			return
		}

		// Get the ticket thread
		const thread = await inter.guild.channels.fetch(threadId)
		if (!thread?.isThread()) {
			await utils.handleResponse(
				inter,
				'error',
				'Could not find the ticket thread',
				{ code: 'CT007' }
			)
			return
		}

		// Update ticket metadata
		ticketData.claimed_by = {
			id: inter.user.id,
			username: inter.user.username,
			displayName: member.displayName,
			avatar: inter.user.displayAvatarURL(),
		}
		ticketData.claimed_time = new Date()

		// Update in memory and database
		store.set(threadId, ticketData)
		await api.updateTicketMetadata(
			inter.client.user.id,
			inter.guild.id,
			threadId,
			ticketData
		)

		// Update the admin message
		if (cfg.components?.admin_ticket) {
			try {
				const placeholders = {
					ticket_id: String(ticketData.ticket_id),
					category: String(ticketData.ticket_type || 'General Support'),
					thread_id: String(threadId),
					channel_id: `<#${threadId}>`,
					opened_by: `<@${ticketData.opened_by.id}>`,
					claimed_by: `<@${inter.user.id}>`,
					open_time: `<t:${Math.floor(Number(ticketData.open_time))}:R>`,
					claimed_time: `<t:${Math.floor(ticketData.claimed_time.getTime() / 1000)}:R>`,
					mod_ping: '', // Don't ping mods for claimed tickets
					display_name: inter.user.displayName || inter.user.username,
					guild_id: inter.guild.id,
				}

				const { v2Components, actionRows } = buildUniversalComponents(
					cfg.components.admin_ticket,
					member,
					inter.guild,
					placeholders
				)

				const messageOptions: Discord.MessageEditOptions = {
					content: '',
					components: [],
					flags: Discord.MessageFlags.SuppressEmbeds,
				}

				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags =
						Discord.MessageFlags.SuppressEmbeds |
						Discord.MessageFlags.IsComponentsV2
				}

				if (actionRows.length > 0) {
					messageOptions.components =
						messageOptions.components.concat(actionRows)
				}

				await inter.message.edit(messageOptions)
			} catch (error) {
				bunnyLog.error('Error updating admin message:', error)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to update admin message',
					{ code: 'CT010', error: error as Error }
				)
			}
		}

		// Send confirmation to the claimer
		await utils.handleResponse(
			inter,
			'success',
			`You have successfully claimed ticket #${ticketData.ticket_id}`,
			{ code: 'CT008', ephemeral: true }
		)

		// Send notification to the ticket thread if configured
		if (cfg.components?.ticket_claimed) {
			try {
				const placeholders = {
					ticket_id: ticketData.ticket_id.toString(),
					category: ticketData.ticket_type,
					thread_id: threadId,
					channel_id: `<#${threadId}>`,
					opened_by: `<@${ticketData.opened_by.id}>`,
					claimed_by: `<@${inter.user.id}>`,
					open_time: Math.floor(ticketData.open_time).toString(),
					claimed_time: Math.floor(
						ticketData.claimed_time.getTime() / 1000
					).toString(),
				}

				const { v2Components, actionRows } = buildUniversalComponents(
					cfg.components.ticket_claimed,
					member,
					inter.guild,
					placeholders
				)

				const messageOptions: Discord.MessageCreateOptions = {
					content: '',
					components: [],
				}

				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags = Discord.MessageFlags.IsComponentsV2
				}

				if (actionRows.length > 0) {
					messageOptions.components =
						messageOptions.components.concat(actionRows)
				}

				await thread.send(messageOptions)
			} catch (error) {
				bunnyLog.error('Error sending ticket claimed message:', error)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to send ticket claimed message',
					{ code: 'CT009' }
				)
			}
		}
	} catch (error) {
		bunnyLog.error('Failed to claim ticket:', error)
		await utils.handleResponse(
			inter,
			'error',
			'Failed to claim ticket. Please try again.',
			{
				code: 'CT011',
				error: error as Error,
			}
		)
	}
}

/**
 * Join a ticket - allows a moderator to join an existing ticket thread
 */
export async function joinTicket(inter: Discord.ButtonInteraction) {
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'JT001' }
		)
		return
	}

	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		const cfg = await loadCfg(inter)
		if (!cfg.enabled) {
			await utils.handleResponse(
				inter,
				'error',
				'Tickets are not enabled on this server',
				{ code: 'JT002' }
			)
			return
		}

		// Check if user has permission to join tickets (moderator role or admin)
		const member = inter.member as Discord.GuildMember
		const hasModRole = cfg.mods_role_ids?.some((roleId) =>
			member.roles.cache.has(roleId)
		)
		const hasAdminPerms = member.permissions.has(
			Discord.PermissionFlagsBits.Administrator
		)

		if (!hasModRole && !hasAdminPerms) {
			await utils.handleResponse(
				inter,
				'error',
				"You don't have permission to join tickets",
				{ code: 'JT003' }
			)
			return
		}

		// Find the ticket from the admin message
		const adminMessage = inter.message
		const ticketResult = await findTicketByAdminMessageId(
			adminMessage.id,
			inter.client.user.id,
			inter.guild.id
		)

		if (!ticketResult) {
			await utils.handleResponse(
				inter,
				'error',
				'Could not find the associated ticket',
				{ code: 'JT004' }
			)
			return
		}

		const { ticketData, threadId } = ticketResult

		// Get the ticket thread
		const thread = await inter.guild.channels.fetch(ticketData.thread_id)
		if (!thread?.isThread()) {
			await utils.handleResponse(
				inter,
				'error',
				'Could not find the ticket thread',
				{ code: 'JT005' }
			)
			return
		}

		// Add the user to the thread
		try {
			await thread.members.add(inter.user.id)

			await utils.handleResponse(
				inter,
				'success',
				`You have joined ticket #${ticketData.ticket_id}: <#${thread.id}>`,
				{ code: 'JT006' }
			)

			// Send notification to the ticket thread
			await thread.send({
				content: `👋 <@${inter.user.id}> has joined the ticket to assist.`,
			})
		} catch (error) {
			bunnyLog.error('Error adding user to ticket thread:', error)
			await utils.handleResponse(
				inter,
				'error',
				'Failed to join ticket. You may already be a member or the thread is archived.',
				{
					code: 'JT007',
					error: error as Error,
				}
			)
		}
	} catch (error) {
		bunnyLog.error('Failed to join ticket:', error)
		await utils.handleResponse(
			inter,
			'error',
			'Failed to join ticket. Please try again.',
			{
				code: 'JT008',
				error: error as Error,
			}
		)
	}
}

/**
 * Handle select menu interactions for ticket actions
 */
export async function handleTicketActionSelect(
	inter: Discord.StringSelectMenuInteraction | Discord.ButtonInteraction
) {
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'TAS001' }
		)
		return
	}

	// Get the base action from the custom ID
	const [baseAction] = inter.customId.split(':')

	// Route to appropriate handler based on the action
	switch (baseAction) {
		case 'claim_ticket':
			if (inter.isButton()) {
				await claimTicket(inter)
			} else {
				bunnyLog.warn('Invalid interaction type for claim_ticket')
				await utils.handleResponse(inter, 'error', 'Invalid interaction type', {
					code: 'TAS003',
				})
			}
			break
		case 'join_ticket':
			if (inter.isButton()) {
				await joinTicket(inter)
			} else {
				bunnyLog.warn('Invalid interaction type for join_ticket')
				await utils.handleResponse(inter, 'error', 'Invalid interaction type', {
					code: 'TAS004',
				})
			}
			break
		case 'open_ticket':
			if (inter.isStringSelectMenu()) {
				await openTicketFromSelect(inter)
			} else if (inter.isButton()) {
				await openTicket(inter)
			} else {
				bunnyLog.warn('Invalid interaction type for open_ticket')
				await utils.handleResponse(inter, 'error', 'Invalid interaction type', {
					code: 'TAS005',
				})
			}
			break
		default:
			bunnyLog.warn(`Unknown action selected: ${baseAction}`)
			await utils.handleResponse(inter, 'error', 'Unknown action selected', {
				code: 'TAS002',
			})
	}
}

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

/**
 * Find ticket data by admin message ID, checking cache first, then database
 */
async function findTicketByAdminMessageId(
	adminMessageId: string,
	botId: string,
	guildId: string
): Promise<{ ticketData: ThreadMetadata; threadId: string } | null> {
	// First check in memory cache
	for (const [threadId, metadata] of store.entries()) {
		if (metadata.join_ticket_message_id === adminMessageId) {
			return { ticketData: metadata, threadId }
		}
	}

	// If not found in cache, check database
	try {
		const allTickets = await api.getAllActiveTickets(botId, guildId)
		for (const ticket of allTickets) {
			if (ticket.metadata.join_ticket_message_id === adminMessageId) {
				// Update cache with found ticket
				store.set(ticket.thread_id, ticket.metadata)
				return { ticketData: ticket.metadata, threadId: ticket.thread_id }
			}
		}
	} catch (error) {
		bunnyLog.error('Failed to search for ticket:', error)
	}

	return null
}

/**
 * Check role-based time limits for ticket creation
 */
async function checkRoleTimeLimits(
	member: Discord.GuildMember,
	cfg: PluginResponse<DefaultConfigs['tickets']>,
	inter: Discord.ButtonInteraction
): Promise<{ allowed: boolean; retryAt?: number; limit?: string }> {
	// Get user's tickets and find the latest one
	const userTickets = await api.getUserTickets(
		inter.client.user.id,
		inter.guild.id,
		inter.user.id
	)

	// Find the latest ticket open time
	const lastOpen = userTickets?.length
		? Math.max(...userTickets.map((t) => t.open_time || 0))
		: null

	const cdResult = await limits.canUserOpenTicket(member, cfg, lastOpen)

	return {
		allowed: cdResult.allowed,
		retryAt: cdResult.retryAt,
		limit: cdResult.limit,
	}
}

/**
 * Resolve ticket category from button custom_id
 */
function resolveCategory(
	customId: Discord.ButtonInteraction['customId'],
	cfg: PluginResponse<DefaultConfigs['tickets']>
): string {
	// Check if there's an open_ticket component template
	const openTicketTemplate = cfg.components?.open_ticket
	if (!openTicketTemplate?.components) {
		bunnyLog.warn('No open_ticket components found in config')
		return 'General Support'
	}

	// Look for buttons in the components array
	for (const component of openTicketTemplate.components) {
		if (component.type === 1 && 'components' in component) {
			// Find the button with matching custom_id and return its label
			const button = component.components.find(
				(btn) =>
					btn.type === 2 && 'custom_id' in btn && btn.custom_id === customId
			)

			if (button && 'label' in button && button.label) {
				bunnyLog.info(`Found matching button with label: ${button.label}`)
				return String(button.label)
			}

			if (button) {
				bunnyLog.warn(`Found button but no label for custom_id: ${customId}`)
			}
		}
	}

	bunnyLog.warn(`No matching button found for custom_id: ${customId}`)
	return 'General Support'
}

/**
 * Convert interaction user to author object
 */
function toAuthor(i: Discord.ButtonInteraction) {
	return {
		id: i.user.id,
		username: i.user.username,
		displayName:
			'displayName' in i.member
				? (i.member as Discord.GuildMember).displayName
				: i.user.username,
		avatar: i.user.displayAvatarURL({
			extension: i.user.avatar?.startsWith('a_') ? 'gif' : 'png',
		}),
	}
}

/**
 * Send notification to admin channel if configured
 */
async function sendAdminNotification(
	inter: Discord.ButtonInteraction,
	cfg: PluginResponse<DefaultConfigs['tickets']>,
	thread: Discord.ThreadChannel,
	meta: ThreadMetadata,
	placeholders: PlaceholderMap
) {
	if (!cfg.admin_channel_id) {
		return
	}

	try {
		// Fetch the admin channel
		const adminChannel = await inter.guild.channels.fetch(cfg.admin_channel_id)

		if (!adminChannel?.isTextBased()) {
			throw new Error('Admin channel is not a text channel')
		}

		const member = inter.member as Discord.GuildMember

		// Create admin notification using universal component builder
		if (!cfg.components?.admin_ticket) {
			throw new Error('Admin ticket template not configured')
		}

		// Convert placeholders to string format
		const stringPlaceholders: Record<string, string> = {}
		for (const [key, value] of Object.entries(placeholders)) {
			stringPlaceholders[key] = String(value)
		}

		// Add role pings to placeholders if configured
		if (cfg.mods_role_ids?.length > 0) {
			const pings = cfg.mods_role_ids.map((id) => `<@&${id}>`).join(' ')
			stringPlaceholders.mod_ping = pings
		} else {
			stringPlaceholders.mod_ping = ''
		}

		const { v2Components, actionRows } = buildUniversalComponents(
			cfg.components.admin_ticket,
			member,
			inter.guild,
			stringPlaceholders
		)

		// Process components to replace placeholders in custom_ids
		for (const row of actionRows) {
			for (const component of row.components) {
				if (
					'data' in component &&
					component.data &&
					typeof component.data === 'object'
				) {
					const button = component as ButtonBuilder
					const data = component.data as { custom_id?: string }
					if (data.custom_id) {
						// Remove any action_ prefix if it exists
						const cleancustom_id = data.custom_id.startsWith('action_')
							? data.custom_id.replace('action_', '')
							: data.custom_id
						button.setCustomId(
							replacecustom_idPlaceholders(cleancustom_id, stringPlaceholders)
						)
					}
				}
			}
		}

		// Send all components in one message
		const messageOptions: Discord.MessageCreateOptions = {}

		if (v2Components.length > 0) {
			messageOptions.components = v2Components
			messageOptions.flags = Discord.MessageFlags.IsComponentsV2
		}

		if (actionRows.length > 0) {
			// If we already have components, append the action rows
			if (messageOptions.components) {
				messageOptions.components = [
					...messageOptions.components,
					...actionRows,
				]
			} else {
				messageOptions.components = actionRows
			}
		}

		const adminMessage = await adminChannel.send(messageOptions)

		// Update metadata with admin message info
		if (adminMessage) {
			meta.join_ticket_message_id = adminMessage.id
			meta.admin_channel_id = cfg.admin_channel_id

			// Update in memory and database
			store.set(thread.id, meta)
			await api.updateTicketMetadata(
				inter.client.user.id,
				inter.guild.id,
				thread.id,
				meta
			)
		}
	} catch (error) {
		bunnyLog.error('Failed to send admin notification:', error)
		await utils.handleResponse(
			inter,
			'error',
			'Failed to send admin notification',
			{
				code: 'AN001',
				error: error as Error,
			}
		)
	}
}
