import type * as Discord from 'discord.js'

// TODO: Make better way to handle placeholders (maybe enums?)

type UserType = Discord.GuildMember | { id: string; username: string }

interface AdditionalPlaceholders {
	[key: string]: string | number | undefined
	ticket_id?: string | number
	category?: string
	thread_id?: string
	channel_id?: string
	claimed_by?: string
	open_time?: string | number
	mod_ping?: string
	// Birthday placeholders
	birthday_day?: number
	birthday_month?: number
	birthday_year?: number
	age?: number
	next_birthday?: string | number
}

/**
 * Replaces placeholders in a message string with actual values.
 * Supports both GuildMember and custom user objects with id and username.
 *
 * @param {string} message - The message string with placeholders.
 * @param {UserType} user - The member that joined the guild or custom user object.
 * @param {Discord.Guild} guild - The guild the user is in.
 * @param {AdditionalPlaceholders} additional - Additional placeholders to replace.
 * @returns {string} - The message with placeholders replaced.
 */
export function replacePlaceholders(
	message: string,
	user: Discord.GuildMember | Discord.PartialGuildMember,
	guild: Discord.Guild,
	additional: AdditionalPlaceholders = {}
): string {
	// Ensure message is a valid string
	const validMessage = typeof message === 'string' ? message : '' // Default to an empty string if message is not a valid string

	// Check if the user is a GuildMember
	const isGuildMember = (
		user: Discord.GuildMember | Discord.PartialGuildMember
	): user is Discord.GuildMember => 'guild' in user && 'user' in user

	// Add null checks for partial members
	const displayName = user.displayName || 'Unknown User'
	const username = user.user?.username || 'unknown'

	// Replace the placeholders with actual values
	let output = validMessage
		// Replace user
		.replace('{user}', `<@${user.id}>`)
		// Replace user name
		.replace('{username}', isGuildMember(user) ? user.user.tag : username)
		// replace user full name
		.replace('{display_name}', isGuildMember(user) ? displayName : username)
		// Replace user avatar
		.replace(
			'{avatar}',
			isGuildMember(user)
				? user.user.displayAvatarURL({ extension: 'png', size: 1024 })
				: ''
		)
		// Replace user avatar (alternative format)
		.replace(
			'{user_avatar}',
			isGuildMember(user)
				? user.user.displayAvatarURL({ extension: 'png', size: 1024 })
				: ''
		)
		// Replace opened_by with user mention
		.replace('{opened_by}', `<@${user.id}>`)
		// Replace server name
		.replace('{server_name}', guild.name)
		// Replace server image
		.replace('{server_image}', guild.iconURL?.() ?? '')
		// Replace user mentions
		.replace('{user_id}', user.id)
		// Replace server mentions
		.replace('{server_id}', guild.id)
		// Replace member count
		.replace('{member_count}', guild.memberCount.toString())
		// Replace channel mentions
		.replace(/{#(\d+)}/g, (_, channel_id) => {
			const channel = guild.channels.cache.get(channel_id)
			return channel ? `<#${channel.id}>` : `#${channel_id}`
		})

	// Replace channel and role mentions only if user is GuildMember
	if (isGuildMember(user)) {
		output = output
			// Replace channel mentions
			.replace(/{#(\w+)}/g, (_, channel_name) => {
				const channel = guild.channels.cache.find(
					(ch) => ch.name === channel_name
				)
				return channel ? `<#${channel.id}>` : `#${channel_name}`
			})
			// Replace role mentions
			.replace(/{&(\w+)}/g, (_, role_name) => {
				const role = guild.roles.cache.find((r) => r.name === role_name)
				return role ? `<@&${role.id}>` : `@${role_name}`
			})
	}

	// Replace additional placeholders
	for (const [key, value] of Object.entries(additional)) {
		if (value !== undefined) {
			output = output.replace(new RegExp(`{${key}}`, 'g'), value.toString())
		}
	}

	// Birthday-specific placeholder formatting using Discord timestamps
	if (
		additional.birthday_day &&
		additional.birthday_month &&
		additional.birthday_year
	) {
		// Create birthday date timestamp
		const birthdayDate = new Date(
			additional.birthday_year,
			additional.birthday_month - 1,
			additional.birthday_day
		)
		const birthdayTimestamp = Math.floor(birthdayDate.getTime() / 1000)

		// Replace birthday date formatted with Discord timestamp
		output = output.replace(/{birthday_date}/g, `<t:${birthdayTimestamp}:D>`)

		// Replace short birthday date with Discord timestamp
		output = output.replace(/{birthday_short}/g, `<t:${birthdayTimestamp}:d>`)

		// Calculate and replace age if not provided
		if (!additional.age) {
			const today = new Date()
			const birthDate = new Date(
				additional.birthday_year,
				additional.birthday_month - 1,
				additional.birthday_day
			)
			let calculatedAge = today.getFullYear() - birthDate.getFullYear()
			const monthDiff = today.getMonth() - birthDate.getMonth()

			if (
				monthDiff < 0 ||
				(monthDiff === 0 && today.getDate() < birthDate.getDate())
			) {
				calculatedAge--
			}

			output = output.replace(/{age}/g, calculatedAge.toString())
		}
	}

	// Format next_birthday timestamp if provided
	if (additional.next_birthday) {
		const timestamp = additional.next_birthday.toString()
		output = output.replace(/{next_birthday}/g, `<t:${timestamp}:D>`)
		output = output.replace(/{next_birthday_relative}/g, `<t:${timestamp}:R>`)
		output = output.replace(/{next_birthday_full}/g, `<t:${timestamp}:F>`)
	}

	// Ensure newline characters are correctly interpreted
	output = output.replace(/\\n/g, '\n')

	return output
}

/**
 * Replaces placeholders in component custom_ids.
 * This is a specialized version that only replaces specific placeholders that are allowed in custom_ids.
 *
 * @param {string} custom_id - The custom_id with placeholders.
 * @param {AdditionalPlaceholders} additional - Additional placeholders to replace.
 * @returns {string} - The custom_id with placeholders replaced.
 */
export function replacecustom_idPlaceholders(
	custom_id: string,
	additional: AdditionalPlaceholders = {}
): string {
	let output = custom_id

	// Only replace specific placeholders that are allowed in custom_ids
	const allowedPlaceholders = ['thread_id', 'ticket_id']

	for (const key of allowedPlaceholders) {
		const value = additional[key]
		if (value !== undefined) {
			output = output.replace(new RegExp(`{${key}}`, 'g'), value.toString())
		}
	}

	return output
}
