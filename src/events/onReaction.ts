import type {
	MessageReaction,
	PartialMessageReaction,
	PartialUser,
	User,
} from 'discord.js'
import watchStarboard from '../services/starboardService'
import { bunnyLog } from 'bunny-log'

async function reactionHandler(
	reaction: MessageReaction | PartialMessageReaction,
	user: User | PartialUser
): Promise<void> {
	if (user.bot) return // Ignore bot reactions

	try {
		// Handle partial reactions
		if (reaction.partial)
			await reaction
				.fetch()
				.catch(() => bunnyLog.error('Failed to fetch reaction'))
		if (user.partial)
			await user.fetch().catch(() => bunnyLog.error('Failed to fetch user'))
		if (reaction.message.partial)
			await reaction.message
				.fetch()
				.catch(() => bunnyLog.error('Failed to fetch message'))

		// bunnyLog.info(`User ${user.tag} reacted with "${reaction.emoji.name}" on message ${reaction.message.id}`)

		// Call the starboard function
		await watchStarboard(reaction)
	} catch (error) {
		bunnyLog.error('Error handling reaction:', error)
	}
}

export { reactionHandler }
