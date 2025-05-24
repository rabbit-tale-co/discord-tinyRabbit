import type * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import { bunnyLog } from 'bunny-log'
import { config } from '@/commands/moderation/tickets/config.js'

type commandHandler = (
	inter: Discord.ChatInputCommandInteraction
) => Promise<void>

type subCommandMap = Record<string, commandHandler>

interface commandStructure {
	handler?: commandHandler
	subcommands?: subCommandMap
}

// Command map structure for slash commands
const commandMap: Record<string, commandStructure> = {
	ticket: {
		subcommands: {
			config, // Using the new config from tickets/config.ts
			list: async (inter: Discord.ChatInputCommandInteraction) => {
				await utils.handleResponse(
					inter,
					'info',
					'Ticket listing is currently unavailable.'
				)
			},
			send_panel: async (inter: Discord.ChatInputCommandInteraction) => {
				await utils.handleResponse(
					inter,
					'info',
					'Ticket panel creation is currently unavailable.'
				)
			},
		},
	},
}

export async function commandInteractionHandler(
	inter: Discord.Interaction
): Promise<void> {
	if (!inter.isChatInputCommand()) return

	try {
		const cmd = commandMap[inter.commandName]
		if (!cmd) return

		if (cmd.handler) {
			await cmd.handler(inter)
			return
		}

		if (cmd.subcommands) {
			const sub = inter.options.getSubcommand()
			if (!sub) return

			const fn = cmd.subcommands[sub]
			if (!fn) return

			await fn(inter)
			return
		}
	} catch (error) {
		if (inter.isRepliable() && !inter.replied && !inter.deferred) {
			try {
				await utils.handleResponse(inter, 'error', error)
			} catch (e) {
				bunnyLog.error(`Error handling command interaction: ${error}`)
			}
		} else {
			bunnyLog.error(`Error handling command interaction: ${error}`)
		}
	}
}
