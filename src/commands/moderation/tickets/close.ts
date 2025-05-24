import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import * as utils from '@/utils/index.js'
import type { ThreadMetadata } from '@/types/tickets.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'
import { threadMetadataStore as store } from './state.js'
import { createTicketMessage } from './message.js'
import { ID } from '../../constants.js'
import * as V2 from 'discord-components-v2'
import { type PlaceholderMap, toTimestamp } from '@/components/ui-builder.js'

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
	if (!meta) return

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

	const placeholders: PlaceholderMap = {
		thread_id: thread.id,
		ticket_id: meta.ticket_id ?? 'unknown',
	}

	const confirmMsg = await createTicketMessage(
		await getConfig(interaction),
		'confirm_close_ticket',
		placeholders
	)

	if (!confirmMsg.content && !confirmMsg.components?.length) {
		confirmMsg.content = 'Are you sure you want to close this ticket?'
		confirmMsg.components = [
			V2.makeActionRow([
				V2.makeButton({
					custom_id: ID.TICKET_CONFIRM_CLOSE(thread.id),
					label: 'Confirm',
					style: Discord.ButtonStyle.Success,
				}),
				V2.makeButton({
					custom_id: ID.TICKET_CANCEL_CLOSE(thread.id),
					label: 'Cancel',
					style: Discord.ButtonStyle.Secondary,
				}),
			]),
		]
	}

	await interaction.reply({
		...confirmMsg,
		flags: Discord.MessageFlags.Ephemeral,
	})
}

export async function confirmClose(interaction: Discord.ButtonInteraction) {
	const thread = interaction.channel as Discord.ThreadChannel
	await perfromClose(
		interaction,
		thread,
		`Closed by ${interaction.user.username}`
	)
}

export async function cancelClose(interaction: Discord.ButtonInteraction) {
	await interaction.reply({
		content: 'Closing ticket cancelled.',
		flags: Discord.MessageFlags.Ephemeral,
	})
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

async function perfromClose(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	thread: Discord.ThreadChannel,
	reason: Discord.Snowflake
) {
	if (!thread?.isThread) return

	const meta = await ensureMeta(interaction, thread)
	if (!meta) return

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

	await thread.setLocked(true)
	await thread.setArchived(true)

	//FIXME: use componentV2
	await utils.handleResponse(
		interaction,
		'success',
		'Ticket closed successfully.'
	)
}

async function closedMessage(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	meta: ThreadMetadata
) {
	const cfg = await getConfig(interaction)
	const placeholders: PlaceholderMap = {
		ticket_id: meta.ticket_id ?? 'unknown',
		closed_by: `<@${meta.closed_by?.id}>`,
		close_time: toTimestamp(meta.close_time as Date),
		reason: meta.reason ?? 'No reason',
	}

	const msg = await createTicketMessage(cfg, 'closed_ticket', placeholders)
	if (!msg.content && !msg.components?.length)
		msg.content = `Ticket #${meta.ticket_id} closed.`
	return msg
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
	if (!cfg.transcript_channel_id) return

	const transcriptChannel = await thread.guild.channels.fetch(
		cfg.transcript_channel_id
	)
	if (!transcriptChannel.isTextBased()) return

	const placeholders: PlaceholderMap = {
		ticket_id: meta.ticket_id ?? 'unknown',
		opened_by: meta.opened_by ? `<@${meta.opened_by.id}>` : 'unknown',
		closed_by: `<@${meta.closed_by?.id}>`,
		claimed_by:
			typeof meta.claimed_by === 'object'
				? `<@${meta.claimed_by.id}>`
				: meta.claimed_by ?? 'Not claimed',
		category: meta.ticket_type ?? 'Support',
		thread_id: thread.id,
		reason: meta.reason ?? 'No reason',
		open_time: toTimestamp(meta.open_time ?? Date.now()),
		close_time: toTimestamp(meta.close_time ?? Date.now()),
	}

	const transcriptMsg = await createTicketMessage(
		cfg,
		'transcript',
		placeholders
	)
	if (!transcriptMsg.content && !transcriptMsg.components?.length) {
		transcriptMsg.content = `Transcript for ticket #${meta.ticket_id}`
		transcriptMsg.components = [
			V2.makeActionRow([
				V2.makeButton({
					label: 'See Transcript',
					style: Discord.ButtonStyle.Link,
					url: thread.url,
				}),
			]),
		]
	}

	await transcriptChannel.send(transcriptMsg)
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
	if (configCache.has(key))
		return configCache.get(key) as PluginResponse<DefaultConfigs['tickets']>
	const cfg = await api.getPluginConfig(i.client.user.id, key, 'tickets')
	configCache.set(key, cfg)
	return cfg
}
