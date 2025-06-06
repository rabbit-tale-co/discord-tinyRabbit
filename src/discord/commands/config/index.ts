import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import { config as ticketConfig } from './ticket.js'
import { config as starboardConfig } from './starboard.js'
import { config as levelsConfig } from './levels.js'
import { config as welcomeGoodbyeConfig } from './welcomeGoodbye.js'
import { config as birthdayConfig } from './birthday.js'

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
	levels: levelsConfig,
	welcome_goodbye: welcomeGoodbyeConfig,
	birthday: birthdayConfig,
	// Add more handlers as needed
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
		StatusLogger.warn(
			`[Config Router] Interaction already handled: ${customId}`
		)
		return
	}

	// Additional safety check for interaction state
	try {
		if (inter.isRepliable() && (inter.replied || inter.deferred)) {
			StatusLogger.warn(
				`[Config Router] Interaction state conflict for: ${inter.isChatInputCommand() ? 'chat_input' : inter.customId}`
			)
			return
		}
	} catch (stateError) {
		StatusLogger.error(
			'[Config Router] Error checking interaction state:',
			stateError
		)
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
		// Route to appropriate handler based on custom ID
		if (
			customId.startsWith('tickets:') ||
			customId.startsWith('ticket_') ||
			customId.includes('role_limit') ||
			customId.includes('autoclose') ||
			(customId.includes('config') && customId.includes('ticket'))
		) {
			// Handle tickets configuration
			await configHandlers.tickets(inter)
		} else if (
			customId.startsWith('starboard:') ||
			customId.startsWith('starboard_') ||
			customId.includes('starboard') ||
			customId.includes('clear_watch_channels')
		) {
			// Handle starboard configuration
			await configHandlers.starboard(inter)
		} else if (
			customId.startsWith('levels_') ||
			customId.includes('levels') ||
			customId.includes('reward_role') ||
			customId.includes('boost_roles')
		) {
			// Handle levels configuration
			await configHandlers.levels(inter)
		} else if (
			customId.startsWith('welcome_goodbye_') ||
			customId.includes('welcome_goodbye') ||
			customId.includes('welcome_channel') ||
			customId.includes('goodbye_channel') ||
			customId.includes('join_roles')
		) {
			// Handle welcome & goodbye configuration
			await configHandlers.welcome_goodbye(inter)
		} else if (
			customId.startsWith('birthday_') ||
			customId.includes('birthday') ||
			customId.includes('birthday_channel') ||
			customId.includes('birthday_message') ||
			customId.includes('birthday_age')
		) {
			// Handle birthday configuration
			await configHandlers.birthday(inter)
		} else {
			StatusLogger.warn(`[Config Router] Unhandled interaction: ${customId}`)
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
