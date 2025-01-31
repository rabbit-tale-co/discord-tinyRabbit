import { bunnyLog } from 'bunny-log'
import supabase from '@/db/supabase.js'
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
async function getBirthdayUsers(
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
 * Delete a user's birthday from the database
 * @param {Discord.ClientUser['id']} bot_id - Bot ID
 * @param {Discord.Guild['id']} guild_id - Guild ID
 * @param {Discord.User['id']} user_id - User ID
 */
async function deleteBirthday(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
): Promise<void> {
	const { error } = await supabase
		.from('user_bdays')
		.delete()
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('user_id', user_id)

	if (error) throw new Error('Failed to delete birthday')
}

/**
 * Get a user's birthday from the database
 * @param {Discord.ClientUser['id']} bot_id - Bot ID
 * @param {Discord.Guild['id']} guild_id - Guild ID
 * @param {Discord.User['id']} user_id - User ID
 */
async function getBirthday(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
): Promise<{ day: number; month: number; year: number } | null> {
	const { data, error } = await supabase
		.from('user_bdays')
		.select('birthday')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('user_id', user_id)
		.single()

	if (error) return null
	return data?.birthday || null
}

export { saveBirthday, getBirthdayUsers, deleteBirthday, getBirthday }
