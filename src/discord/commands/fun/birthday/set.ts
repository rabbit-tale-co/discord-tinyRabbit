import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import { bunnyLog } from 'bunny-log'
import { handleResponse } from '@/utils/responses.js'

interface BirthdayData {
	day: number
	month: number
	year: number
}

/**
 * Validate if the provided date is valid
 * @param birthday - The birthday data
 * @returns - Returns true if the date is valid, otherwise false
 */
function isValidDate(birthday: BirthdayData): boolean {
	const date = new Date(birthday.year, birthday.month - 1, birthday.day)
	return (
		date.getFullYear() === birthday.year &&
		date.getMonth() === birthday.month - 1 &&
		date.getDate() === birthday.day
	)
}

/**
 * Set a user's birthday
 * @param interaction - The interaction object
 * @returns - Promise that resolves when the birthday is saved
 */
export async function setBirthday(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		await interaction.deferReply({
			flags: Discord.MessageFlags.Ephemeral,
		})

		const day = interaction.options.getInteger('day', true)
		const month = interaction.options.getInteger('month', true)
		const year = interaction.options.getInteger('year', true)

		if (!isValidDate({ day, month, year })) {
			return handleResponse(
				interaction,
				'error',
				'Please provide a valid date',
				{
					code: 'BD001',
				}
			)
		}

		await api.saveBirthday(
			interaction.client.user.id,
			interaction.guildId as Discord.Guild['id'],
			interaction.user.id,
			{ day, month, year }
		)

		// Create components array for success message
		const components = [
			{
				type: Discord.ComponentType.Section,
				components: [
					{
						type: Discord.ComponentType.TextDisplay,
						content: '## Birthday Set Successfully',
					},
					{
						type: Discord.ComponentType.TextDisplay,
						content: `🎂 Your birthday has been set to:\n📅 **${day}/${month}/${year}**`,
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
		bunnyLog.error('Failed to set birthday:', error)
		handleResponse(interaction, 'error', 'Failed to set birthday', {
			code: 'BD002',
		})
	}
}
