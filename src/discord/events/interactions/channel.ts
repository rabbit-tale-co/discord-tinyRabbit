import type * as Discord from 'discord.js'
import * as commands from '@/discord/commands/index.js'
import { config as centralizedConfig } from '@/discord/commands/config/index.js'
import * as api from '@/discord/api/index.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, PluginResponse } from '@/types/plugins.js'

type ChannelSelectHandler = (
	inter: Discord.ChannelSelectMenuInteraction
) => Promise<void>

interface ChannelSelectStructure {
	handler: ChannelSelectHandler
}

// Channel select menu map structure for different menu types (non-config interactions only)
const channelSelectMap: Record<string, ChannelSelectStructure> = {
	// Reserved for future non-config channel selects
	// ticket: { handler: ... }, - now handled by centralized config
}

export async function channelSelectInteractionHandler(
	inter: Discord.ChannelSelectMenuInteraction
): Promise<void> {
	// For all configuration-related channel selects, delegate to centralized config
	if (
		inter.customId.startsWith('tickets:') ||
		inter.customId.startsWith('starboard_') ||
		inter.customId.startsWith('starboard:') ||
		inter.customId.includes('_channel_select') ||
		inter.customId.includes('config')
	) {
		await centralizedConfig(inter)
		return
	}

	// Extract the base identifier from the customId for non-config interactions
	const baseId = inter.customId.split('_')[0]

	const channelSelectConfig = channelSelectMap[baseId]
	if (!channelSelectConfig) {
		// If no specific handler found, log and ignore
		console.log(
			`[Channel Select] No handler found for customId: ${inter.customId}`
		)
		return
	}

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
