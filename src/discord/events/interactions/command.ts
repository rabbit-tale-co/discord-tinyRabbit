import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import { bunnyLog } from 'bunny-log'
import { config } from '@/discord/commands/moderation/tickets/config.js'
import { loadCfg } from '@/discord/commands/moderation/tickets/limits.js'
import { buildUniversalComponents } from '@/discord/components/index.js'
import * as commands from '@/discord/commands/index.js'

type commandHandler = (
	inter: Discord.ChatInputCommandInteraction
) => Promise<void>

type subCommandMap = Record<string, commandHandler>

interface commandStructure {
	handler?: commandHandler
	subcommands?: subCommandMap
}

// Send panel implementation
async function sendPanel(inter: Discord.ChatInputCommandInteraction) {
	if (!inter.inGuild()) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server.',
			{ code: 'SP001' }
		)
		return
	}

	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		// Check permissions
		const hasPerms = inter.memberPermissions?.has(
			Discord.PermissionsBitField.Flags.ManageChannels
		)
		if (!hasPerms) {
			await utils.handleResponse(
				inter,
				'error',
				'You need the "Manage Channels" permission to create ticket panels.',
				{ code: 'SP002' }
			)
			return
		}

		// Get the target channel
		const targetChannel = inter.options.getChannel(
			'channel',
			true
		) as Discord.TextChannel

		if (!targetChannel?.isTextBased()) {
			await utils.handleResponse(
				inter,
				'error',
				'The specified channel must be a text channel.',
				{ code: 'SP003' }
			)
			return
		}

		// Check bot permissions in target channel
		const botMember = inter.guild.members.me
		if (!botMember) {
			await utils.handleResponse(
				inter,
				'error',
				'Could not verify bot permissions.',
				{ code: 'SP004' }
			)
			return
		}

		const channelPerms = targetChannel.permissionsFor(botMember)
		if (
			!channelPerms?.has([
				Discord.PermissionFlagsBits.SendMessages,
				Discord.PermissionFlagsBits.ViewChannel,
			])
		) {
			await utils.handleResponse(
				inter,
				'error',
				`I don't have permission to send messages in ${targetChannel}.`,
				{ code: 'SP005' }
			)
			return
		}

		// Load ticket configuration
		const cfg = await loadCfg(inter)
		if (!cfg.enabled) {
			await utils.handleResponse(
				inter,
				'error',
				'Tickets are not enabled on this server. Please enable them first in the ticket configuration.',
				{ code: 'SP006' }
			)
			return
		}

		// Create the ticket panel message using universal component builder
		if (cfg.components?.open_ticket) {
			try {
				// Create a mock member for the component builder
				const mockMember = {
					user: inter.user,
					guild: inter.guild,
					displayName: inter.user.displayName || inter.user.username,
				} as Discord.GuildMember

				const { v2Components, actionRows } = buildUniversalComponents(
					{ components: cfg.components.open_ticket },
					mockMember,
					inter.guild
				)

				// Prepare a single message with all components
				const messageOptions: Discord.MessageCreateOptions = {
					flags: Discord.MessageFlags.IsComponentsV2,
				}

				// Combine all components into a single mutable array
				let allComponents = [...v2Components]

				// Add action rows if we have buttons
				const totalButtons = actionRows.reduce(
					(count, row) => count + (row.components?.length || 0),
					0
				)

				if (totalButtons > 0 && totalButtons <= 3) {
					allComponents = [...allComponents, ...actionRows]
				}

				if (allComponents.length > 0) {
					messageOptions.components = allComponents
				}

				// Send a single message with all components
				const sentMessage = await targetChannel.send(messageOptions)

				// Send success confirmation
				await utils.handleResponse(
					inter,
					'success',
					`Ticket panel created successfully in ${targetChannel}!`,
					{ code: 'SP008' }
				)
			} catch (error) {
				bunnyLog.error(
					'Error creating ticket panel with universal components:',
					error
				)
				// Fallback to simple message with button
				const fallbackButton = new Discord.ButtonBuilder()
					.setLabel('General Support')
					.setStyle(Discord.ButtonStyle.Primary)
					.setCustomId('open_ticket_general')

				const fallbackRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						fallbackButton
					)

				await targetChannel.send({
					content:
						'🎫 **Support Tickets**\n\nClick the button below to open a support ticket.',
					components: [fallbackRow],
				})

				await utils.handleResponse(
					inter,
					'success',
					`Ticket panel created successfully in ${targetChannel}!`,
					{ code: 'SP008' }
				)
			}
		} else {
			await utils.handleResponse(
				inter,
				'error',
				'No ticket panel template configured. Please set up the open_ticket template first.',
				{ code: 'SP007' }
			)
		}
	} catch (error) {
		bunnyLog.error('Error creating ticket panel:', error)
		await utils.handleResponse(
			inter,
			'error',
			'Failed to create ticket panel. Please try again.',
			{
				code: 'SP009',
				error: error instanceof Error ? error : new Error(String(error)),
			}
		)
	}
}

// Command map structure for slash commands
const commandMap: Record<string, commandStructure> = {
	level: {
		subcommands: {
			show: commands.level.showLevel,
			set: commands.level.setLevel,
		},
	},
	bday: {
		subcommands: {
			set: commands.bday.setBirthday,
			show: commands.bday.showBirthday,
			remove: commands.bday.removeBirthday,
		},
	},
	ticket: {
		subcommands: {
			config, // Using the new config from tickets/config.ts
			list: async (inter: Discord.ChatInputCommandInteraction) => {
				await utils.handleResponse(
					inter,
					'info',
					'Ticket listing is currently unavailable.',
					{ code: 'TL001' }
				)
			},
			send_panel: sendPanel,
		},
	},
}

export async function commandInteractionHandler(
	inter: Discord.Interaction
): Promise<void> {
	if (!inter.isChatInputCommand()) return

	try {
		const cmd = commandMap[inter.commandName]
		if (!cmd) {
			bunnyLog.warn(`Unknown command: ${inter.commandName}`)
			return
		}

		if (cmd.handler) {
			await cmd.handler(inter)
			return
		}

		if (cmd.subcommands) {
			const sub = inter.options.getSubcommand()
			if (!sub) {
				bunnyLog.warn(`No subcommand provided for ${inter.commandName}`)
				return
			}

			const fn = cmd.subcommands[sub]
			if (!fn) {
				bunnyLog.warn(`Unknown subcommand: ${inter.commandName} ${sub}`)
				await utils.handleResponse(
					inter,
					'error',
					`Unknown subcommand: ${sub}`,
					{ code: 'CMD001' }
				)
				return
			}

			await fn(inter)
			return
		}
	} catch (error) {
		bunnyLog.error(
			`Error handling command interaction for ${inter.commandName}:`,
			error
		)

		if (inter.isRepliable() && !inter.replied && !inter.deferred) {
			try {
				await utils.handleResponse(
					inter,
					'error',
					'An unexpected error occurred while processing your command.',
					{
						code: 'CMD002',
						error: error instanceof Error ? error : new Error(String(error)),
					}
				)
			} catch (e) {
				bunnyLog.error('Failed to send error response:', e)
			}
		}
	}
}
