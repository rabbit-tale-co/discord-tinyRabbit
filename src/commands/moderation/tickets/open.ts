import { loadCfg } from './limits.js'
import type { PlaceholderMap } from '@/components/ui-builder.js'
import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/api/index.js'
import * as limits from './limits.js'
import { threadMetadataStore as store } from './state.js'
import { createTicketMessage } from '../tickets.js'
import type { ThreadMetadata } from '@/types/tickets.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'

/* -------------------------------------------------------------------------- */
/*                               PUBLIC ENTRY                                 */
/* -------------------------------------------------------------------------- */

export async function openTicket(inter: Discord.ButtonInteraction) {
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'OT 001' }
		)
		return
	}

	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	const cfg = await loadCfg(inter)
	if (!cfg.enabled) {
		await utils.handleResponse(
			inter,
			'error',
			'Tickets are not enabled on this server',
			{ code: 'OT 002' }
		)
		return
	}

	/* ------------------------------------------------------ */
	/*                  ROLE‑BASED COOL‑DOWN                  */
	/* ------------------------------------------------------ */
	const lastOpen = await api.getLastUserTicketOpen(
		inter.client.user.id,
		inter.guild.id,
		inter.user.id
	) // TODO: add function to API

	const cdResult = await limits.canUserOpenTicket(
		inter.member as Discord.GuildMember,
		cfg,
		lastOpen
	)
	if (!cdResult.allowed) {
		const when = `<t:${Math.floor(cdResult.retryAt / 1_000)}:R>`
		await utils.handleResponse(
			inter,
			'error',
			`You have to wait ${cdResult.limit} to open another ticket. Try again in ${when}`,
			{ code: 'OT 003' }
		)
		return
	}

	/* ------------------------------------------------------ */
	/*                  RESOLVE TICKET CATEGORY               */
	/* ------------------------------------------------------ */
	const category = resolveCategory(inter.customId, cfg) ?? 'General Support'

	/* ------------------------------------------------------ */
	/*                OBTAIN NEXT TICKET NUMBER               */
	/* ------------------------------------------------------ */
	const ticket_id = await api.getTicketCounter(
		inter.client.user.id,
		inter.guild.id
	)
	if (!ticket_id) {
		await utils.handleResponse(inter, 'error', 'Failed to get ticket counter', {
			code: 'OT 004',
		})
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

	/**
	 * Saving meta data
	 */

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
	store.set(thread.id, meta)
	await api.saveTicketMetadata(
		inter.client.user.id,
		inter.guild.id,
		thread.id,
		meta,
		[]
	)
	await api.incrementTicketCounter(inter.client.user.id, inter.guild.id)

	/* ------------------------------------------------------ */
	/*                 SEND TEMPLATE MESSAGES                 */
	/* ------------------------------------------------------ */
	const placeholders: PlaceholderMap = {
		ticket_id: ticket_id.toString(),
		ticket_type: category,
		opened_by: inter.user.toString(),
		thread_id: thread.id,
	}

	// message in thread
	const threadMsg = await createTicketMessage(
		cfg,
		'opened_ticket',
		placeholders
	)
	if (!threadMsg.content && !threadMsg.embeds?.length) {
		threadMsg.content = `# 🎫 Ticket ${ticket_id} - ${category}`
	}
}

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function resolveCategory(
	custom_id: Discord.ButtonInteraction['customId'],
	cfg: PluginResponse<DefaultConfigs['tickets']>
): Discord.Snowflake | undefined {
	const maps = [
		cfg.components.open_ticket?.embed.buttons_map,
		cfg.embeds.open_ticket?.buttons_map,
	] as const

	for (const list of maps) {
		for (const btn of list ?? []) {
			if (custom_id.startsWith(btn.unique_id)) return btn.label
		}
	}
	return undefined
}

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
