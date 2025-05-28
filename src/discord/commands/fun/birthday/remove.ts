import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import { bunnyLog } from 'bunny-log'
import { handleResponse } from '@/utils/responses.js'

/**
 * Remove a user's birthday
 * @param interaction - The interaction object
 * @returns - Promise that resolves when the birthday is removed
 */
export async function removeBirthday(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		await interaction.deferReply({
			flags: Discord.MessageFlags.Ephemeral,
		})

		await api.deleteBirthday(
			interaction.client.user.id,
			interaction.guildId as Discord.Guild['id'],
			interaction.user.id
		)

		const components = [
			{
				type: Discord.ComponentType.Section,
				components: [
					{
						type: Discord.ComponentType.TextDisplay,
						content: '## Birthday Removed',
					},
					{
						type: Discord.ComponentType.TextDisplay,
						content: '✅ Your birthday has been successfully removed',
					},
				],
				accessory: {
					type: Discord.ComponentType.Thumbnail,
					media: {
						url: interaction.user.displayAvatarURL({ size: 4096 }),
					},
				},
			},
		]

		await interaction.editReply({
			components: components,
			flags:
				Discord.MessageFlags.Ephemeral | Discord.MessageFlags.IsComponentsV2,
		})
	} catch (error) {
		bunnyLog.error('Failed to remove birthday:', error)
		handleResponse(interaction, 'error', 'Failed to remove birthday', {
			code: 'BD005',
		})
	}
}
