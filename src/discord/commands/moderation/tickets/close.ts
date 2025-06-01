import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import * as utils from '@/utils/index.js'
import type { ThreadMetadata } from '@/types/tickets.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'
import { threadMetadataStore as store } from './state.js'
import { ID } from '@/commands/constants.js'
import { bunnyLog } from 'bunny-log'
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
				bunnyLog.warn(
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
			bunnyLog.error('❌ Error using configuration template:', error)
			// Fall through to hardcoded fallback
		}
	}

	// If we reach here, there was no valid configuration or it failed
	bunnyLog.error('❌ No valid confirm_close_ticket configuration found')
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
		bunnyLog.error('❌ Error in confirmClose:', error)
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
			bunnyLog.error('❌ Failed to send error response:', replyError)
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
		bunnyLog.error('❌ Error in modalClose:', error)
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
			bunnyLog.error('❌ Failed to send error response:', replyError)
		}
	}
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
		bunnyLog.error('❌ Channel is not a thread')
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
			bunnyLog.error('❌ Failed to respond to modal interaction:', error)
		}
	}

	const meta = await ensureMeta(interaction, thread)
	if (!meta) {
		bunnyLog.error('❌ Could not get ticket metadata')
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
		bunnyLog.error('❌ Failed to save transcript messages:', error)
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
	await sendTranscript(interaction, thread, meta)

	// Delete admin channel message if it exists
	await deleteAdminMessage(interaction, meta)

	// Send rating DM to user
	await sendRatingDM(interaction, thread, meta)

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
			bunnyLog.error('❌ Failed to respond to button interaction:', error)
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
			bunnyLog.error('❌ Error using closed_ticket configuration:', error)
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

async function sendTranscript(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	thread: Discord.ThreadChannel,
	meta: ThreadMetadata
) {
	const cfg = await getConfig(interaction)

	if (!cfg.transcript_channel_id) {
		return
	}

	try {
		const transcriptChannel = await thread.guild.channels.fetch(
			cfg.transcript_channel_id
		)

		if (!transcriptChannel) {
			bunnyLog.error('❌ Transcript channel not found')
			return
		}

		if (!transcriptChannel.isTextBased()) {
			bunnyLog.error('❌ Transcript channel is not text-based')
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
			bunnyLog.error(
				'❌ No transcript component configuration found in database'
			)
			await transcriptChannel.send({
				content: `❌ **Configuration Error**\n\nTranscript configuration is missing for ticket #${placeholders.ticket_id}.\nPlease configure transcript components in the admin panel.\n\n**Thread:** <#${placeholders.thread_id}>`,
			})
			return
		}

		try {
			const member = interaction.member as Discord.GuildMember

			// Convert placeholders to string format
			const stringPlaceholders: Record<string, string> = {}
			for (const [key, value] of Object.entries(placeholders)) {
				stringPlaceholders[key] = String(value)
			}

			const { v2Components, actionRows } = buildUniversalComponents(
				transcriptConfig,
				member,
				interaction.guild,
				stringPlaceholders
			)

			// Send only V2 components (includes content + buttons from embed.buttons_map)
			if (v2Components.length > 0) {
				const transcriptMessage = await transcriptChannel.send({
					components: v2Components,
					flags: Discord.MessageFlags.IsComponentsV2,
				})

				// Store transcript message info in metadata for rating updates
				meta.transcript_channel = {
					id: transcriptChannel.id,
					message_id: transcriptMessage.id,
				}

				// Update the ticket metadata with transcript channel info
				await api.updateTicketMetadata(
					interaction.client.user.id,
					thread.guild.id,
					thread.id,
					meta as ThreadMetadata
				)
				return
			}

			// Fallback to action rows if no V2 components
			if (actionRows.length > 0) {
				const transcriptMessage = await transcriptChannel.send({
					components: actionRows,
				})

				// Store transcript message info in metadata for rating updates
				meta.transcript_channel = {
					id: transcriptChannel.id,
					message_id: transcriptMessage.id,
				}

				// Update the ticket metadata with transcript channel info
				await api.updateTicketMetadata(
					interaction.client.user.id,
					thread.guild.id,
					thread.id,
					meta as ThreadMetadata
				)
				return
			}
		} catch (error) {
			bunnyLog.error('❌ Error using transcript configuration:', error)
		}
	} catch (error) {
		bunnyLog.error('❌ Failed to send transcript:', error)
	}
}

/* -------------------------------------------------------------------------- */
/*                          ADMIN MESSAGE CLEANUP                            */
/* -------------------------------------------------------------------------- */

async function deleteAdminMessage(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	meta: ThreadMetadata
) {
	if (!meta.admin_channel?.id || !meta.admin_channel?.message_id) {
		bunnyLog.info(
			'❌ No admin message to delete (missing channel or message ID)'
		)
		return
	}

	try {
		const adminChannel = await interaction.guild?.channels.fetch(
			meta.admin_channel.id
		)

		if (!adminChannel?.isTextBased()) {
			bunnyLog.warn('❌ Admin channel is not text-based or not found')
			return
		}

		await adminChannel.messages.delete(meta.admin_channel.message_id)
	} catch (error) {
		bunnyLog.error('❌ Failed to delete admin message:', error)
		// Don't fail the entire closing process for this error
	}
}

/* -------------------------------------------------------------------------- */
/*                              RATING DM                                    */
/* -------------------------------------------------------------------------- */

async function sendRatingDM(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	thread: Discord.ThreadChannel,
	meta: ThreadMetadata
) {
	if (!meta.opened_by?.id) {
		return
	}

	try {
		const user = await interaction.client.users.fetch(meta.opened_by.id)

		if (!user) {
			return
		}

		const cfg = await getConfig(interaction)

		// Check if rating_survey component configuration exists
		const ratingSurveyConfig = cfg.components?.rating_survey
		if (!ratingSurveyConfig) {
			return
		}

		try {
			const member = interaction.member as Discord.GuildMember

			const placeholders = {
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
				// Rating button custom_ids
				rate_1_custom_id: `tickets:rate:${thread.id}:1`,
				rate_2_custom_id: `tickets:rate:${thread.id}:2`,
				rate_3_custom_id: `tickets:rate:${thread.id}:3`,
				rate_4_custom_id: `tickets:rate:${thread.id}:4`,
				rate_5_custom_id: `tickets:rate:${thread.id}:5`,
			}

			const { v2Components, actionRows } = buildUniversalComponents(
				ratingSurveyConfig,
				member,
				interaction.guild,
				placeholders,
				true // Force buttons for rating survey
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
				return
			}
		} catch (error) {
			bunnyLog.error('❌ Error using rating_survey configuration:', error)
		}
	} catch (error) {
		bunnyLog.error('❌ Failed to send rating DM:', error)
		// Don't fail the entire closing process for this error
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
