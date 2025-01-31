import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import * as services from '@/services/index.js'

/**
 * Handles reactions on messages.
 * @param {Discord.MessageReaction | Discord.PartialMessageReaction} reaction - The reaction object from Discord.
 * @param {Discord.User | Discord.PartialUser} user - The user object from Discord.
 * @returns {Promise<void>}
 */
async function reactionHandler(
	reaction: Discord.MessageReaction | Discord.PartialMessageReaction,
	user: Discord.User | Discord.PartialUser
): Promise<void> {
	// Ignore reactions in DMs
	if (!reaction.message.guild) return

	// Ignore bot reactions
	if (user.bot) return

	try {
		// Handle partial reactions
		if (reaction.partial)
			await reaction
				.fetch()
				.catch(() => bunnyLog.error('Failed to fetch reaction'))

		// Handle partial users
		if (user.partial)
			await user.fetch().catch(() => bunnyLog.error('Failed to fetch user'))

		// Handle partial messages
		if (reaction.message.partial)
			await reaction.message
				.fetch()
				.catch(() => bunnyLog.error('Failed to fetch message'))

		// bunnyLog.info(`User ${user.tag} reacted with "${reaction.emoji.name}" on message ${reaction.message.id}`)

		// Call the starboard function
		await services.watchStarboard(reaction)
	} catch (error) {
		bunnyLog.error('Error handling reaction:', error)
	}
}

export { reactionHandler }
