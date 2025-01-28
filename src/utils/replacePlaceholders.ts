import type * as Discord from 'discord.js'

// TODO: Make better way to handle placeholders (maybe enums?)

type UserType = Discord.GuildMember | { id: string; username: string }

/**
 * Replaces placeholders in a message string with actual values.
 * Supports both GuildMember and custom user objects with id and username.
 *
 * @param {Discord.Snowflake} message - The message string with placeholders.
 * @param {UserType} user - The member that joined the guild or custom user object.
 * @param {Discord.Guild} guild - The guild the user is in.
 * @returns {Discord.Snowflake} - The message with placeholders replaced.
 */
export function replacePlaceholders(
	message: string,
	user: UserType,
	guild: Discord.Guild
): string {
	// Ensure message is a valid string
	const validMessage = typeof message === 'string' ? message : '' // Default to an empty string if message is not a valid string

	// Check if the user is a GuildMember
	const isGuildMember = (user: UserType): user is Discord.GuildMember =>
		'guild' in user && 'user' in user

	// Replace the placeholders with actual values
	let output = validMessage
		// Replace user
		.replace('{user}', `<@${user.id}>`)
		// Replace user name
		.replace('{username}', isGuildMember(user) ? user.user.tag : user.username)
		// Replace user avatar
		.replace(
			'{avatar}',
			isGuildMember(user) ? user.user.displayAvatarURL() : ''
		)
		// Replace server name
		.replace('{server_name}', guild.name)
		// Replace server image
		.replace('{server_image}', guild.iconURL() ?? '')
		// Replace user mentions
		.replace('{user_id}', user.id)
		// Replace server mentions
		.replace('{server_id}', guild.id)
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

	// Ensure newline characters are correctly interpreted
	output = output.replace(/\\n/g, '\n')

	return output
}
