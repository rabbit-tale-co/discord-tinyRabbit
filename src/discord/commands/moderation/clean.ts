import * as Discord from 'discord.js'
import { handleResponse } from '@/utils/responses.js'
import { CommandLogger, StatusLogger } from '@/utils/bunnyLogger.js'

export async function cleanMessages(
	interaction: Discord.ChatInputCommandInteraction
) {
	const user = interaction.user.username
	const guild = interaction.guild?.name || 'Unknown Guild'
	const amount = interaction.options.getInteger('amount', true)

	// Log command execution
	CommandLogger.execute('clean', user, guild)

	try {
		await interaction.deferReply({ ephemeral: true })
		const channel = interaction.channel

		if (!(channel instanceof Discord.TextChannel)) {
			CommandLogger.error('clean', new Error('Command used in non-text channel'))
			return handleResponse(
				interaction,
				'error',
				'This command can only be used in text channels',
				{ code: 'CL001' }
			)
		}

		// Log the moderation action
		StatusLogger.info(`Fetching ${amount} messages for deletion in ${channel.name}`)
		const messages = await channel.messages.fetch({ limit: amount })

		// Perform bulk delete
		await channel.bulkDelete(messages)

		// Log successful moderation action
		StatusLogger.info(`${messages.size} messages purged by ${user} in ${guild}`)
		StatusLogger.success(`Successfully deleted ${messages.size} messages in ${channel.name}`)

		handleResponse(
			interaction,
			'success',
			`Deleted ${messages.size} messages :)`,
			{ ephemeral: true }
		)

		// Auto-delete reply after 5 seconds
		setTimeout(() => {
			interaction.deleteReply()
			StatusLogger.debug(`Clean command reply auto-deleted for ${user}`)
		}, 5_000)

	} catch (error) {
		// Enhanced error logging
		const errorMsg = error instanceof Error ? error.message : String(error)
		CommandLogger.error('clean', error instanceof Error ? error : new Error(errorMsg))
		StatusLogger.error(`Failed to delete messages in ${guild}`, error instanceof Error ? error : new Error(errorMsg))

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
