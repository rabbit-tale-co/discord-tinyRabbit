import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'
import type { ClientUser, Guild, User } from 'discord.js'

/**
 * Zapisuje datę urodzin użytkownika w określonym serwerze (gildii) dla danego bota.
 * @param {ClientUser['id']} bot_id - ID bota.
 * @param {Guild['id']} guild_id - ID serwera (gildii).
 * @param {User['id']} user_id - ID użytkownika.
 * @param {Object} birthday - Szczegóły dotyczące urodzin.
 * @param {number} birthday.day - Dzień urodzin.
 * @param {number} birthday.month - Miesiąc urodzin.
 * @param {number} birthday.year - Rok urodzin.
 * @returns {Promise<string>} - Komunikat potwierdzający zapisanie lub aktualizację urodzin.
 */
async function saveBirthday(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	user_id: User['id'],
	birthday: { day: number; month: number; year: number }
): Promise<string> {
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
 * Pobiera użytkowników z określonym dniem i miesiącem urodzin na serwerze (gildii) dla danego bota.
 * @param {ClientUser['id']} bot_id - ID bota.
 * @param {Guild['id']} guild_id - ID serwera (gildii).
 * @param {number} day - Dzień urodzin.
 * @param {number} month - Miesiąc urodzin.
 * @returns {Promise<{ id: string; birthday: { day: number; month: number; year: number } }[]>} - Lista użytkowników z określonymi urodzinami.
 */
async function getUsersWithBirthday(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
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
 * Waliduje, czy podana data jest prawidłowa.
 * @param {number} day - Dzień urodzin.
 * @param {number} month - Miesiąc urodzin.
 * @param {number} year - Rok urodzin.
 * @returns {boolean} - Zwraca true, jeśli data jest prawidłowa, w przeciwnym razie false.
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
