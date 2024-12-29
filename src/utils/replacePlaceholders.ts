import type { GuildMember, Guild } from 'discord.js'

type UserType = GuildMember | { id: string; username: string }

/**
 * Replaces placeholders in a message string with actual values.
 * Supports both GuildMember and custom user objects with id and username.
 *
 * @param {string} message - The message string with placeholders.
 * @param {UserType} user - The member that joined the guild or custom user object.
 * @param {Guild} guild - The guild the user is in.
 * @returns {string} - The message with placeholders replaced.
 */
export function replacePlaceholders(
	message: string,
	user: UserType,
	guild: Guild
): string {
	// Ensure message is a valid string
	const validMessage = typeof message === 'string' ? message : '' // Default to an empty string if message is not a valid string

	// Sprawdzenie, czy użytkownik jest GuildMember
	const isGuildMember = (user: UserType): user is GuildMember =>
		'guild' in user && 'user' in user

	// Replace the placeholders with actual values
	let output = validMessage
		.replace('{user}', `<@${user.id}>`)
		.replace('{username}', isGuildMember(user) ? user.user.tag : user.username)
		.replace(
			'{avatar}',
			isGuildMember(user) ? user.user.displayAvatarURL() : ''
		)
		.replace('{server_name}', guild.name)
		.replace('{server_image}', guild.iconURL())
		.replace('{user_id}', user.id)
		.replace('{server_id}', guild.id)
		.replace(/{#(\d+)}/g, (_, channel_id) => {
			const channel = guild.channels.cache.get(channel_id)
			return channel ? `<#${channel.id}>` : `#${channel_id}`
		})

	// Replace channel and role mentions only if user is GuildMember
	if (isGuildMember(user)) {
		output = output
			.replace(/{#(\w+)}/g, (_, channel_name) => {
				const channel = guild.channels.cache.find(
					(ch) => ch.name === channel_name
				)
				return channel ? `<#${channel.id}>` : `#${channel_name}`
			})
			.replace(/{&(\w+)}/g, (_, role_name) => {
				const role = guild.roles.cache.find((r) => r.name === role_name)
				return role ? `<@&${role.id}>` : `@${role_name}`
			})
	}

	// Ensure newline characters are correctly interpreted
	output = output.replace(/\\n/g, '\n')

	return output
}
