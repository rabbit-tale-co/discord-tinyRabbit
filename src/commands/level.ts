import type * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'

export async function showLevel(
	inter: Discord.ChatInputCommandInteraction
): Promise<void> {
	// TODO: Implement show level logic
	await utils.handleResponse(
		inter,
		'info',
		'Show level command is not implemented yet.'
	)
}

export async function setLevel(
	inter: Discord.ChatInputCommandInteraction
): Promise<void> {
	// TODO: Implement set level logic
	await utils.handleResponse(
		inter,
		'info',
		'Set level command is not implemented yet.'
	)
}
