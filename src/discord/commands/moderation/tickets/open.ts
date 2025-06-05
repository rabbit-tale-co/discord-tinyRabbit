import { loadCfg } from './limits.js'
import type { PlaceholderMap } from '@/discord/components/ui-builder.js'
import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/discord/api/index.js'
import * as limits from './limits.js'
import { threadMetadataStore as store } from './state.js'
import type { ThreadMetadata } from '@/types/tickets.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'
import {
	StatusLogger,
	ServiceLogger,
	CommandLogger,
} from '@/utils/bunnyLogger.js'
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
		if (
			cfg.role_time_limits?.included?.length > 0 ||
			cfg.role_time_limits?.excluded?.length > 0
		) {
			const cooldownResult = await checkRoleTimeLimits(member, cfg, inter)
			if (!cooldownResult.allowed) {
				await utils.handleResponse(
					inter,
					'warning',
					`You need to wait ${cooldownResult.limit} between tickets. You can open a new ticket <t:${Math.floor(cooldownResult.retryAt / 1000)}:R>`,
					{ code: 'OT003', ephemeral: true }
				)
				return
			}
		}

		/* ------------------------------------------------------ */
		/*                  RESOLVE TICKET TOPIC               */
		/* ------------------------------------------------------ */
		const topic = resolveTopic(inter.customId, cfg)

		/* ------------------------------------------------------ */
		/*                OBTAIN NEXT TICKET NUMBER               */
		/* ------------------------------------------------------ */
		// Get current counter value first
		const current_counter = await api.getTicketCounter(
			inter.client.user.id,
			inter.guild.id
		)
		if (!current_counter) {
			await utils.handleResponse(
				inter,
				'error',
				'Failed to get ticket counter',
				{ code: 'OT004' }
			)
			return
		}

		// Use current counter as ticket ID, then increment for next ticket
		const ticket_id = current_counter
		try {
			await api.incrementTicketCounter(inter.client.user.id, inter.guild.id)
		} catch (error) {
			StatusLogger.error('Failed to increment ticket counter:', error)
			await utils.handleResponse(
				inter,
				'error',
				'Failed to update ticket counter',
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
			reason: `Ticket #${ticket_id} - ${topic}`,
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
			ticket_type: topic,
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

		/* ------------------------------------------------------ */
		/*                 SEND TEMPLATE MESSAGES                 */
		/* ------------------------------------------------------ */
		const placeholders: PlaceholderMap = {
			ticket_id: ticket_id.toString(),
			ticket_type: topic,
			topic: topic,
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
					topic,
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

				// Prepare message options
				const messageOptions: Discord.MessageCreateOptions = {}

				// Add components if we have any
				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags = Discord.MessageFlags.IsComponentsV2
				} else {
					// Only use content if we don't have v2Components
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
					if (contentParts.length > 0) {
						messageOptions.content = contentParts.join('\n')
					}
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

				// Update metadata with message info is now handled in sendAdminNotification
			} catch (error) {
				StatusLogger.error(
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
					topic,
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

				// Prepare message options
				const messageOptions: Discord.InteractionEditReplyOptions = {
					flags: Discord.MessageFlags.SuppressEmbeds,
				}

				// Add components if we have any
				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags =
						Discord.MessageFlags.SuppressEmbeds |
						Discord.MessageFlags.IsComponentsV2
				} else {
					// Only use content if we don't have v2Components
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
					if (contentParts.length > 0) {
						messageOptions.content = contentParts.join('\n')
					}
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
				StatusLogger.error(
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
		StatusLogger.error('Failed to create ticket:', error)
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

		// Check role time limits if configured BEFORE deferUpdate
		if (
			cfg.role_time_limits?.included?.length > 0 ||
			cfg.role_time_limits?.excluded?.length > 0
		) {
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
					{ code: 'OT003', ephemeral: true }
				)
				// Clear the select menu selection since ticket creation failed
				await clearSelectMenuSelection(inter)
				return
			}
		}

		// Use deferUpdate instead of deferReply to prevent select menu from staying selected
		await inter.deferUpdate()

		const topic = resolveTopic(inter.values[0], cfg)

		// Get current counter value first
		const current_counter = await api.getTicketCounter(
			inter.client.user.id,
			inter.guild.id
		)
		if (!current_counter) {
			await utils.handleResponse(
				inter,
				'error',
				'Failed to get ticket counter',
				{ code: 'OT004', followUp: true }
			)
			return
		}

		// Use current counter as ticket ID, then increment for next ticket
		const ticket_id = current_counter
		try {
			await api.incrementTicketCounter(inter.client.user.id, inter.guild.id)
		} catch (error) {
			StatusLogger.error('Failed to increment ticket counter:', error)
			await utils.handleResponse(
				inter,
				'error',
				'Failed to update ticket counter',
				{ code: 'OT004', followUp: true }
			)
			return
		}

		const parent = inter.channel as Discord.TextChannel
		const thread = await parent.threads.create({
			name: `Ticket #${ticket_id}`,
			autoArchiveDuration: Discord.ThreadAutoArchiveDuration.ThreeDays,
			type: Discord.ChannelType.PrivateThread,
			reason: `Ticket #${ticket_id} - ${topic}`,
		})

		await thread.members.add(inter.user.id)

		const meta: ThreadMetadata = {
			ticket_id,
			thread_id: thread.id,
			opened_by: toAuthor(inter),
			open_time: Math.floor(Date.now() / 1_000),
			ticket_type: topic,
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

		const placeholders: PlaceholderMap = {
			ticket_id: ticket_id.toString(),
			ticket_type: topic,
			topic: topic,
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
					topic,
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

				const messageOptions: Discord.MessageCreateOptions = {}

				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags = Discord.MessageFlags.IsComponentsV2
				} else {
					messageOptions.components = []
				}

				if (actionRows.length > 0) {
					if (messageOptions.components) {
						messageOptions.components =
							messageOptions.components.concat(actionRows)
					} else {
						messageOptions.components = actionRows
					}
				}

				const sentMessage = await thread.send(messageOptions)

				// Update metadata with message info is now handled in sendAdminNotification
			} catch (error) {
				StatusLogger.error('Error sending thread message:', error)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to send welcome message to ticket',
					{ code: 'OT005', followUp: true }
				)
			}
		}

		// Send success notification as followUp instead of editing reply
		await inter.followUp({
			content: `✅ **Ticket Created Successfully!**\n\n📋 **Ticket #${ticket_id}** - ${topic}\n🎯 **Thread:** <#${thread.id}>`,
			flags: Discord.MessageFlags.Ephemeral,
		})

		// Clear the select menu selection after successful ticket creation
		await clearSelectMenuSelection(inter)

		await sendAdminNotification(inter, cfg, thread, meta, placeholders)
	} catch (error) {
		StatusLogger.error('Failed to create ticket:', error)
		await utils.handleResponse(
			inter,
			'error',
			'Failed to create ticket. Please try again.',
			{
				code: 'OT005',
				error: error as Error,
				followUp: true,
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

	// Ensure member is a GuildMember
	const member =
		inter.member instanceof Discord.GuildMember
			? inter.member
			: await inter.guild.members.fetch(inter.user.id)
	if (!member) {
		await utils.handleResponse(
			inter,
			'error',
			'Could not fetch member details.',
			{ code: 'CT_MEM_FETCH_FAIL' }
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

		const [, threadId] = inter.customId.split(':')
		if (!threadId) {
			await utils.handleResponse(inter, 'error', 'Invalid ticket reference', {
				code: 'CT004',
			})
			return
		}

		let ticketData = store.get(threadId)
		if (!ticketData) {
			try {
				const allTickets = await api.getAllActiveTickets(
					inter.client.user.id,
					inter.guild.id
				)
				const dbTicket = allTickets.find((t) => t.thread_id === threadId)
				if (dbTicket) {
					ticketData = dbTicket.metadata
					store.set(threadId, ticketData)
				}
			} catch (error) {
				StatusLogger.error(
					'Error loading ticket from database for claim:',
					error
				)
			}
		}

		if (!ticketData) {
			await utils.handleResponse(
				inter,
				'error',
				'Could not find the associated ticket',
				{ code: 'CT005' }
			)
			return
		}

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

		ticketData.claimed_by = {
			id: inter.user.id,
			username: inter.user.username,
			displayName: member.displayName,
			avatar: inter.user.displayAvatarURL(),
		}
		ticketData.claimed_time = new Date()

		store.set(threadId, ticketData)
		await api.updateTicketMetadata(
			inter.client.user.id,
			inter.guild.id,
			threadId,
			ticketData
		)

		await utils.handleResponse(
			inter,
			'success',
			`You have successfully claimed ticket #${ticketData.ticket_id}`,
			{ code: 'CT008', ephemeral: true }
		)

		// --- Begin Revised Admin Message Update (hybrid approach) ---
		try {
			// We need to rebuild the message with updated placeholders (especially claimed_by)
			// but only modify the claim button
			const placeholders: PlaceholderMap = {
				ticket_id: String(ticketData.ticket_id),
				topic: String(ticketData.ticket_type),
				thread_id: String(threadId),
				channel_id: `<#${threadId}>`,
				opened_by: `<@${ticketData.opened_by.id}>`,
				claimed_by: `<@${inter.user.id}>`,
				open_time: `<t:${Math.floor(Number(ticketData.open_time))}:R>`,
				claimed_time: `<t:${Math.floor(ticketData.claimed_time.getTime() / 1000)}:R>`,
				mod_ping: cfg.mods_role_ids?.map((id) => `<@&${id}>`).join(' '),
				display_name: member.displayName,
				guild_id: inter.guild.id,
			}

			const adminTicketTemplate = cfg.components?.admin_ticket
			if (!adminTicketTemplate) {
				StatusLogger.warn(
					'Admin ticket template not found. Falling back to simple button disable.'
				)
				throw new Error('Admin ticket template missing for claim update')
			}

			// Ensure placeholders are strictly Record<string, string>
			const stringPlaceholders: Record<string, string> = {}
			for (const key in placeholders) {
				if (Object.prototype.hasOwnProperty.call(placeholders, key)) {
					stringPlaceholders[key] = String(placeholders[key])
				}
			}

			// Generate all components with updated placeholders
			const { v2Components, actionRows } = buildUniversalComponents(
				adminTicketTemplate,
				member,
				inter.guild,
				stringPlaceholders
			)

			// Process action rows to modify only the claim button
			const processedActionRows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] =
				[]

			for (const rowBuilder of actionRows) {
				const newRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()

				for (const componentBuilder of rowBuilder.components) {
					if (componentBuilder instanceof Discord.ButtonBuilder) {
						// Process the custom_id with placeholders
						let customId = ''
						const buttonData = componentBuilder.data as unknown as {
							custom_id?: string
						}
						if (
							buttonData.custom_id &&
							typeof buttonData.custom_id === 'string'
						) {
							customId = replacecustom_idPlaceholders(
								buttonData.custom_id,
								stringPlaceholders
							)
							componentBuilder.setCustomId(customId)
						}

						// Check if this is the claim ticket button and modify it
						if (customId.startsWith('claim_ticket:')) {
							componentBuilder
								.setDisabled(true)
								.setLabel('Claimed')
								.setStyle(Discord.ButtonStyle.Success)
						}

						newRow.addComponents(componentBuilder)
					}
				}

				if (newRow.components.length > 0) {
					processedActionRows.push(newRow)
				}
			}

			// Prepare message options with all components
			const messageOptions: Discord.MessageEditOptions = {}

			// Add v2Components (TextDisplay, Separator, etc.)
			if (v2Components && v2Components.length > 0) {
				messageOptions.components = v2Components
				messageOptions.flags = Discord.MessageFlags.IsComponentsV2
			}

			// Add processed action rows (buttons)
			if (processedActionRows.length > 0) {
				if (messageOptions.components) {
					messageOptions.components = [
						...messageOptions.components,
						...processedActionRows,
					]
				} else {
					messageOptions.components = processedActionRows
				}
			}

			// Edit the message with all components
			await inter.message.edit(messageOptions)
		} catch (error) {
			StatusLogger.error(
				'Error during admin message update after claim:',
				error
			)
			// Fallback logic remains the same...
			try {
				const originalMessageComponents = inter.message.components
				const fallbackComponents: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] =
					[]
				for (const row of originalMessageComponents) {
					const actionRow =
						row as Discord.ActionRow<Discord.MessageActionRowComponent>
					const newActionRow =
						new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
					if (actionRow.components && Array.isArray(actionRow.components)) {
						for (const component of actionRow.components) {
							if (component.type === Discord.ComponentType.Button) {
								const buttonBuilder = Discord.ButtonBuilder.from(component)
								if (component.customId?.includes('claim_ticket')) {
									buttonBuilder
										.setDisabled(true)
										.setLabel('✅ Claimed')
										.setStyle(Discord.ButtonStyle.Success)
								}
								newActionRow.addComponents(buttonBuilder)
							}
						}
					}
					if (newActionRow.components.length > 0) {
						fallbackComponents.push(newActionRow)
					}
				}
				if (fallbackComponents.length > 0) {
					await inter.message.edit({
						content: inter.message.content,
						components: fallbackComponents,
					})
				}
			} catch (fallbackError) {
				StatusLogger.error(
					'Fallback attempt to disable claim button also failed:',
					fallbackError
				)
			}
			StatusLogger.error(
				'Admin message not fully updated (fallback might have partially succeeded), but ticket claim was successful.'
			)
		}
		// --- End Revised Admin Message Update ---

		// Send notification to the ticket thread if configured
		if (cfg.components?.ticket_claimed) {
			try {
				const placeholders = {
					ticket_id: ticketData.ticket_id.toString(),
					topic: ticketData.ticket_type,
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

				const messageOptions: Discord.MessageCreateOptions = {}

				if (v2Components.length > 0) {
					messageOptions.components = v2Components
					messageOptions.flags = Discord.MessageFlags.IsComponentsV2
				} else {
					messageOptions.components = []
				}

				if (actionRows.length > 0) {
					if (messageOptions.components) {
						messageOptions.components =
							messageOptions.components.concat(actionRows)
					} else {
						messageOptions.components = actionRows
					}
				}

				await thread.send(messageOptions)
			} catch (error) {
				StatusLogger.error('Error sending ticket claimed message:', error)
				await utils.handleResponse(
					inter,
					'error',
					'Failed to send ticket claimed message',
					{ code: 'CT009' }
				)
			}
		}
	} catch (error) {
		StatusLogger.error('Failed to claim ticket:', error)
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
			StatusLogger.error('Error adding user to ticket thread:', error)
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
		StatusLogger.error('Failed to join ticket:', error)
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
				StatusLogger.warn('Invalid interaction type for claim_ticket')
				await utils.handleResponse(inter, 'error', 'Invalid interaction type', {
					code: 'TAS003',
				})
			}
			break
		case 'join_ticket':
			if (inter.isButton()) {
				await joinTicket(inter)
			} else {
				StatusLogger.warn('Invalid interaction type for join_ticket')
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
				StatusLogger.warn('Invalid interaction type for open_ticket')
				await utils.handleResponse(inter, 'error', 'Invalid interaction type', {
					code: 'TAS005',
				})
			}
			break
		default:
			StatusLogger.warn(`Unknown action selected: ${baseAction}`)
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
		if (metadata.admin_channel?.message_id === adminMessageId) {
			return { ticketData: metadata, threadId }
		}
	}

	// If not found in cache, check database
	try {
		const allTickets = await api.getAllActiveTickets(botId, guildId)
		for (const ticket of allTickets) {
			if (ticket.metadata.admin_channel?.message_id === adminMessageId) {
				// Update cache with found ticket
				store.set(ticket.thread_id, ticket.metadata)
				return { ticketData: ticket.metadata, threadId: ticket.thread_id }
			}
		}
	} catch (error) {
		StatusLogger.error('Failed to search for ticket:', error)
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
 * Resolve ticket topic from button custom_id
 */
function resolveTopic(
	customId: Discord.ButtonInteraction['customId'],
	cfg: PluginResponse<DefaultConfigs['tickets']>
): string {
	// Handle new format: open_ticket:topic_id@/tickets
	if (customId.includes(':') && customId.includes('@')) {
		const [action, rest] = customId.split(':')
		if (action === 'open_ticket' && rest) {
			const [topicId] = rest.split('@')
			// Convert topic_id to readable format
			return topicId.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
		}
	}

	// Handle old format: open_ticket_topic_name
	if (customId.startsWith('open_ticket_')) {
		const topicPart = customId.replace('open_ticket_', '')
		return topicPart.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
	}

	// Check if there's an open_ticket component template
	const openTicketTemplate = cfg.components?.open_ticket
	if (!Array.isArray(openTicketTemplate)) {
		StatusLogger.warn('No open_ticket components found in config')
		return 'General'
	}

	// Look for buttons in the components array
	for (const component of openTicketTemplate) {
		// Check if this is an ActionRow component (type 1 or has components array)
		const isActionRow =
			component.type === Discord.ComponentType.ActionRow ||
			('components' in component && Array.isArray(component.components))

		if (isActionRow && 'components' in component) {
			// Search through the components in this ActionRow
			for (const subComponent of component.components) {
				// Check if this is a Button component
				const isButton = subComponent.type === Discord.ComponentType.Button

				if (
					isButton &&
					'custom_id' in subComponent &&
					'label' in subComponent
				) {
					// Check if this button's custom_id matches what we're looking for
					if (subComponent.custom_id === customId && subComponent.label) {
						return String(subComponent.label)
					}
				}

				// Check if this is a String Select Menu component
				const isStringSelect =
					subComponent.type === Discord.ComponentType.StringSelect

				if (
					isStringSelect &&
					'options' in subComponent &&
					Array.isArray(subComponent.options)
				) {
					// Search through the select menu options
					for (const option of subComponent.options) {
						if (option.value === customId && option.label) {
							StatusLogger.info(
								`Found matching select option with label: ${option.label}`
							)
							return String(option.label)
						}
					}
				}
			}
		}
	}

	StatusLogger.warn(
		`No matching button or select option found for custom_id: ${customId}`
	)
	return 'General'
}

/**
 * Convert interaction user to author object
 */
function toAuthor(
	i: Discord.ButtonInteraction | Discord.StringSelectMenuInteraction
) {
	return {
		id: i.user.id,
		username: i.user.username,
		displayName:
			'displayName' in i.member && i.member
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
	inter: Discord.ButtonInteraction | Discord.StringSelectMenuInteraction,
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
			meta.admin_channel = {
				id: cfg.admin_channel_id,
				message_id: adminMessage.id,
			}

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
		StatusLogger.error('Failed to send admin notification:', error)
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

/**
 * Clear select menu selection after successful ticket creation
 * This allows users to select the same option again for future tickets
 */
async function clearSelectMenuSelection(
	inter: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		const originalMessage = inter.message

		// Check if this is a V2 components message
		const hasV2Components = originalMessage.flags?.has(
			Discord.MessageFlags.IsComponentsV2
		)

		if (hasV2Components) {
			// For V2 messages, we can't easily modify the components
			// Just trigger a re-render by editing with the same content
			await originalMessage.edit({
				components: originalMessage.components,
				flags: Discord.MessageFlags.IsComponentsV2,
			})
		} else {
			// For regular messages, rebuild the components to clear selections
			const updatedComponents = originalMessage.components
				.map((row) => {
					if (row.type === Discord.ComponentType.ActionRow) {
						const newComponents = row.components.map((component) => {
							if (component.type === Discord.ComponentType.StringSelect) {
								// Rebuild the select menu from scratch to clear selection
								if (!component.customId) {
									return component // Skip if no customId
								}

								const selectMenu = new Discord.StringSelectMenuBuilder()
									.setCustomId(component.customId)
									.setPlaceholder(
										component.placeholder || 'Select an option...'
									)

								// Add all the original options
								if (component.options && component.options.length > 0) {
									selectMenu.addOptions(
										component.options.map((option) => ({
											label: option.label,
											value: option.value,
											description: option.description || undefined,
											emoji: option.emoji || undefined,
										}))
									)
								}

								// Set min/max values if they were set
								if (typeof component.minValues === 'number') {
									selectMenu.setMinValues(component.minValues)
								}
								if (typeof component.maxValues === 'number') {
									selectMenu.setMaxValues(component.maxValues)
								}

								return selectMenu
							}
							return component
						})

						return new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
							...newComponents.filter(
								(comp): comp is Discord.StringSelectMenuBuilder =>
									comp instanceof Discord.StringSelectMenuBuilder
							)
						)
					}
					return row
				})
				.filter(
					(
						row
					): row is Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder> =>
						row instanceof Discord.ActionRowBuilder
				)

			await originalMessage.edit({
				content: originalMessage.content,
				embeds: originalMessage.embeds,
				components: updatedComponents,
			})
		}
	} catch (error) {
		// Don't fail the ticket creation if we can't clear the select menu
		StatusLogger.warn(`Failed to clear select menu selection: ${error}`)
	}
}
