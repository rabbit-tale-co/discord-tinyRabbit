import * as commands from '../commands/index.js'
import * as utils from '../utils/index.js'
import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import * as api from '../api/index.js'
import * as ticketUtils from '../commands/moderation/tickets.js'

type CommandHandler = (
	interaction: Discord.ChatInputCommandInteraction
) => Promise<void>

type SubcommandMap = Record<string, CommandHandler>

interface CommandStructure {
	handler?: CommandHandler
	subcommands?: SubcommandMap
}

const commandMap: Record<string, CommandStructure> = {
	// Level management
	level: {
		subcommands: {
			show: commands.showLevel,
			set: commands.setLevel,
		},
	},

	ticket: {
		subcommands: {
			config: commands.ticketCommands.config,
			manage: commands.ticketCommands.manage,
			list: commands.ticketCommands.list,
			send_panel: commands.ticketCommands.sendPanel,
		},
	},

	// plugin: {
	// 	subcommands: {
	// 		create_license: commands.plugin.createLicense,
	// 		info: commands.plugin.info,
	// 	},
	// },

	// Birthday tracking
	bday: {
		subcommands: {
			set: commands.setBirthday,
			show: commands.showBirthday,
			remove: commands.removeBirthday,
		},
	},

	// Music commands
	music: {
		subcommands: {
			play: commands.music.play,
			pause: commands.music.pause,
			resume: commands.music.resume,
			skip: commands.music.skip,
			stop: commands.music.stop,
			queue: commands.music.queue,
			clear: commands.music.clear,
			remove: commands.music.remove,
			shuffle: commands.music.shuffle,
			loop: commands.music.loop,
			volume: commands.music.volume,
			nowplaying: commands.music.nowPlaying,
			lyrics: commands.music.lyrics,
			search: commands.music.search,
			playlist: commands.music.playlist,
			history: commands.music.history,
			help: commands.music.help,
		},
	},

	// Economy commands
	eco: {
		subcommands: {
			balance: commands.economy.balance,
			pay: commands.economy.pay,
			leaderboard: commands.economy.leaderboard,
		},
	},
}

// Button interaction handlers
const buttonInteractionHandlers: Record<
	string,
	(interaction: Discord.ButtonInteraction) => Promise<void>
> = {
	open_ticket: commands.ticket.openTicket,
	close_ticket_with_reason: commands.ticket.closeTicketWithReason,
	close_ticket: commands.ticket.closeTicket,
	confirm_close_ticket: commands.ticket.confirmCloseTicket,
	join_ticket: commands.ticket.joinTicket,
	claim_ticket: commands.ticket.claimTicket,
	rating_: commands.ticket.handleTicketRating,
	add_role_time_limit_component:
		commands.ticketCommands.handleComponentInteraction,
	ticket_config_back: commands.ticketCommands.handleComponentInteraction,
	autoclose_enable: commands.ticketCommands.handleComponentInteraction,
	autoclose_disable: commands.ticketCommands.handleComponentInteraction,
	autoclose_set_reason: commands.ticketCommands.handleComponentInteraction,
}

/**
 * Handles interaction commands.
 * @param {Discord.ChatInputCommandInteraction | Discord.ButtonInteraction | Discord.ModalSubmitInteraction} interaction - The interaction object.
 */
export async function interactionHandler(
	interaction: Discord.Interaction
): Promise<void> {
	try {
		// Handle command interactions
		if (interaction.isChatInputCommand()) {
			const command = commandMap[interaction.commandName]

			if (command?.subcommands) {
				const subcommand = interaction.options.getSubcommand()
				const handler = command.subcommands[subcommand]

				if (handler) {
					return await handler(interaction)
				}
			} else if (command?.handler) {
				return await command.handler(interaction)
			}
		}

		// Handle button interactions
		if (interaction.isButton()) {
			// Check for exact matches first
			if (
				interaction.customId === 'add_role_time_limit_component' ||
				interaction.customId === 'ticket_config_back'
			) {
				return await commands.ticketCommands.handleComponentInteraction(
					interaction
				)
			}

			// Then check for prefix matches
			const handler = Object.entries(buttonInteractionHandlers).find(
				([prefix]) => interaction.customId.startsWith(prefix)
			)?.[1]

			// Check if the button handler exists
			if (handler) {
				// Execute the button handler
				return await handler(interaction)
			}
			bunnyLog.warn(
				'No handler found for button interaction:',
				interaction.customId
			)
		}

		// Handle select menu interactions
		if (interaction.isStringSelectMenu()) {
			try {
				// Handle ticket configuration select menu and unit selection
				if (
					interaction.customId === 'ticket_config_select' ||
					interaction.customId === 'remove_role_time_limit_select' ||
					interaction.customId === 'time_limit_select' ||
					interaction.customId === 'time_limit_unit_select' ||
					interaction.customId === 'time_limit_predefined_select' ||
					interaction.customId === 'autoclose_time_select' ||
					interaction.customId === 'autoclose_time_unit_select' ||
					interaction.customId === 'autoclose_predefined_select' ||
					interaction.customId.startsWith('autoclose_value_') ||
					interaction.customId.startsWith('time_limit_value_') ||
					interaction.customId === 'time_limit_role_select'
				) {
					return await commands.ticketCommands.handleComponentInteraction(
						interaction
					)
				}

				// Handle template select menu
				if (interaction.customId === 'ticket_template_select') {
					// Will implement template editing later
					await interaction.update({
						content: 'Template editing coming soon...',
						components: [],
					})
					return
				}

				// Extract the selected value from the dropdown for legacy handling
				const selectedValue = interaction.values[0]
				// Override the interaction customId with the selected value so that openTicket gets the proper unique_id
				;(interaction as unknown as Discord.ButtonInteraction).customId =
					selectedValue

				// Find a corresponding button handler by matching the selected value prefix
				const handlerEntry = Object.entries(buttonInteractionHandlers).find(
					([prefix]) => selectedValue.startsWith(prefix)
				)

				// Defer update if not already done
				if (!interaction.deferred && !interaction.replied) {
					await interaction.deferUpdate()
				}

				if (handlerEntry) {
					// Execute the corresponding button handler (casting as needed)
					const res = await handlerEntry[1](
						interaction as unknown as Discord.ButtonInteraction
					)
					// Reset the select menu so the user can re-select the same option if needed
					try {
						await interaction.message.edit({
							components: interaction.message.components,
						})
					} catch (err) {
						bunnyLog.error('Error resetting select menu', err)
					}
					return res
				}
				bunnyLog.warn(
					'No handler found for select menu interaction with value:',
					selectedValue
				)
				return
			} catch (error) {
				bunnyLog.error('Error handling select menu interaction', error)
			}
		}

		// Handle channel select menu, role select menu, button, and modal interactions for tickets
		if (
			(interaction.isChannelSelectMenu() &&
				(interaction.customId === 'ticket_admin_channel' ||
					interaction.customId === 'ticket_transcript_channel')) ||
			(interaction.isRoleSelectMenu() &&
				(interaction.customId === 'ticket_mod_roles' ||
					interaction.customId === 'time_limit_role_select')) ||
			(interaction.isButton() &&
				(interaction.customId === 'ticket_display_text' ||
					interaction.customId === 'ticket_display_embed' ||
					interaction.customId.startsWith('claim_ticket_') ||
					interaction.customId.startsWith('join_ticket_') ||
					interaction.customId.startsWith('close_ticket_') ||
					interaction.customId.startsWith('confirm_close_ticket_') ||
					interaction.customId.startsWith('cancel_close_ticket_') ||
					interaction.customId === 'add_role_time_limit_component' ||
					interaction.customId === 'add_role_time_limit' ||
					interaction.customId === 'remove_role_time_limit' ||
					interaction.customId === 'ticket_config_back' ||
					interaction.customId === 'autoclose_enable' ||
					interaction.customId === 'autoclose_disable' ||
					interaction.customId === 'autoclose_set_reason' ||
					interaction.customId === 'autoclose_set_threshold' ||
					interaction.customId === 'autoclose_back' ||
					interaction.customId.startsWith('time_limit_custom_input_'))) ||
			(interaction.isStringSelectMenu() &&
				(interaction.customId === 'ticket_config_select' ||
					interaction.customId === 'remove_role_time_limit_select' ||
					interaction.customId === 'time_limit_select' ||
					interaction.customId === 'time_limit_unit_select' ||
					interaction.customId === 'time_limit_predefined_select' ||
					interaction.customId.startsWith('time_limit_value_') ||
					interaction.customId === 'time_limit_role_select')) ||
			(interaction.isModalSubmit() &&
				(interaction.customId === 'autoclose_reason_modal' ||
					interaction.customId === 'autoclose_custom_time_modal'))
		) {
			try {
				// Use the centralized ticket component interaction handler
				await commands.ticketCommands.handleComponentInteraction(interaction)
				return
			} catch (error) {
				bunnyLog.error('Error handling ticket component interaction', error)
			}
		}

		// Handle ticket rating interactions
		if (interaction.isButton() && interaction.customId.startsWith('rating_')) {
			try {
				await commands.ticketCommands.handleTicketRating(interaction)
				return
			} catch (error) {
				bunnyLog.error('Error handling ticket rating', error)
			}
		}

		// Handle modal submissions for tickets
		if (interaction.isModalSubmit()) {
			if (interaction.customId === 'ticket_autoclose_modal') {
				await interaction.deferUpdate()

				try {
					const config = await api.getPluginConfig(
						interaction.client.user.id,
						interaction.guild.id,
						'tickets'
					)

					if (config) {
						// Get values from modal
						const enabledInput =
							interaction.fields.getTextInputValue('autoclose_enabled')
						const thresholdInput = interaction.fields.getTextInputValue(
							'autoclose_threshold'
						)
						const reasonInput =
							interaction.fields.getTextInputValue('autoclose_reason')

						// Initialize auto_close array if not exists
						if (!config.auto_close || !Array.isArray(config.auto_close)) {
							config.auto_close = [
								{
									enabled: false,
									threshold: 72 * 60 * 60 * 1000, // 72 hours
									reason: 'Ticket closed due to inactivity',
								},
							]
						}

						// Update config with new values
						config.auto_close[0].enabled = enabledInput.toLowerCase() === 'true'

						// Parse threshold
						const thresholdMs = ticketUtils.parseTimeLimit(thresholdInput)
						if (thresholdMs > 0) {
							config.auto_close[0].threshold = thresholdMs
						}

						// Update reason
						if (reasonInput.trim()) {
							config.auto_close[0].reason = reasonInput
						}

						// Save config
						await api.updatePluginConfig(
							interaction.client.user.id,
							interaction.guild.id,
							'tickets',
							config
						)

						const formattedThreshold = ticketUtils.formatTimeThreshold(
							config.auto_close[0].threshold
						)
						await interaction.followUp({
							content: `# Auto-close Configuration Updated\n\n**Status:** ${config.auto_close[0].enabled ? 'Enabled ✅' : 'Disabled ❌'}\n**Threshold:** ${formattedThreshold}\n\nInactive tickets will now be automatically closed according to these settings.`,
							ephemeral: true,
						})
					}
				} catch (error) {
					bunnyLog.error('Error processing autoclose modal:', error)
					await interaction.followUp({
						content: 'An error occurred while saving your auto-close settings.',
						ephemeral: true,
					})
				}
				return
			}

			// Handle auto-close related modals
			if (
				interaction.customId === 'autoclose_reason_modal' ||
				interaction.customId === 'autoclose_custom_time_modal'
			) {
				try {
					// Use the centralized ticket component interaction handler
					await commands.ticketCommands.handleComponentInteraction(interaction)
					return
				} catch (error) {
					bunnyLog.error('Error handling auto-close modal:', error)
				}
				return
			}

			// Handle add_role_time_limit_modal
			if (interaction.customId === 'add_role_time_limit_modal') {
				try {
					// Use the centralized ticket component interaction handler
					await commands.ticketCommands.handleComponentInteraction(interaction)
					return
				} catch (error) {
					bunnyLog.error('Error handling role time limit modal', error)
				}
				return
			}

			// Handle close_ticket_modal and other ticket modals
			if (interaction.customId === 'close_ticket_modal') {
				return await commands.ticketCommands.modalSubmit(interaction)
			}
		}
	} catch (error) {
		// Log the error with bunnyLog
		bunnyLog.error('Error handling interaction:', {
			error: error.message,
			stack: error.stack,
			interaction: interaction.isCommand()
				? interaction.commandName
				: interaction.id,
		})

		// Provide the appropriate reply/followUp depending on the interaction status
		if (interaction.isRepliable()) {
			// Check if the interaction has already been replied to or deferred
			utils.handleResponse(interaction, 'error', `${error.message}`, {
				ephemeral: true,
				code: 'E001',
				error: error.message,
			})
		}
	}
}
