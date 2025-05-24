import type * as Discord from 'discord.js'
import * as commands from '@/commands/index.js'
import { PLUGINS } from '@/commands/constants.js'
import * as api from '@/api/index.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'

type ChannelSelectHandler = (
	inter: Discord.ChannelSelectMenuInteraction
) => Promise<void>

interface ChannelSelectStructure {
	handler: ChannelSelectHandler
}

// Channel select menu map structure for different menu types
const channelSelectMap: Record<string, ChannelSelectStructure> = {
	ticket: {
		handler: async (inter: Discord.ChannelSelectMenuInteraction) => {
			if (
				inter.customId === 'ticket_admin_channel_select' ||
				inter.customId === 'ticket_transcript_channel_select'
			) {
				await commands.ticket.config(inter)
				return
			}
		},
	},
}

export async function channelSelectInteractionHandler(
	inter: Discord.ChannelSelectMenuInteraction
): Promise<void> {
	// Extract the base identifier from the customId
	const baseId = inter.customId.split('_')[0]

	const channelSelectConfig = channelSelectMap[baseId]
	if (!channelSelectConfig) return

	await channelSelectConfig.handler(inter)
}

/* -------------------------------------------------------------------------- */
/*                            CHANNEL HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleAdminChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	await inter.deferUpdate()

	const channel = inter.values[0]
	const ticketConfig = (await api.getPluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets'
	)) as PluginResponse<DefaultConfigs['tickets']>

	ticketConfig.admin_channel_id = channel

	await api.updatePluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets',
		ticketConfig
	)

	await utils.handleResponse(
		inter,
		'success',
		`Admin channel set to <#${channel}>`
	)
}

async function handleTranscriptChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	await inter.deferUpdate()

	const channel = inter.values[0]
	const ticketConfig = (await api.getPluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets'
	)) as PluginResponse<DefaultConfigs['tickets']>

	ticketConfig.transcript_channel_id = channel

	await api.updatePluginConfig(
		inter.client.user.id,
		inter.guild?.id as Discord.Guild['id'],
		'tickets',
		ticketConfig
	)

	await utils.handleResponse(
		inter,
		'success',
		`Transcript channel set to <#${channel}>`
	)
}
