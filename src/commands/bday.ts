import type {
	CommandInteractionOptionResolver,
	Client,
	TextChannel,
	ChatInputCommandInteraction,
} from 'discord.js'
import { saveBirthday, getUsersWithBirthday } from '../api/bday'
import cron from 'node-cron'
import { getPluginConfig } from '../api/plugins'
import { bunnyLog } from 'bunny-log'
import { replacePlaceholders } from '../utils/replacePlaceholders'
import { handleError, handleSuccess } from '../utils/errorHandlers'

async function handleBdayCommand(
	interaction: ChatInputCommandInteraction
): Promise<void> {
	const options = interaction.options as CommandInteractionOptionResolver
	const day = options.getInteger('day', true)
	const month = options.getInteger('month', true)
	const year = options.getInteger('year', true)
	const user_id = interaction.user.id
	const guild_id = interaction.guildId as string

	const config = await getPluginConfig(
		interaction.client.user.id,
		guild_id,
		'birthday'
	)

	if (!config?.enabled) {
		await handleError(
			interaction,
			'HB001',
			'The birthday feature is currently disabled on this server.'
		)
		return
	}

	const current_year = new Date().getFullYear()
	const min_year = current_year - 100

	// Walidacja daty
	if (!isValidDate(day, month, year, min_year, current_year)) {
		await handleError(
			interaction,
			'HB002',
			`Invalid date. Please provide a valid date between ${min_year} and ${current_year}.`
		)
		return
	}

	// Zapis urodzin w bazie danych
	await saveBirthday(interaction.client.user.id, guild_id, user_id, {
		day,
		month,
		year,
	})
	await handleSuccess(
		interaction,
		`Birthday saved successfully.\n(${day}.${month}.${year})`
	)
}

const isValidDate = (
	day: number,
	month: number,
	year: number,
	min_year: number,
	current_year: number
): boolean => {
	// Sprawdzenie, czy data jest poprawna
	if (year < min_year || year > current_year) return false

	const date = new Date(year, month - 1, day)
	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	)
}

async function sendBirthdayMessage(bot: Client) {
	const today = new Date()
	const day = today.getDate()
	const month = today.getMonth() + 1 // Miesiące w JavaScript są zero-based

	for (const guild of bot.guilds.cache.values()) {
		try {
			const guild_id = guild.id

			// Pobranie konfiguracji pluginu 'birthday'
			const config = await getPluginConfig(bot.user.id, guild_id, 'birthday')
			if (!config?.enabled) {
				// bunnyLog.warn(
				// 	`Birthday plugin is disabled for guild ${guild.name} (${guild_id}).`
				// )
				continue
			}

			const channel_id = config.channel_id
			if (!channel_id) continue

			// Pobranie użytkowników, którzy mają dzisiaj urodziny
			const birthday_users = await getUsersWithBirthday(
				bot.user.id,
				guild_id,
				day,
				month
			)
			if (!birthday_users || birthday_users.length === 0) {
				// bunnyLog.warn(
				// 	`No users with birthdays today in guild ${guild.name} (${guild_id}).`
				// )
				continue
			}

			// Pobranie kanału
			const channel = bot.channels.cache.get(channel_id) as TextChannel
			if (!channel) {
				// bunnyLog.warn(
				// 	`Birthday channel not found for guild ${guild.name} (${guild_id}).`
				// )
				continue
			}

			// Przygotowanie i wysłanie wiadomości z życzeniami
			const birthday_messages = await Promise.all(
				birthday_users.map(async (user) => {
					// Fetch the user data from the guild to get the username
					const member = await guild.members.fetch(user.id)
					const userData = {
						id: member.id,
						username: member.user.username,
					}
					// Replace placeholders in the message with user and guild info
					return replacePlaceholders(config.message, userData, guild)
				})
			)

			await channel.send(birthday_messages.join('\n'))

			// bunnyLog.api(
			// 	`Sent birthday messages to ${birthday_users.length} users in guild ${guild.name} (${guild_id})`
			// )
		} catch (error) {
			// bunnyLog.error(
			// 	`Failed to send birthday messages in guild ${guild.name} (${guild.id}): ${error.message}`
			// )
		}
	}
}

function scheduleBirthdayCheck(bot: Client) {
	cron.schedule(
		'45 11 * * *', // Uruchom codziennie o 12:00 UTC - 2h
		() => {
			sendBirthdayMessage(bot)
		},
		{
			timezone: 'UTC',
		}
	)
}

export { handleBdayCommand, scheduleBirthdayCheck }
