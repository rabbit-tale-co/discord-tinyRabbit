import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import cron from 'node-cron'
import { bunnyLog } from 'bunny-log'
import { replacePlaceholders } from '@/utils/replacePlaceholders.js'
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
async function setBirthday(
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

		handleResponse(
			interaction,
			'success',
			`Birthday set to ${day}/${month}/${year}`
		)
	} catch (error) {
		bunnyLog.error('Failed to set birthday:', error)
		handleResponse(interaction, 'error', 'Failed to set birthday', {
			code: 'BD002',
		})
	}
}

/**
 * Show a user's birthday
 * @param interaction - The interaction object
 * @returns - Promise that resolves when the birthday is retrieved
 */
async function showBirthday(
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
			return handleResponse(
				interaction,
				'info',
				'No birthday set for this user',
				{ code: 'BD003' }
			)
		}

		handleResponse(
			interaction,
			'success',
			`Birthday: ${data.day}/${data.month}/${data.year}`
		)
	} catch (error) {
		bunnyLog.error('Failed to fetch birthday:', error)
		handleResponse(interaction, 'error', 'Failed to retrieve birthday', {
			code: 'BD004',
		})
	}
}

/**
 * Remove a user's birthday
 * @param interaction - The interaction object
 * @returns - Promise that resolves when the birthday is removed
 */
async function removeBirthday(
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

		handleResponse(interaction, 'success', 'Birthday removed successfully')
	} catch (error) {
		bunnyLog.error('Failed to remove birthday:', error)
		handleResponse(interaction, 'error', 'Failed to remove birthday', {
			code: 'BD005',
		})
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

				const messages = await Promise.all(
					birthdays.map(async (user) => {
						const member = await guild.members.fetch(user.id)
						return replacePlaceholders(
							config.message || 'Happy birthday {user}! 🎉',
							member,
							guild
						)
					})
				)

				await channel.send(messages.join('\n'))
			} catch (error) {
				bunnyLog.error(`Birthday announcement failed in ${guild.name}:`, error)
			}
		})
	)
}

async function scheduleBirthdayCheck(client: Discord.Client): Promise<void> {
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
	bunnyLog.server(`Birthday plugin scheduled for ${enabledCount} guild(s)`)

	// Run daily at 9:00 AM UTC
	cron.schedule('0 9 * * *', () => sendBirthdayAnnouncements(client), {
		timezone: 'UTC',
	})
}

export { setBirthday, showBirthday, removeBirthday, scheduleBirthdayCheck }
