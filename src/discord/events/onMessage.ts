import type * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as services from '@/discord/services/index.js'
import * as api from '@/discord/api/index.js'
import { bunnyLog } from 'bunny-log'

/**
 * Event handler for message creation.
 * @param {Discord.Message} message - The message object from Discord.
 * @returns {Promise<void>} A promise that resolves when the message is handled.
 */
async function messageHandler(message: Discord.Message): Promise<void> {
	// Ignore messages from bots
	if (message.author.bot) return

	// Ignore messages in DMs
	if (!message.guild) return // TODO: add error handling

	// Ignore messages in threads
	if (message.channel.isThread()) return

	try {
		// Manage slowmode
		await services.manageSlowmode(message)

		if (message.content.startsWith('!purge') && message.reference?.messageId) {
			const targetMessage = await message.channel.messages.fetch(
				message.reference.messageId
			)

			const messages = await message.channel.messages.fetch({
				limit: 100,
				after: targetMessage.id,
			})

			const messagesToDelete = messages.filter(
				(m) => m.createdTimestamp > targetMessage.createdTimestamp
			)

			await (message.channel as Discord.TextChannel).bulkDelete([
				...messagesToDelete.values(),
				message,
			])

			await utils.handleResponse(
				message as unknown as Discord.ChatInputCommandInteraction,
				'success',
				`Deleted ${messagesToDelete.size} messages`,
				{ ephemeral: false }
			)
		}

		// Levels plugin check (only for XP assignment)
		const config = await api.getPluginConfig(
			message.client.user.id,
			message.guild.id,
			'levels'
		)

		if (config?.enabled) {
			await services.assignXP(message)
		}
	} catch (error) {
		// Log any errors that may occur during message handling
		bunnyLog.error('Error handling message:', error)
	}
}

export { messageHandler }
