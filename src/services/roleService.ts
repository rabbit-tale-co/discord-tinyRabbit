import { getPluginConfig } from '../api/plugins'
import type { ClientUser, Guild, TextChannel, User } from 'discord.js'
import { LevelUpResult } from '../utils/xpUtils'
import type { LevelStatus } from '../types/levels'
import { bunnyLog } from 'bunny-log'

/**
 * Updates a member's roles based on their level.
 *
 * @param {ClientUser['id']} bot_id - The bot client object.
 * @param {Guild} guild - The guild where the user is a member.
 * @param {User} user - The user to update.
 * @param {UserData} userData - The user data including level, levelUp, and levelDown flags.
 */
async function updateMemberRoles(
	bot_id: ClientUser['id'],
	guild: Guild,
	user: User,
	userData: LevelStatus
) {
	try {
		// Fetch the 'levels' plugin configuration for the guild
		const config = await getPluginConfig(bot_id, guild.id, 'levels')

		// Check if level roles are defined in the configuration
		if (!config || !config.reward_roles) {
			// bunnyLog.error(`No role mappings found in config for guild ${guild.id}`)
			return
		}

		const { reward_roles, channel_id } = config
		const sortedRoles = reward_roles.sort((a, b) => b.level - a.level)

		// bunnyLog.info(`Reward roles: ${JSON.stringify(reward_roles)}`)

		const member = await guild.members.fetch(user.id)

		// Find the highest role the user qualifies for
		const newRole = sortedRoles.find((role) => userData.level >= role.level)
		if (!newRole) {
			// bunnyLog.warn(`No role found for user ${user.id} in guild ${guild.id}`)
			return
		}

		const newRoleObject = await guild.roles.fetch(newRole.role_id)
		if (!newRoleObject) {
			// bunnyLog.error(
			// 	`Role with ID ${newRole.role_id} not found in guild ${guild.id}`
			// )
			return
		}

		// Check if the user already has the correct role
		const hasNewRole = member.roles.cache.has(newRole.role_id)
		if (hasNewRole) return

		bunnyLog.info(`New role: ${newRole.role_id}`)

		// Remove all roles that are no longer applicable
		const rolesToRemove = sortedRoles
			.filter((role) => role.role_id !== newRole.role_id)
			.map((role) => role.role_id)

		bunnyLog.info(`Roles to remove: ${JSON.stringify(rolesToRemove)}`)

		// Assign the new role
		try {
			if (rolesToRemove.length > 0) {
				// bunnyLog.info(
				// 	`Attempting to remove roles: ${JSON.stringify(rolesToRemove)}`
				// )
				await member.roles.remove(rolesToRemove)
				// bunnyLog.info('Roles removed successfully')
			}

			// bunnyLog.info(`Attempting to add new role: ${newRole.role_id}`)
			await member.roles.add(newRole.role_id)
			// bunnyLog.info('New role added successfully')

			// Check if the role was actually added
			const updatedMember = await guild.members.fetch(user.id)
			const roleAdded = updatedMember.roles.cache.has(newRole.role_id)
			// bunnyLog.info(`Role added check: ${roleAdded}`)

			if (!roleAdded) {
				// bunnyLog.warn(
				// 	`Role was not added despite no errors. Current roles: ${updatedMember.roles.cache.map((r) => r.id).join(', ')}`
				// )
			}
		} catch (roleError) {
			bunnyLog.error(`Error assigning role: ${roleError}`)
		}

		// bunnyLog.info(`Channel ID: ${channel_id}`)
		// bunnyLog.info(userData.levelChangeStatus)

		// Send a notification to the level-up channel if specified
		if (
			channel_id &&
			(userData.levelChangeStatus === LevelUpResult.LevelDown ||
				userData.levelChangeStatus === LevelUpResult.LevelUp)
		) {
			const channel = (await guild.channels.fetch(
				channel_id
			)) as TextChannel | null

			if (channel) {
				const message = `⭐️ <@${user.id}>, you've ${
					userData.levelChangeStatus === LevelUpResult.LevelUp
						? 'leveled up'
						: 'leveled down'
				} to level ${userData.level} and have been awarded the role \`${
					newRoleObject.name
				}\`! 🎉`

				await channel.send(message)
			}
		}
	} catch (error) {
		// bunnyLog.error(
		// 	`Error updating roles for user ${user.globalName} (${user.id}) in guild ${guild.id}:`,
		// 	error
		// )
	}
}

export { updateMemberRoles }
