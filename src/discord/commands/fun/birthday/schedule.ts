import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import cron from 'node-cron'
import { replacePlaceholders } from '@/utils/replacePlaceholders.js'
import type { ComponentsV2 } from '@/types/plugins.js'
import { BirthdayLogger, ServiceLogger } from '@/utils/bunnyLogger.js'

interface BirthdayUser {
	id: string
	birthday: {
		day: number
		month: number
		year: number
	}
}

/**
 * Send birthday announcements to users
 * @param client - The Discord client
 * @returns - Promise that resolves when the announcements are sent
 */
async function sendBirthdayAnnouncements(client: Discord.Client) {
	const today = new Date()
	const day = today.getDate()
	const month = today.getMonth() + 1

	await Promise.all(
		[...client.guilds.cache.values()].map(async (guild) => {
			try {
				const config = await api.getPluginConfig(
					client.user.id,
					guild.id,
					'birthday'
				)

				if (!config?.enabled || !config.channel_id) return

				const channel = guild.channels.cache.get(config.channel_id)
				if (!channel?.isTextBased()) return

				const birthdays = await api.getBirthdayUsers(
					client.user.id,
					guild.id,
					day,
					month
				)

				if (!birthdays.length) return

				await Promise.all(
					birthdays.map(async (birthdayUser: BirthdayUser) => {
						// Get the guild member
						const member = await guild.members.fetch(birthdayUser.id)
						if (!member) return

						// Calculate next birthday for timestamp
						const nextBirthday = new Date(
							today.getFullYear(),
							birthdayUser.birthday.month - 1,
							birthdayUser.birthday.day
						)
						if (nextBirthday < today) {
							nextBirthday.setFullYear(today.getFullYear() + 1)
						}
						const nextBirthdayTimestamp = Math.floor(
							nextBirthday.getTime() / 1000
						)

						// Create a copy of the components to avoid modifying the original
						const components = JSON.parse(JSON.stringify(config.components))

						// Replace placeholders in the components
						const replacedComponents = components.map(
							(component: ComponentsV2) => {
								if (component.type === Discord.ComponentType.Section) {
									return {
										type: Discord.ComponentType.Section,
										components: component.components.map((subComponent) => {
											if (
												subComponent.type === Discord.ComponentType.TextDisplay
											) {
												return {
													type: Discord.ComponentType.TextDisplay,
													content: replacePlaceholders(
														subComponent.content,
														member,
														guild,
														{
															next_birthday: nextBirthdayTimestamp.toString(),
														}
													),
												}
											}
											return subComponent
										}),
										accessory:
											component.accessory?.type ===
											Discord.ComponentType.Thumbnail
												? {
														type: Discord.ComponentType.Thumbnail,
														media: {
															url: member.user.displayAvatarURL({
																size: 4096,
																extension: 'png',
															}),
														},
													}
												: component.accessory,
									}
								}

								if (component.type === Discord.ComponentType.TextDisplay) {
									return {
										type: Discord.ComponentType.TextDisplay,
										content: replacePlaceholders(
											component.content,
											member,
											guild,
											{
												next_birthday: nextBirthdayTimestamp.toString(),
											}
										),
									}
								}

								return component
							}
						)

						await channel.send({
							components: replacedComponents,
							flags: Discord.MessageFlags.IsComponentsV2,
						})
					})
				)
			} catch (error) {
				BirthdayLogger.error(`Birthday announcement failed in ${guild.name}: ${error}`)
			}
		})
	)
}

/**
 * Schedule birthday announcements
 * @param client - The Discord client
 * @returns - Promise that resolves when the schedule is set up
 */
export async function scheduleBirthdayCheck(
	client: Discord.Client
): Promise<void> {
	// Aggregate enabled birthday plugin configurations across all guilds.
	const guilds = [...client.guilds.cache.values()]
	const results = await Promise.all(
		guilds.map(async (guild) => {
			const config = await api.getPluginConfig(
				client.user.id,
				guild.id,
				'birthday'
			)
			return config?.enabled && config.channel_id ? 1 : 0
		})
	)
	const enabledCount = results.reduce((sum, curr) => sum + curr, 0)

	// Only log if there are enabled guilds, otherwise it's just noise
	if (enabledCount > 0) {
		ServiceLogger.start(
			`🎂 Birthday plugin active for ${enabledCount} guild${enabledCount === 1 ? '' : 's'}`
		)
	}

	// Run daily at 9:00 AM UTC // + 2h
	cron.schedule('0 11 * * *', () => sendBirthdayAnnouncements(client), {
		timezone: 'UTC',
	})
}
