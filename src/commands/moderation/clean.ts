import * as Discord from 'discord.js'
import { handleResponse } from '../../utils/responses.js'

export async function cleanMessages(
	interaction: Discord.ChatInputCommandInteraction
) {
	try {
		await interaction.deferReply({ ephemeral: true })

		const amount = interaction.options.getInteger('amount', true)
		const channel = interaction.channel

		if (!(channel instanceof Discord.TextChannel)) {
			return handleResponse(
				interaction,
				'error',
				'This command can only be used in text channels',
				{ code: 'CL001' }
			)
		}

		const messages = await channel.messages.fetch({ limit: amount })
		await channel.bulkDelete(messages)

		handleResponse(
			interaction,
			'success',
			`Deleted ${messages.size} messages :)`,
			{ ephemeral: true }
		)

		setTimeout(() => {
			interaction.deleteReply()
		}, 5_000)
	} catch (error) {
		handleResponse(
			interaction,
			'error',
			'Failed to delete messages. Check permissions.',
			{
				code: 'CL002',
				error: error instanceof Error ? error : new Error(String(error)),
			}
		)
	}
}
