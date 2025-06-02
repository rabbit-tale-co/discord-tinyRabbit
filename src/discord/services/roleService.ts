import * as api from '@/discord/api/index.js'
import type * as Discord from 'discord.js'
import { LevelUpResult } from '@/utils/index.js'
import type { LevelStatus } from '@/types/levels.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'

/**
 * Updates a member's roles based on their level.
 *
 * @param {Discord.ClientUser['id']} bot_id - The bot client object.
 * @param {Discord.Guild} guild - The guild where the user is a member.
 * @param {Discord.User} user - The user to update.
 * @param {LevelStatus} userData - The user data including level, levelUp, and levelDown flags.
 */
async function updateMemberRoles(
	bot_id: Discord.ClientUser['id'],
	guild: Discord.Guild,
	user: Discord.User,
	userData: LevelStatus
) {
	try {
		// Fetch the 'levels' plugin configuration for the guild
		const config = await api.getPluginConfig(bot_id, guild.id, 'levels')

		// Check if level roles are defined in the configuration
		if (!config || !config.reward_roles) {
			// StatusLogger.error(`No role mappings found in config for guild ${guild.id}`)
			return
		}

		// Get the reward roles and channel ID from the config
		const { reward_roles, channel_id } = config

		// Sort the roles by level in descending order
		const sortedRoles = reward_roles.sort((a, b) => b.level - a.level)

		// StatusLogger.info(`Reward roles: ${JSON.stringify(reward_roles)}`)

		// Fetch the member from the guild
		const member = await guild.members.fetch(user.id)

		// Find the highest role the user qualifies for
		const newRole = sortedRoles.find((role) => userData.level >= role.level)
		if (!newRole) {
			// StatusLogger.warn(`No role found for user ${user.id} in guild ${guild.id}`)
			return
		}

		// Fetch the new role from the guild
		const newRoleObject = await guild.roles.fetch(newRole.role_id)
		if (!newRoleObject) {
			// StatusLogger.error(
			// 	`Role with ID ${newRole.role_id} not found in guild ${guild.id}`
			// )
			return
		}

		// Check if the user already has the correct role
		const hasNewRole = member.roles.cache.has(newRole.role_id)

		// If the user already has the correct role, return
		if (hasNewRole) return

		// Log the new role
		StatusLogger.debug(`New role: ${newRole.role_id}`)

		// Remove all roles that are no longer applicable
		const rolesToRemove = sortedRoles
			.filter((role) => role.role_id !== newRole.role_id)
			.map((role) => role.role_id)

		// Log the roles to remove
		StatusLogger.debug(`Roles to remove: ${JSON.stringify(rolesToRemove)}`)

		// Assign the new role
		try {
			// If there are roles to remove, remove them
			if (rolesToRemove.length > 0) {
				// StatusLogger.info(
				// 	`Attempting to remove roles: ${JSON.stringify(rolesToRemove)}`
				// )
				await member.roles.remove(rolesToRemove)
				// StatusLogger.info('Roles removed successfully')
			}

			// Log the new role
			//StatusLogger.info(`Attempting to add new role: ${newRole.role_id}`)

			// Assign the new role
			await member.roles.add(newRole.role_id)
			// StatusLogger.info('New role added successfully')

			// Check if the role was actually added
			const updatedMember = await guild.members.fetch(user.id)
			const roleAdded = updatedMember.roles.cache.has(newRole.role_id)

			// Log the role added check
			//StatusLogger.info(`Role added check: ${roleAdded}`)

			// If the role was not added, log a warning
			if (!roleAdded) {
				// StatusLogger.warn(
				// 	`Role was not added despite no errors. Current roles: ${updatedMember.roles.cache.map((r) => r.id).join(', ')}`
				// )
			}
		} catch (roleError) {
			StatusLogger.error(`Error assigning role: ${roleError}`)
		}

		// StatusLogger.info(`Channel ID: ${channel_id}`)
		// StatusLogger.info(userData.levelChangeStatus)

		// Send a notification to the level-up channel if specified
		if (
			channel_id &&
			(userData.levelChangeStatus === LevelUpResult.LevelDown ||
				userData.levelChangeStatus === LevelUpResult.LevelUp)
		) {
			// Fetch the channel
			const channel = (await guild.channels.fetch(
				channel_id
			)) as Discord.TextChannel | null

			// If the channel was fetched successfully, send a message
			if (channel) {
				// Create the message
				const message = `⭐️ <@${user.id}>, you've ${
					userData.levelChangeStatus === LevelUpResult.LevelUp
						? 'leveled up'
						: 'leveled down'
				} to level ${userData.level} and have been awarded the role \`${
					newRoleObject.name
				}\`! 🎉`

				// Send the message
				await channel.send(message)
			}
		}
	} catch (error) {
		// StatusLogger.error(
		// 	`Error updating roles for user ${user.globalName} (${user.id}) in guild ${guild.id}:`,
		// 	error
		// )
	}
}

export { updateMemberRoles }
