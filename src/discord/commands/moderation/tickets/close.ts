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
	bunnyLog.info(
		`🚨 requestClose called by ${interaction.user.username} (${interaction.user.id})`
	)
	bunnyLog.info(
		`📍 Channel: ${interaction.channelId}, Guild: ${interaction.guildId}`
	)

	if (!interaction.inGuild()) {
		bunnyLog.info('❌ Not in guild, returning error')
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
		console.log('❌ Not in thread, returning error')
		await utils.handleResponse(
			interaction,
			'error',
			'This command can only be used in a thread.',
			{ code: 'RC001' } // FIXME: add a proper error code
		)
		return
	}

	bunnyLog.info(`🧵 Thread found: ${thread.name} (${thread.id})`)

	const meta = await ensureMeta(interaction, thread)
	if (!meta) {
		bunnyLog.info('❌ No metadata found, ensureMeta returned null')
		return
	}

	bunnyLog.info('📝 Ticket metadata:', {
		ticket_id: meta.ticket_id,
		opened_by: meta.opened_by?.username,
		status: meta.status,
	})

	const isOwner =
		meta.opened_by?.id === (interaction.user.id as Discord.User['id'])
	const isMod = interaction.memberPermissions?.has(
		Discord.PermissionsBitField.Flags.ManageMessages
	)

	bunnyLog.info(`🔐 Permission check: isOwner=${isOwner}, isMod=${isMod}`)

	if (!isOwner && !isMod) {
		bunnyLog.info('❌ No permission to close ticket')
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
			bunnyLog.info('🔧 Using confirm_close_ticket configuration template')
			bunnyLog.info(
				'🔧 Raw template structure:',
				JSON.stringify(cfg.components.confirm_close_ticket, null, 2)
			)

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
			const confirmcustom_id = ID.TICKET_CONFIRM_CLOSE(thread.id)

			const placeholders: Record<string, string> = {
				ticket_id: meta.ticket_id?.toString() ?? 'unknown',
				thread_id: thread.id,
				confirm_custom_id: confirmcustom_id,
			}

			bunnyLog.info('🔧 Generated custom IDs:')
			bunnyLog.info(`  ✅ Confirm: ${confirmcustom_id}`)

			const { v2Components, actionRows } = buildUniversalComponents(
				cfg.components.confirm_close_ticket,
				member,
				interaction.guild,
				placeholders
			)

			bunnyLog.info(
				`🔍 Built components: ${v2Components.length} V2, ${actionRows.length} action rows`
			)

			// Send V2 components if available
			if (v2Components.length > 0) {
				await interaction.reply({
					components: v2Components,
					flags:
						Discord.MessageFlags.IsComponentsV2 |
						Discord.MessageFlags.Ephemeral,
				})
				bunnyLog.success(
					'✅ Confirmation dialog sent successfully using V2 components'
				)
				return
			}

			// Send action row buttons if available (fallback)
			if (actionRows.length > 0) {
				await interaction.reply({
					components: actionRows,
					flags: Discord.MessageFlags.Ephemeral,
				})
				bunnyLog.success(
					'✅ Confirmation dialog sent successfully using action rows'
				)
				return
			}

			bunnyLog.warn(
				'⚠️ No buttons found in configuration template, falling back to hardcoded buttons'
			)
		} catch (error) {
			bunnyLog.error('❌ Error using configuration template:', error)
			// Fall through to hardcoded fallback
		}
	}

	// Fallback to hardcoded confirmation dialog if no template or error
	bunnyLog.info('🔧 Using fallback hardcoded confirmation buttons')

	const confirmcustom_id = ID.TICKET_CONFIRM_CLOSE(thread.id)

	bunnyLog.info('🔧 Creating confirmation button:')
	bunnyLog.info(`  ✅ Confirm button custom_id: ${confirmcustom_id}`)

	const confirmButton = new Discord.ButtonBuilder()
		.setCustomId(confirmcustom_id)
		.setLabel('Confirm Close')
		.setStyle(Discord.ButtonStyle.Danger)

	const actionRow =
		new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
			confirmButton
		)

	bunnyLog.info(
		`📤 Sending fallback confirmation dialog with action row containing ${actionRow.components.length} button`
	)

	try {
		await interaction.reply({
			content:
				'⚠️ **Are you sure you want to close this ticket?**\n\nThis action cannot be undone. The ticket will be archived and locked.',
			components: [actionRow],
			flags: Discord.MessageFlags.Ephemeral,
		})
		bunnyLog.success('✅ Fallback confirmation dialog sent successfully')
	} catch (error) {
		bunnyLog.error('❌ Failed to send confirmation dialog:', error)
		throw error
	}
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
	const reason =
		interaction.fields.getTextInputValue('close_reason') || 'No reason'
	const thread = interaction.channel as Discord.ThreadChannel
	await perfromClose(interaction, thread, reason)
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

	// Only respond if this is from modalClose (not from confirmClose which already responded)
	if (interaction.isModalSubmit()) {
		await utils.handleResponse(
			interaction,
			'success',
			'Ticket closed successfully.'
		)
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
		bunnyLog.warn('❌ No transcript channel configured, skipping transcript')
		bunnyLog.warn(
			'💡 Please configure transcript channel using `/ticket config` command'
		)
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
					: meta.claimed_by ?? 'Not claimed',
			category: meta.ticket_type ?? 'Support',
			thread_id: thread.id,
			guild_id: thread.guild.id,
			reason: meta.reason ?? 'No reason',
			rating: 'Not rated',
			open_time: `<t:${Math.floor((meta.open_time ?? Date.now()) / 1000)}>`,
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
				await transcriptChannel.send({
					components: v2Components,
					flags: Discord.MessageFlags.IsComponentsV2,
				})
				return
			}

			// Fallback: Send only action rows if V2 components failed (shouldn't happen normally)
			if (actionRows.length > 0) {
				await transcriptChannel.send({
					components: actionRows,
				})
				return
			}

			// If no components were generated, send error
			bunnyLog.error(
				'❌ No valid components generated from transcript configuration'
			)
			await transcriptChannel.send({
				content: `❌ **Component Error**\n\nFailed to generate transcript components for ticket #${placeholders.ticket_id}.\nPlease check transcript component configuration.\n\n**Thread:** <#${placeholders.thread_id}>`,
			})
		} catch (error) {
			bunnyLog.error('❌ Error using transcript configuration:', error)
			await transcriptChannel.send({
				content: `❌ **Error**\n\nFailed to process transcript configuration for ticket #${placeholders.ticket_id}.\nError: ${error.message}\n\n**Thread:** <#${placeholders.thread_id}>`,
			})
		}
	} catch (error) {
		bunnyLog.error('❌ Failed to send transcript:', error)
		// Try to send a minimal error message as last resort
		try {
			const transcriptChannel = await thread.guild.channels.fetch(
				cfg.transcript_channel_id
			)
			if (transcriptChannel?.isTextBased()) {
				await transcriptChannel.send({
					content: `❌ **Critical Error**\n\nFailed to send transcript for ticket #${meta.ticket_id}.\nError: ${error.message}\n\n**Thread:** <#${thread.id}>`,
				})
			}
		} catch (errorNotificationError) {
			bunnyLog.error(
				'❌ Failed to send error notification:',
				errorNotificationError
			)
		}
	}
}

/* -------------------------------------------------------------------------- */
/*                          ADMIN MESSAGE CLEANUP                            */
/* -------------------------------------------------------------------------- */

async function deleteAdminMessage(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	meta: ThreadMetadata
) {
	if (!meta.admin_channel_id || !meta.join_ticket_message_id) {
		bunnyLog.info(
			'❌ No admin message to delete (missing channel or message ID)'
		)
		return
	}

	try {
		const adminChannel = await interaction.guild.channels.fetch(
			meta.admin_channel_id
		)

		if (!adminChannel?.isTextBased()) {
			bunnyLog.warn('❌ Admin channel is not text-based or not found')
			return
		}

		await adminChannel.messages.delete(meta.join_ticket_message_id)
		bunnyLog.success(
			`✅ Deleted admin message ${meta.join_ticket_message_id} from ${meta.admin_channel_id}`
		)
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
		bunnyLog.warn('❌ No user ID found for rating DM')
		return
	}

	try {
		const user = await interaction.client.users.fetch(meta.opened_by.id)

		if (!user) {
			bunnyLog.warn('❌ User not found for rating DM')
			return
		}

		const cfg = await getConfig(interaction)

		// Check if rating_survey component configuration exists
		const ratingSurveyConfig = cfg.components?.rating_survey
		if (!ratingSurveyConfig) {
			bunnyLog.warn(
				'❌ No rating_survey component configuration found, sending simple DM'
			)

			bunnyLog.success('✅ Sent fallback rating DM to user')
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
				open_time: `<t:${Math.floor((meta.open_time ?? Date.now()) / 1000)}>`,
				close_time: `<t:${Math.floor((meta.close_time as Date).getTime() / 1000)}>`,
			}

			// Add rating button placeholders
			for (let i = 1; i <= 5; i++) {
				placeholders[`rate_${i}_custom_id`] = ID.TICKET_RATE(thread.id, i)
			}

			const { v2Components, actionRows } = buildUniversalComponents(
				ratingSurveyConfig,
				member,
				interaction.guild,
				placeholders
			)

			// Send V2 components if available
			if (v2Components.length > 0) {
				await user.send({
					components: v2Components,
					flags: Discord.MessageFlags.IsComponentsV2,
				})
				bunnyLog.success('✅ Sent rating DM with V2 components to user')
				return
			}

			// Send action row buttons if available (fallback)
			if (actionRows.length > 0) {
				await user.send({
					components: actionRows,
				})
				bunnyLog.success('✅ Sent rating DM with action rows to user')
				return
			}

			bunnyLog.warn(
				'⚠️ No valid components generated from rating survey configuration'
			)
		} catch (error) {
			bunnyLog.error('❌ Error using rating_survey configuration:', error)
			// Fall back to simple DM without configuration
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
