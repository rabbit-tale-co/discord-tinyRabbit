import type { Message } from 'discord.js'
import { getPluginConfig } from '../api/plugins'
import { assignXP } from '../services/experienceService'
import { bunnyLog } from 'bunny-log'
import { manageSlowmode } from '../services/slowmode'

/**
 * Event handler for message creation.
 * @param {Message} message - The message object from Discord.
 * @returns {Promise<void>} A promise that resolves when the message is handled.
 */
async function messageHandler(message: Message): Promise<void> {
	// Ignoruj wiadomości od botów
	if (message.author.bot) return

	try {
		await manageSlowmode(message)

		// Pobierz konfigurację pluginu 'levels' dla tej gildii w kontekście danego bota
		const config = await getPluginConfig(
			message.client.user.id,
			message.guild.id,
			'levels'
		)

		// Sprawdź, czy plugin 'levels' jest włączony
		if (!config.enabled) return

		// Przypisz XP na podstawie wiadomości, jeśli plugin jest włączony
		await assignXP(message)
	} catch (error) {
		// Loguj błędy, które mogą wystąpić podczas obsługi wiadomości
		bunnyLog.error('Error handling message:', error)
	}
}

export { messageHandler }
