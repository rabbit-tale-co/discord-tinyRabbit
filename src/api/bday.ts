import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'
import type * as Discord from 'discord.js'

/**
 * Save user birthday in specified server (guild) for a given bot.
 * @param {Discord.ClientUser['id']} bot_id - ID bot.
 * @param {Discord.Guild['id']} guild_id - ID server (guild).
 * @param {Discord.User['id']} user_id - ID user.
 * @param {Object} birthday - Birthday details.
 * @param {number} birthday.day - Day of birth.
 * @param {number} birthday.month - Month of birth.
 * @param {number} birthday.year - Year of birth.
 * @returns {Promise<void>} - Promise that resolves when the birthday is saved.
 */
async function saveBirthday(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id'],
	birthday: { day: number; month: number; year: number }
): Promise<void> {
	if (!isValidDate(birthday.day, birthday.month, birthday.year)) {
		throw new Error('Invalid date provided.')
	}

	const { data, error } = await supabase
		.from('user_bdays')
		.upsert(
			{
				bot_id,
				guild_id,
				user_id,
				birthday,
			},
			{
				onConflict: 'bot_id,guild_id,user_id',
			}
		)
		.select()

	if (error) {
		throw new Error('Failed to save birthday.')
	}
}

/**
 * Get users with specified birthday day and month on a server (guild) for a given bot.
 * @param {Discord.ClientUser['id']} bot_id - ID bot.
 * @param {Discord.Guild['id']} guild_id - ID server (guild).
 * @param {number} day - Day of birth.
 * @param {number} month - Month of birth.
 * @returns {Promise<{ id: string; birthday: { day: number; month: number; year: number } }[]>} - List of users with specified birthdays.
 */
async function getUsersWithBirthday(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	day: number,
	month: number
): Promise<
	{ id: string; birthday: { day: number; month: number; year: number } }[]
> {
	const { data: users_data, error } = await supabase
		.from('user_bdays')
		.select('user_id, birthday')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('birthday->day', day)
		.eq('birthday->month', month)

	if (error) {
		bunnyLog.error('Error fetching users with birthday:', error)
		throw new Error('Failed to fetch users.')
	}

	return users_data.map((user) => ({
		id: user.user_id,
		birthday: user.birthday,
	}))
}

/**
 * Validate if the provided date is valid.
 * @param {number} day - Day of birth.
 * @param {number} month - Month of birth.
 * @param {number} year - Year of birth.
 * @returns {boolean} - Returns true if the date is valid, otherwise false.
 */
function isValidDate(day: number, month: number, year: number): boolean {
	const parsed_day = Number.parseInt(day.toString().replace(/^0+/, ''), 10)
	const parsed_month = Number.parseInt(month.toString().replace(/^0+/, ''), 10)

	const date = new Date(year, parsed_month - 1, parsed_day)
	return (
		date.getFullYear() === year &&
		date.getMonth() === parsed_month - 1 &&
		date.getDate() === parsed_day
	)
}

export { saveBirthday, getUsersWithBirthday }
