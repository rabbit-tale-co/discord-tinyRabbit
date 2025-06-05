import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import * as utils from '@/utils/index.js'
import type { ThreadMetadata } from '@/types/tickets.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'
import { threadMetadataStore as store } from './state.js'
import { StatusLogger, ServiceLogger } from '@/utils/bunnyLogger.js'
import { buildUniversalComponents } from '@/discord/components/index.js'

/* -------------------------------------------------------------------------- */
/*                               PUBLIC ENTRY                                 */
/* -------------------------------------------------------------------------- */

export async function requestClose(interaction: Discord.ButtonInteraction) {
	if (!interaction.inGuild()) {
		await utils.handleResponse(
			interaction,
			'error',
			'This command can only be used in a server.',
			{ code: 'RC000' } // FIXME: add a proper error code
		)
		return
	}

	const thread = interaction.channel as Discord.ThreadChannel
	if (!thread) {
		await utils.handleResponse(
			interaction,
			'error',
			'This command can only be used in a thread.',
			{ code: 'RC001' } // FIXME: add a proper error code
		)
		return
	}

	const meta = await ensureMeta(interaction, thread)
	if (!meta) {
		return
	}

	const isOwner =
		meta.opened_by?.id === (interaction.user.id as Discord.User['id'])
	const isMod = interaction.memberPermissions?.has(
		Discord.PermissionsBitField.Flags.ManageMessages
	)

	if (!isOwner && !isMod) {
		await utils.handleResponse(
			interaction,
			'error',
			'You do not have permission to close this ticket.',
			{ code: 'RC002' }
		)
		return
	}

	// Get configuration
	const cfg = await getConfig(interaction)

	// Use configuration template if available
	if (cfg.components?.confirm_close_ticket) {
		try {
			// Check if the template has the expected button structure
			const hasActionRows =
				cfg.components.confirm_close_ticket.components?.some(
					(comp: { type: number; components?: { type: number }[] }) =>
						comp.type === 1 &&
						comp.components?.some(
							(subComp: { type: number }) => subComp.type === 2
						)
				)

			if (!hasActionRows) {
				StatusLogger.warn(
					'⚠️ Configuration template missing buttons, clearing cache and using fallback'
				)

				// Clear the configuration cache to force a fresh reload next time
				configCache.delete(interaction.guild.id)

				// Force fall through to hardcoded fallback
				throw new Error('Template missing buttons, using fallback')
			}

			const member = interaction.member as Discord.GuildMember
			const placeholders: Record<string, string> = {
				ticket_id: meta.ticket_id?.toString() ?? 'unknown',
				thread_id: thread.id,
			}

			const { v2Components, actionRows } = buildUniversalComponents(
				cfg.components.confirm_close_ticket,
				member,
				interaction.guild,
				placeholders
			)

			// Prepare message options with all components
			const messageOptions: Discord.InteractionReplyOptions = {
				flags: Discord.MessageFlags.Ephemeral,
			}

			// Add v2Components (TextDisplay, Separator, etc.)
			if (v2Components.length > 0) {
				messageOptions.components = v2Components
				messageOptions.flags =
					Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral
			}

			// Add action rows (buttons) to the existing components
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

			// Send combined components if we have any
			if (messageOptions.components && messageOptions.components.length > 0) {
				await interaction.reply(messageOptions)
				return
			}
		} catch (error) {
			StatusLogger.error(
				`Error using configuration template: ${error instanceof Error ? error.message : String(error)}`
			)
			// Fall through to hardcoded fallback
		}
	}

	// If we reach here, there was no valid configuration or it failed
	StatusLogger.error('No valid confirm_close_ticket configuration found')
	await utils.handleResponse(
		interaction,
		'error',
		'Ticket close confirmation is not properly configured. Please contact an administrator.',
		{ code: 'RC003' }
	)
}

export async function confirmClose(interaction: Discord.ButtonInteraction) {
	try {
		// Respond to interaction FIRST to prevent timeout
		await utils.handleResponse(
			interaction,
			'success',
			'Ticket is being closed...'
		)

		const thread = interaction.channel as Discord.ThreadChannel
		await perfromClose(interaction, thread, 'No reason provided')
	} catch (error) {
		StatusLogger.error(
			`Error in confirmClose: ${error instanceof Error ? error.message : String(error)}`
		)
		// Attempt to respond to the user if we haven't already
		try {
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content:
						'Ticket was closed, but there was an error updating some information.',
					flags: Discord.MessageFlags.Ephemeral,
				})
			}
		} catch (replyError) {
			StatusLogger.error(
				`Failed to send error response: ${replyError instanceof Error ? replyError.message : String(replyError)}`
			)
		}
	}
}

export async function modalClose(interaction: Discord.ModalSubmitInteraction) {
	try {
		const reason =
			interaction.fields.getTextInputValue('close_reason') || 'No reason'
		const thread = interaction.channel as Discord.ThreadChannel
		await perfromClose(interaction, thread, reason)
	} catch (error) {
		StatusLogger.error(
			`Error in modalClose: ${error instanceof Error ? error.message : String(error)}`
		)
		// Attempt to respond to the user if we haven't already
		try {
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content:
						'Ticket was closed, but there was an error updating some information.',
					flags: Discord.MessageFlags.Ephemeral,
				})
			}
		} catch (replyError) {
			StatusLogger.error(
				`Failed to send error response: ${replyError instanceof Error ? replyError.message : String(replyError)}`
			)
		}
	}
}

/**
 * Auto-close a ticket due to inactivity (no interaction required)
 * FIXME: auto close ticket is closed 40s after warning messages (when warning message show 0 s, nothing happens, when it's 40s later it closes the ticket)
 */
export async function autoCloseTicket(
	client: Discord.Client,
	thread: Discord.ThreadChannel,
	reason: string
) {
	if (!thread?.isThread) {
		StatusLogger.error('Channel is not a thread')
		return
	}

	const meta = await ensureMetaForAutoClose(client, thread)
	if (!meta) {
		StatusLogger.error('Could not get ticket metadata for auto-close')
		return
	}

	meta.closed_by = {
		id: client.user?.id ?? 'system',
		username: 'System',
		displayName: 'System Auto-Close',
		avatar: client.user?.displayAvatarURL() ?? '',
	}
	meta.close_time = new Date()
	meta.reason = reason
	meta.status = 'closed'

	store.set(thread.id, meta)

	// Fetch and save thread messages before archiving
	try {
		const messages = await api.fetchTicketMessages(thread)
		const formattedMessages = api.formatTranscript(messages)

		await api.saveTranscriptToSupabase(
			client.user?.id ?? '',
			thread.guild.id,
			thread.id,
			formattedMessages,
			meta
		)
	} catch (error) {
		StatusLogger.error(
			`Failed to save transcript messages for auto-close: ${error instanceof Error ? error.message : String(error)}`
		)
		// Continue with closure even if transcript saving fails
	}

	if (client.user) {
		await api.updateTicketMetadata(
			client.user.id,
			thread.guild.id,
			thread.id,
			meta as ThreadMetadata
		)
	}

	// Send auto-close message using configuration
	await sendAutoCloseMessage(client, thread, meta, reason)

	// Send transcript for auto-close
	await sendTranscriptUnified(thread, meta, { type: 'auto', client })

	// Send rating DM to user for auto-close
	await sendRatingDMUnified(thread, meta, { type: 'auto', client })

	// Delete admin channel message if it exists (without interaction context)
	await deleteAdminMessageUnified(meta, {
		type: 'auto',
		client,
		guildId: thread.guild.id,
	})

	await thread.setLocked(true)
	await thread.setArchived(true)
}

/**
 * Get ticket metadata for auto-close (no interaction required)
 */
async function ensureMetaForAutoClose(
	client: Discord.Client,
	thread: Discord.ThreadChannel
): Promise<ThreadMetadata | null> {
	// Check memory first
	let meta = store.get(thread.id)
	if (meta) {
		return meta
	}

	// Try to load from database
	try {
		if (!client.user) return null

		const allTickets = await api.getAllActiveTickets(
			client.user.id,
			thread.guild.id
		)
		const dbTicket = allTickets.find((t) => t.thread_id === thread.id)
		if (dbTicket) {
			meta = dbTicket.metadata
			store.set(thread.id, meta)
			return meta
		}
	} catch (error) {
		StatusLogger.error(
			`Failed to load ticket metadata from database: ${error instanceof Error ? error.message : String(error)}`
		)
	}

	return null
}

/* -------------------------------------------------------------------------- */
/*                             CLOSE IMPLEMENTATION                           */
/* -------------------------------------------------------------------------- */

export async function perfromClose(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	thread: Discord.ThreadChannel,
	reason: string
) {
	if (!thread?.isThread) {
		StatusLogger.error('Channel is not a thread')
		return
	}

	// Respond to modal interactions FIRST before doing anything else
	if (
		interaction.isModalSubmit() &&
		!interaction.replied &&
		!interaction.deferred
	) {
		try {
			await utils.handleResponse(
				interaction,
				'success',
				'Ticket is being closed...'
			)
		} catch (error) {
			StatusLogger.error(
				`Failed to respond to modal interaction: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	}

	const meta = await ensureMeta(interaction, thread)
	if (!meta) {
		StatusLogger.error('Could not get ticket metadata')
		return
	}

	meta.closed_by = {
		id: interaction.user.id,
		username: interaction.user.username,
		displayName: interaction.user.displayName,
		avatar: interaction.user.displayAvatarURL({
			extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
		}),
	}
	meta.close_time = new Date()
	meta.reason = reason
	meta.status = 'closed'

	store.set(thread.id, meta)

	// Fetch and save thread messages before archiving
	try {
		const messages = await api.fetchTicketMessages(thread)
		const formattedMessages = api.formatTranscript(messages)

		await api.saveTranscriptToSupabase(
			interaction.client.user.id,
			thread.guild.id,
			thread.id,
			formattedMessages,
			meta
		)
	} catch (error) {
		StatusLogger.error(
			`Failed to save transcript messages: ${error instanceof Error ? error.message : String(error)}`
		)
		// Continue with closure even if transcript saving fails
	}

	await api.updateTicketMetadata(
		interaction.client.user.id,
		thread.guild.id,
		thread.id,
		meta as ThreadMetadata
	)

	// message do wątku + transcript
	await thread.send(await closedMessage(interaction, meta))
	await sendTranscriptUnified(thread, meta, {
		type: 'interaction',
		interaction,
	})

	// Delete admin channel message if it exists
	await deleteAdminMessageUnified(meta, { type: 'interaction', interaction })

	// Send rating DM to user
	await sendRatingDMUnified(thread, meta, { type: 'interaction', interaction })

	await thread.setLocked(true)
	await thread.setArchived(true)

	// Only respond if this is from confirmClose (modalClose already responded above)
	if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
		try {
			await utils.handleResponse(
				interaction,
				'success',
				'Ticket closed successfully.'
			)
		} catch (error) {
			StatusLogger.error(
				`Failed to respond to button interaction: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	}
}

async function closedMessage(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	meta: ThreadMetadata
): Promise<Discord.MessageCreateOptions> {
	const placeholders = {
		closed_by: `<@${meta.closed_by?.id}>`,
		close_time: `<t:${Math.floor((meta.close_time as Date).getTime() / 1000)}>`,
		reason: meta.reason ?? 'No reason',
	}

	// Get configuration
	const cfg = await getConfig(interaction)

	// Use buildUniversalComponents like in open.ts
	if (cfg.components?.closed_ticket) {
		try {
			const member = interaction.member as Discord.GuildMember

			// Convert placeholders to string format
			const stringPlaceholders: Record<string, string> = {}
			for (const [key, value] of Object.entries(placeholders)) {
				stringPlaceholders[key] = String(value)
			}

			const { v2Components, actionRows } = buildUniversalComponents(
				cfg.components.closed_ticket,
				member,
				interaction.guild,
				stringPlaceholders
			)

			// Return V2 components if available
			if (v2Components.length > 0) {
				return {
					components: v2Components,
					flags: Discord.MessageFlags.IsComponentsV2,
				}
			}

			// Return action row buttons if available (fallback)
			if (actionRows.length > 0) {
				return {
					components: actionRows,
				}
			}
		} catch (error) {
			StatusLogger.error(
				`Error using closed_ticket configuration: ${error instanceof Error ? error.message : String(error)}`
			)
			// Fall through to simple fallback
		}
	}

	// Return a simple text-only message as fallback
	return {
		content: `✅ **Ticket Closed**\n\nThis ticket has been closed by ${placeholders.closed_by}.\n\n**Reason:** ${placeholders.reason}\n**Closed at:** ${placeholders.close_time}\n\nThank you for using our support system!`,
	}
}

/* -------------------------------------------------------------------------- */
/*                                TRANSCRIPT                                  */
/* -------------------------------------------------------------------------- */

async function sendTranscriptUnified(
	thread: Discord.ThreadChannel,
	meta: ThreadMetadata,
	context:
		| {
				type: 'interaction'
				interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction
		  }
		| { type: 'auto'; client: Discord.Client }
) {
	try {
		// Get configuration based on context type
		const cfg =
			context.type === 'interaction'
				? await getConfig(context.interaction)
				: await api.getPluginConfig(
						context.client.user?.id ?? '',
						thread.guild.id,
						'tickets'
					)

		if (!cfg.transcript_channel_id) {
			return
		}

		const transcriptChannel = await thread.guild.channels.fetch(
			cfg.transcript_channel_id
		)

		if (!transcriptChannel?.isTextBased()) {
			StatusLogger.error('Transcript channel not found or not text-based')
			return
		}

		const placeholders = {
			ticket_id: meta.ticket_id?.toString() ?? 'unknown',
			opened_by: meta.opened_by ? `<@${meta.opened_by.id}>` : 'unknown',
			closed_by: `<@${meta.closed_by?.id}>`,
			claimed_by:
				typeof meta.claimed_by === 'object'
					? `<@${meta.claimed_by.id}>`
					: (meta.claimed_by ?? 'Not claimed'),
			category: meta.ticket_type ?? 'Support',
			thread_id: thread.id,
			guild_id: thread.guild.id,
			reason: meta.reason ?? 'No reason',
			rating: 'Not rated',
			open_time: `<t:${meta.open_time ?? Math.floor(Date.now() / 1000)}>`,
			close_time: `<t:${Math.floor((meta.close_time as Date).getTime() / 1000)}>`,
		}

		// Check if transcript component configuration exists
		const transcriptConfig = cfg.components?.transcript
		if (!transcriptConfig) {
			StatusLogger.error(
				'No transcript component configuration found in database'
			)
			await transcriptChannel.send({
				content: `❌ **Configuration Error**\n\nTranscript configuration is missing for ticket #${placeholders.ticket_id}.\nPlease configure transcript components in the admin panel.\n\n**Thread:** <#${placeholders.thread_id}>`,
			})
			return
		}

		try {
			// Get member based on context type
			let member: Discord.GuildMember
			if (context.type === 'interaction') {
				member = context.interaction.member as Discord.GuildMember
			} else {
				// For auto-close, try to get the ticket opener's member
				try {
					if (meta.opened_by?.id) {
						member = await thread.guild.members.fetch(meta.opened_by.id)
					} else {
						// Fallback to bot member if no opener info
						StatusLogger.warn(
							'Could not fetch ticket opener member for rating DM, using bot member'
						)
						member = await thread.guild.members.fetchMe()
					}
				} catch (error) {
					// If we can't fetch the opener, use bot member as fallback
					StatusLogger.warn(
						`Could not fetch ticket opener member for rating DM, using bot member: ${error}`
					)
					member = await thread.guild.members.fetchMe()
				}
			}

			// Convert placeholders to string format
			const stringPlaceholders: Record<string, string> = {}
			for (const [key, value] of Object.entries(placeholders)) {
				stringPlaceholders[key] = String(value)
			}

			const { v2Components, actionRows } = buildUniversalComponents(
				transcriptConfig,
				member,
				thread.guild,
				stringPlaceholders
			)

			// Manual processing for ActionRows that buildUniversalComponents might miss
			const manualActionRows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] =
				[]

			if (transcriptConfig.components) {
				for (const component of transcriptConfig.components) {
					// Check if this is an ActionRow (type 1)
					if (
						component.type === 1 &&
						'components' in component &&
						Array.isArray(component.components)
					) {
						const actionRow =
							new Discord.ActionRowBuilder<Discord.ButtonBuilder>()

						for (const subComp of component.components) {
							// Check if this is a Button (type 2)
							if (subComp.type === 2 && 'label' in subComp) {
								const button = new Discord.ButtonBuilder().setLabel(
									String(subComp.label)
								)

								// Handle URL buttons (style 5)
								if (
									'style' in subComp &&
									subComp.style === 5 &&
									'url' in subComp
								) {
									// Replace placeholders in URL
									let url = String(subComp.url)
									for (const [key, value] of Object.entries(
										stringPlaceholders
									)) {
										url = url.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
									}
									button.setStyle(Discord.ButtonStyle.Link).setURL(url)
								}
								// Handle other button styles
								else if ('custom_id' in subComp && 'style' in subComp) {
									let customId = String(subComp.custom_id)
									// Replace placeholders in custom_id
									for (const [key, value] of Object.entries(
										stringPlaceholders
									)) {
										customId = customId.replace(
											new RegExp(`\\{${key}\\}`, 'g'),
											value
										)
									}
									button.setCustomId(customId)

									const style = Number(subComp.style)
									switch (style) {
										case 1:
											button.setStyle(Discord.ButtonStyle.Primary)
											break
										case 2:
											button.setStyle(Discord.ButtonStyle.Secondary)
											break
										case 3:
											button.setStyle(Discord.ButtonStyle.Success)
											break
										case 4:
											button.setStyle(Discord.ButtonStyle.Danger)
											break
										default:
											button.setStyle(Discord.ButtonStyle.Secondary)
									}
								}

								actionRow.addComponents(button)
							}
						}

						if (actionRow.components.length > 0) {
							manualActionRows.push(actionRow)
						}
					}
				}
			}

			// Send all components in one message
			const messageOptions: Discord.MessageCreateOptions = {}

			// Filter out ActionRow components from v2Components (they'll be handled manually)
			const filteredV2Components = v2Components.filter((comp) => {
				// Keep only non-ActionRow components (TextDisplay, etc.)
				return !('components' in comp)
			})

			// Add filtered v2Components (TextDisplay, Separator, etc.)
			if (filteredV2Components.length > 0) {
				messageOptions.components = filteredV2Components
				messageOptions.flags = Discord.MessageFlags.IsComponentsV2
			}

			// Use manual action rows if available, fallback to buildUniversalComponents result
			const finalActionRows =
				manualActionRows.length > 0 ? manualActionRows : actionRows

			// Add action rows (buttons)
			if (finalActionRows.length > 0) {
				// If we already have components, append the action rows
				if (messageOptions.components) {
					messageOptions.components = [
						...messageOptions.components,
						...finalActionRows,
					]
				} else {
					messageOptions.components = finalActionRows
				}
			}

			// Send combined components if we have any
			if (messageOptions.components && messageOptions.components.length > 0) {
				const transcriptMessage = await transcriptChannel.send(messageOptions)

				// Store transcript message info in metadata for rating updates
				meta.transcript_channel = {
					id: transcriptChannel.id,
					message_id: transcriptMessage.id,
				}

				// Update the ticket metadata with transcript channel info
				const clientUser =
					context.type === 'interaction'
						? context.interaction.client.user
						: context.client.user

				if (clientUser) {
					await api.updateTicketMetadata(
						clientUser.id,
						thread.guild.id,
						thread.id,
						meta as ThreadMetadata
					)
				}
				return
			}
		} catch (error) {
			StatusLogger.error(
				`Error using transcript configuration: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	} catch (error) {
		StatusLogger.error(
			`Failed to send transcript: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

async function ensureMeta(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	thread: Discord.ThreadChannel
) {
	let meta = store.get(thread.id)
	if (!meta) {
		meta = (await api.getTicketMetadata(
			interaction.client.user.id,
			thread.guild.id,
			thread.id
		)) as ThreadMetadata | null
		if (!meta) {
			await utils.handleResponse(
				interaction,
				'error',
				'No ticket metadata found.',
				{ code: 'TM000' }
			)
			return null
		}
		store.set(thread.id, meta)
	}
	return meta
}

const configCache = new Map<string, PluginResponse<DefaultConfigs['tickets']>>()
const getConfig = async (
	i: Discord.ButtonInteraction | Discord.ModalSubmitInteraction
) => {
	const key = i.guild.id as Discord.Guild['id']

	if (configCache.has(key)) {
		return configCache.get(key) as PluginResponse<DefaultConfigs['tickets']>
	}

	const cfg = await api.getPluginConfig(i.client.user.id, key, 'tickets')
	configCache.set(key, cfg)
	return cfg
}

/**
 * Send rating DM (unified for both auto-close and normal close)
 */
async function sendRatingDMUnified(
	thread: Discord.ThreadChannel,
	meta: ThreadMetadata,
	context:
		| {
				type: 'interaction'
				interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction
		  }
		| { type: 'auto'; client: Discord.Client }
) {
	if (!meta.opened_by?.id) {
		return
	}

	try {
		// Get user based on context type
		const client =
			context.type === 'interaction'
				? context.interaction.client
				: context.client
		const user = await client.users.fetch(meta.opened_by.id)

		if (!user) {
			return
		}

		// Get configuration based on context type
		const cfg =
			context.type === 'interaction'
				? await getConfig(context.interaction)
				: await api.getPluginConfig(
						client.user?.id ?? '',
						thread.guild.id,
						'tickets'
					)

		// Check if rating_survey component configuration exists
		const ratingSurveyConfig = cfg.components?.rating_survey
		if (!ratingSurveyConfig) {
			if (context.type === 'auto') {
				StatusLogger.warn(
					'❌ No rating_survey component configuration found for auto-close'
				)
			}
			return
		}

		try {
			// Get member based on context type
			let member: Discord.GuildMember
			if (context.type === 'interaction') {
				member = context.interaction.member as Discord.GuildMember
			} else {
				// For auto-close, try to get the ticket opener's member
				try {
					if (meta.opened_by?.id) {
						member = await thread.guild.members.fetch(meta.opened_by.id)
					} else {
						// Fallback to bot member if no opener info
						StatusLogger.warn(
							'Could not fetch ticket opener member for rating DM, using bot member'
						)
						member = await thread.guild.members.fetchMe()
					}
				} catch (error) {
					// If we can't fetch the opener, use bot member as fallback
					StatusLogger.warn(
						`Could not fetch ticket opener member for rating DM, using bot member: ${error}`
					)
					member = await thread.guild.members.fetchMe()
				}
			}

			// Generate custom IDs based on context type
			const placeholders =
				context.type === 'interaction'
					? {
							ticket_id: meta.ticket_id?.toString() ?? 'unknown',
							opened_by: `<@${meta.opened_by.id}>`,
							closed_by: `<@${meta.closed_by?.id}>`,
							category: meta.ticket_type ?? 'Support',
							thread_id: thread.id,
							guild_id: thread.guild.id,
							reason: meta.reason ?? 'No reason',
							rating: 'Not rated',
							open_time: `<t:${meta.open_time ?? Math.floor(Date.now() / 1000)}>`,
							close_time: `<t:${Math.floor((meta.close_time as Date).getTime() / 1000)}>`,
							// Rating button custom_ids for normal close
							rate_1_custom_id: `tickets:rate:${thread.id}:1`,
							rate_2_custom_id: `tickets:rate:${thread.id}:2`,
							rate_3_custom_id: `tickets:rate:${thread.id}:3`,
							rate_4_custom_id: `tickets:rate:${thread.id}:4`,
							rate_5_custom_id: `tickets:rate:${thread.id}:5`,
						}
					: {
							ticket_id: meta.ticket_id?.toString() ?? 'unknown',
							// Rating button custom_ids for auto-close
							rate_1_custom_id: `rate_1:${thread.guild.id}:${thread.id}`,
							rate_2_custom_id: `rate_2:${thread.guild.id}:${thread.id}`,
							rate_3_custom_id: `rate_3:${thread.guild.id}:${thread.id}`,
							rate_4_custom_id: `rate_4:${thread.guild.id}:${thread.id}`,
							rate_5_custom_id: `rate_5:${thread.guild.id}:${thread.id}`,
						}

			const { v2Components, actionRows } = buildUniversalComponents(
				ratingSurveyConfig,
				member,
				thread.guild,
				placeholders,
				true // Force buttons for rating survey in both auto and normal close
			)

			// Send V2 components with action rows if available
			if (v2Components.length > 0 || actionRows.length > 0) {
				const messageComponents = []

				// Add V2 components first
				if (v2Components.length > 0) {
					messageComponents.push(...v2Components)
				}

				// Add action rows (buttons)
				if (actionRows.length > 0) {
					messageComponents.push(...actionRows)
				}

				await user.send({
					components: messageComponents,
					flags:
						v2Components.length > 0
							? Discord.MessageFlags.IsComponentsV2
							: undefined,
				})
			} else if (context.type === 'auto') {
				// Fallback to simple text message for auto-close
				await user.send({
					content: `📊 **Support Ticket Feedback**\n\nThanks for using our support system! Your ticket #${placeholders.ticket_id} has been automatically closed.\n\nPlease use the slash command \`/rate\` in the server to rate your experience.`,
				})
			}
		} catch (error) {
			StatusLogger.error(
				`Error using rating_survey configuration: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	} catch (error) {
		StatusLogger.error(
			`Failed to send rating DM: ${error instanceof Error ? error.message : String(error)}`
		)
		// Don't fail the entire closing process for this error
	}
}

/**
 * Delete admin message (unified for both auto-close and normal close)
 */
async function deleteAdminMessageUnified(
	meta: ThreadMetadata,
	context:
		| {
				type: 'interaction'
				interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction
		  }
		| { type: 'auto'; client: Discord.Client; guildId: string }
) {
	if (!meta.admin_channel?.id || !meta.admin_channel?.message_id) {
		if (context.type === 'interaction') {
			StatusLogger.info(
				'❌ No admin message to delete (missing channel or message ID)'
			)
		}
		return
	}

	try {
		// Get guild based on context type
		const guild =
			context.type === 'interaction'
				? context.interaction.guild
				: await context.client.guilds.fetch(context.guildId)

		if (!guild) return

		const adminChannel = await guild.channels.fetch(meta.admin_channel.id)

		if (!adminChannel?.isTextBased()) {
			StatusLogger.warn('Admin channel is not text-based or not found')
			return
		}

		await adminChannel.messages.delete(meta.admin_channel.message_id)
	} catch (error) {
		StatusLogger.error(
			`Failed to delete admin message: ${error instanceof Error ? error.message : String(error)}`
		)
		// Don't fail the entire closing process for this error
	}
}

/**
 * Send auto-close message using configuration
 */
async function sendAutoCloseMessage(
	client: Discord.Client,
	thread: Discord.ThreadChannel,
	meta: ThreadMetadata,
	reason: string
) {
	try {
		// Get configuration
		const cfg = await api.getPluginConfig(
			client.user?.id ?? '',
			thread.guild.id,
			'tickets'
		)

		// Check if inactivity_notice component configuration exists
		const inactivityNoticeConfig = cfg.components?.inactivity_notice

		try {
			// Get bot member for buildUniversalComponents
			const botMember = await thread.guild.members.fetchMe()

			const placeholders = {
				reason: reason,
				closed_at: `<t:${Math.floor((meta.close_time as Date).getTime() / 1000)}>`,
				ticket_id: meta.ticket_id?.toString() ?? 'unknown',
				opened_by: meta.opened_by ? `<@${meta.opened_by.id}>` : 'unknown',
				closed_by: `<@${meta.closed_by?.id}>`,
				category: meta.ticket_type ?? 'Support',
				thread_id: thread.id,
				guild_id: thread.guild.id,
			}

			// Convert placeholders to string format
			const stringPlaceholders: Record<string, string> = {}
			for (const [key, value] of Object.entries(placeholders)) {
				stringPlaceholders[key] = String(value)
			}

			const { v2Components, actionRows } = buildUniversalComponents(
				inactivityNoticeConfig,
				botMember,
				thread.guild,
				stringPlaceholders
			)

			// Send V2 components if available
			if (v2Components.length > 0) {
				await thread.send({
					components: v2Components,
					flags: Discord.MessageFlags.IsComponentsV2,
				})
				return
			}

			// Fallback to action rows if available
			if (actionRows.length > 0) {
				await thread.send({
					components: actionRows,
				})
				return
			}

			// Final fallback to simple message
			throw new Error(
				'No components generated from inactivity_notice configuration'
			)
		} catch (error) {
			StatusLogger.error(
				`Error using inactivity_notice configuration: ${error instanceof Error ? error.message : String(error)}`
			)
		}
	} catch (error) {
		StatusLogger.error(
			`Failed to send auto-close message: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}
