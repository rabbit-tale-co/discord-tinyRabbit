import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import { handleResponse } from '@/utils/responses.js'

/**
 * Show a user's birthday
 * @param interaction - The interaction object
 * @returns - Promise that resolves when the birthday is retrieved
 */
export async function showBirthday(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		await interaction.deferReply({
			flags: Discord.MessageFlags.Ephemeral,
		})

		const data = await api.getBirthday(
			interaction.client.user.id,
			interaction.guildId as Discord.Guild['id'],
			interaction.user.id
		)

		if (!data) {
			const components = [
				{
					type: Discord.ComponentType.Section,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							content: '## Birthday Information',
						},
						{
							type: Discord.ComponentType.TextDisplay,
							content:
								'❌ No birthday set for this user\nUse `/birthday set` to set your birthday!',
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
			return
		}

		// Calculate age if year is provided
		const today = new Date()
		const age = today.getFullYear() - data.year
		const hasHadBirthdayThisYear =
			today.getMonth() + 1 > data.month ||
			(today.getMonth() + 1 === data.month && today.getDate() >= data.day)
		const currentAge = hasHadBirthdayThisYear ? age : age - 1

		// Calculate next birthday
		const nextBirthday = new Date(today.getFullYear(), data.month - 1, data.day)
		if (nextBirthday < today) {
			nextBirthday.setFullYear(today.getFullYear() + 1)
		}

		// Get Unix timestamps
		const birthdayDate = new Date(data.year, data.month - 1, data.day)
		const birthdayTimestamp = Math.floor(birthdayDate.getTime() / 1000)
		const nextBirthdayTimestamp = Math.floor(nextBirthday.getTime() / 1000)

		const components = [
			{
				type: Discord.ComponentType.Section,
				components: [
					{
						type: Discord.ComponentType.TextDisplay,
						content: '## Birthday Information',
					},
					{
						type: Discord.ComponentType.TextDisplay,
						content:
							`- 🎂 **Birthday**: <t:${birthdayTimestamp}:D>\n` +
							`- 🎈 **Age**: ${currentAge} years old\n` +
							`- 🎉 **Next Birthday**: <t:${nextBirthdayTimestamp}:D> (<t:${nextBirthdayTimestamp}:R>)`,
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
		StatusLogger.error(`Failed to fetch birthday: ${error instanceof Error ? error.message : String(error)}`)
		handleResponse(interaction, 'error', 'Failed to retrieve birthday', {
			code: 'BD004',
		})
	}
}
