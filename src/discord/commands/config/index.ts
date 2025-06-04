import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import { config as ticketConfig } from './ticket.js'
import { config as starboardConfig } from './starboard.js'

type ConfigHandler = (
	inter:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction
) => Promise<void>

// Map of plugin names to their config handlers
const configHandlers: Record<string, ConfigHandler> = {
	tickets: ticketConfig,
	starboard: starboardConfig,
	// Add more handlers as needed
	// levels: levelsConfig,
	// welcome_goodbye: welcomeGoodbyeConfig,
	// birthday: birthdayConfig,
	// tempvc: tempvcConfig,
	// economy: economyConfig,
	// music: musicConfig,
	// moderation: moderationConfig,
}

export async function config(
	inter:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction
) {
	// Check if interaction has already been replied to
	if (inter.replied || inter.deferred) {
		const customId = inter.isChatInputCommand() ? 'chat_input' : inter.customId
		StatusLogger.warn(`Config interaction already handled: ${customId}`)
		return
	}

	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'CFG001' }
		)
		return
	}

	// Check permissions
	const hasPerms = inter.memberPermissions?.has(
		Discord.PermissionsBitField.Flags.ManageGuild
	)

	if (!hasPerms) {
		await utils.handleResponse(
			inter,
			'error',
			'You need the "Manage Server" permission to configure plugins.',
			{ code: 'CFG002' }
		)
		return
	}

	// For chat input command, get the plugin from options
	if (inter.isChatInputCommand()) {
		const plugin = inter.options.getString('plugin', true)

		const handler = configHandlers[plugin]
		if (!handler) {
			await utils.handleResponse(
				inter,
				'error',
				`Configuration for plugin "${plugin}" is not implemented yet.`,
				{ code: 'CFG003' }
			)
			return
		}

		try {
			await handler(inter)
		} catch (error) {
			StatusLogger.error('Error in config handler', error as Error)
			if (!inter.replied && !inter.deferred) {
				await utils.handleResponse(
					inter,
					'error',
					'An error occurred while processing the configuration.',
					{
						code: 'CFG004',
						error: error instanceof Error ? error : new Error(String(error)),
					}
				)
			}
		}
		return
	}

	// For interactions, we need to determine which plugin they belong to
	// This will be handled by the specific plugin handlers through their custom IDs
	const customId = inter.customId

	try {
		// Route to appropriate handler based on custom ID prefix
		if (customId.startsWith('ticket_') || customId.startsWith('tickets:')) {
			await configHandlers.tickets(inter)
		} else {
			StatusLogger.warn(`Unhandled config interaction: ${customId}`)
			if (!inter.replied && !inter.deferred) {
				await utils.handleResponse(
					inter,
					'error',
					'Unknown configuration interaction.',
					{ code: 'CFG005' }
				)
			}
		}
	} catch (error) {
		StatusLogger.error('Error in config interaction handler', error as Error)
		if (!inter.replied && !inter.deferred) {
			await utils.handleResponse(
				inter,
				'error',
				'An error occurred while processing the configuration.',
				{
					code: 'CFG006',
					error: error instanceof Error ? error : new Error(String(error)),
				}
			)
		}
	}
}
