import type * as Discord from 'discord.js'
import { getPluginConfig } from '../api/plugins'
import { assignXP } from '../services/experienceService'
import { bunnyLog } from 'bunny-log'
import { manageSlowmode } from '../services/slowmode'

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
		await manageSlowmode(message)

		// Get the plugin config for the 'levels' plugin for this guild in the context of the given bot
		const config = await getPluginConfig(
			message.client.user.id,
			message.guild.id,
			'levels'
		)

		// Check if the 'levels' plugin is enabled
		if (!config.enabled) return

		// Assign XP based on the message, if the plugin is enabled
		await assignXP(message)
	} catch (error) {
		// Log any errors that may occur during message handling
		bunnyLog.error('Error handling message:', error)
	}
}

export { messageHandler }
