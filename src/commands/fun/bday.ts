import type * as Discord from 'discord.js'
import { saveBirthday, getUsersWithBirthday } from '../../api/bday.js'
import cron from 'node-cron'
import { getPluginConfig } from '../../api/plugins.js'
import { bunnyLog } from 'bunny-log'
import { replacePlaceholders } from '../../utils/replacePlaceholders.js'
import { handleResponse } from '../../utils/responses.js'

async function handleBdayCommand(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	// Get the options from the interaction
	const options =
		interaction.options as Discord.CommandInteractionOptionResolver

	// Get the day, month, and year from the options
	const day = options.getInteger('day', true)
	const month = options.getInteger('month', true)
	const year = options.getInteger('year', true)

	// Get the user ID and guild ID
	const user_id = interaction.user.id
	const guild_id = interaction.guildId as string

	// Get the plugin config
	const config = await getPluginConfig(
		interaction.client.user.id,
		guild_id,
		'birthday'
	)

	// Check if the plugin is enabled
	if (!config?.enabled) {
		await handleResponse(
			interaction,
			'warning',
			'The birthday feature is currently disabled on this server.',
			{
				code: 'HB001',
			}
		)
		return
	}

	// Get the current year and the minimum year
	const current_year = new Date().getFullYear()
	const min_year = current_year - 100

	// Validate the date
	if (!isValidDate(day, month, year, min_year, current_year)) {
		await handleResponse(
			interaction,
			'error',
			`Invalid date. Please provide a valid date between ${min_year} and ${current_year}.`,
			{
				code: 'HB002',
			}
		)
		return
	}

	// Save the birthday in the database
	await saveBirthday(interaction.client.user.id, guild_id, user_id, {
		day,
		month,
		year,
	})

	// Send a success message
	await handleResponse(
		interaction,
		'success',
		`Birthday saved successfully.\n(${day}.${month}.${year})`
	)
}

// Validate the date
const isValidDate = (
	day: number,
	month: number,
	year: number,
	min_year: number,
	current_year: number
): boolean => {
	// Check if the date is valid
	if (year < min_year || year > current_year) return false

	// Create a date object
	const date = new Date(year, month - 1, day)

	// Check if the date is valid
	return (
		date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
	)
}

/**
 * Send birthday messages to users with birthdays today
 * @param bot - The Discord client
 */
async function sendBirthdayMessage(bot: Discord.Client) {
	// Get the current date
	const today = new Date()
	const day = today.getDate()
	const month = today.getMonth() + 1 // Months in JavaScript are zero-based

	for (const guild of bot.guilds.cache.values()) {
		try {
			const guild_id = guild.id

			// Get the plugin config
			const config = await getPluginConfig(
				bot.user?.id as Discord.ClientUser['id'],
				guild_id,
				'birthday'
			)

			// Check if the plugin is enabled
			if (!config?.enabled) {
				// bunnyLog.warn(
				// 	`Birthday plugin is disabled for guild ${guild.name} (${guild_id}).`
				// )
				continue
			}

			// Get the channel ID
			const channel_id = config.channel_id
			if (!channel_id) continue

			// Get the users with birthdays today
			const birthday_users = await getUsersWithBirthday(
				bot.user?.id as Discord.ClientUser['id'],
				guild_id,
				day,
				month
			)

			// Check if there are no users with birthdays today
			if (!birthday_users || birthday_users.length === 0) {
				// bunnyLog.warn(
				// 	`No users with birthdays today in guild ${guild.name} (${guild_id}).`
				// )
				continue
			}

			// Get the channel
			const channel = bot.channels.cache.get(channel_id) as Discord.TextChannel
			if (!channel) {
				// bunnyLog.warn(
				// 	`Birthday channel not found for guild ${guild.name} (${guild_id}).`
				// )
				continue
			}

			// Prepare and send the birthday messages
			const birthday_messages = await Promise.all(
				birthday_users.map(async (user) => {
					// Fetch the user data from the guild to get the username
					const member = await guild.members.fetch(user.id)
					const userData = {
						id: member.id,
						username: member.user.username,
					}
					// Replace placeholders in the message with user and guild info
					return replacePlaceholders(
						config.message as Discord.Snowflake, // FIXME: find better way to type this?
						userData,
						guild
					)
				})
			)

			// Send the birthday messages
			await channel.send(birthday_messages.join('\n'))
		} catch (error) {
			// Log the error
			bunnyLog.error(
				`Failed to send birthday messages in guild ${guild.name} (${guild.id}): ${error.message}`
			)
		}
	}
}

function scheduleBirthdayCheck(bot: Discord.Client) {
	cron.schedule(
		'0 12 * * *', // Run daily at 12:00 UTC - 2h
		() => {
			sendBirthdayMessage(bot)
		},
		{
			timezone: 'UTC',
		}
	)
}

export { handleBdayCommand, scheduleBirthdayCheck }
