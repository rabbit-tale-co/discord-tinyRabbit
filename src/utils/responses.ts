import * as Discord from 'discord.js'
import * as V2 from 'discord-components-v2'
import { makeThumbnail } from './Thumbnail.js'
import { client } from '@/index.js'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const SUPPORT_SERVER_INVITE = 'https://discord.gg/RfBydgJpmU'
const OUR_SERVER = '1004735926234271864'
const SUPPORT_CHANNEL_ID = '1263903315780046849'
const ASSETS_DIR = path.resolve(process.cwd(), 'src/assets')

type ResponseType = 'error' | 'success' | 'info' | 'warning'
type InteractionType =
	| Discord.ChatInputCommandInteraction
	| Discord.MessageContextMenuCommandInteraction
	| Discord.UserContextMenuCommandInteraction
	| Discord.ButtonInteraction
	| Discord.ModalSubmitInteraction
	| Discord.MessageComponentInteraction

// Define base options interface
interface BaseResponseOptions {
	code?: string
	ephemeral?: boolean
	components?: Discord.ActionRowBuilder<
		Discord.ButtonBuilder | Discord.StringSelectMenuBuilder
	>[]
}

// Error-specific options that include the error field
interface ErrorResponseOptions extends BaseResponseOptions {
	error?: Error
}

// Type that changes based on response type
type ResponseOptions<T extends ResponseType> = T extends 'error'
	? ErrorResponseOptions
	: BaseResponseOptions

const RESPONSE_TYPES: Record<ResponseType, string> = {
	error: 'Error',
	success: 'Success',
	info: 'Info',
	warning: 'Warning',
} as const

// Use CDN URLs instead of local file paths
const RESPONSE_THUMBNAILS: Record<ResponseType, string> = {
	error:
		'https://cdn.discordapp.com/attachments/1004735926234271864/1263905387650654269/error.png',
	success:
		'https://cdn.discordapp.com/attachments/1004735926234271864/1263905387839729664/success.png',
	info: 'https://cdn.discordapp.com/attachments/1004735926234271864/1263905387445964820/info.png',
	warning:
		'https://cdn.discordapp.com/attachments/1004735926234271864/1263905388041613332/warning.png',
} as const

/**
 * Handle a response using V2 with enhanced formatting
 */
export const handleResponse = async <T extends ResponseType>(
	interaction: InteractionType,
	type: T,
	message: string,
	options?: ResponseOptions<T>
): Promise<void> => {
	const { code, ephemeral, components = [] } = options || {}
	const BOT_NAME = client.user?.username
	const BOT_ID = client.user?.id

	const isError = type === 'error'
	const isOurServer = interaction.guild?.id === OUR_SERVER
	const error = isError ? (options as ErrorResponseOptions)?.error : undefined

	if (
		interaction.isChatInputCommand() &&
		!interaction.deferred &&
		!interaction.replied
	) {
		await interaction.deferReply({ ephemeral: ephemeral ?? isError })
	}

	// Build all components in a structured way
	const body = [
		V2.makeTextDisplay(`## Whoops, <@${BOT_ID}> flopped.`),
		V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		}),

		V2.makeTextDisplay(`### ${RESPONSE_TYPES[type]} ${code && `| #${code}`}`),
		V2.makeTextDisplay(`> ${message}`),

		...(isError && error
			? [
					V2.makeTextDisplay(
						[
							'```diff',
							`[${error.name}] ${error.message.slice(0, 1000)}`,
							'```',
						].join('\n')
					),
				]
			: []),

		// Spacing after header
		V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		}),

		// Add support section for errors
		...(isError
			? [
					V2.makeTextDisplay(
						isOurServer
							? `-# 🎫 Get support in <#${SUPPORT_CHANNEL_ID}>`
							: '-# ✨ Need help? Join our support server!'
					),

					// Add support button if not in our server
					...(!isOurServer
						? [
								V2.makeActionRow([
									V2.makeButton({
										label: '🆘 Get Support',
										style: Discord.ButtonStyle.Link,
										url: SUPPORT_SERVER_INVITE,
									}),
								]),
							]
						: []),
				]
			: []),

		// Add custom components if any
		...(components.length > 0
			? [
					V2.makeSeparator({
						spacing: Discord.SeparatorSpacingSize.Large,
						divider: true,
					}),
					...components,
				]
			: []),
	]

	// Prepare the response options
	const responseOptions: Discord.InteractionReplyOptions = {
		components: body,
		ephemeral: ephemeral ?? isError,
		flags: Discord.MessageFlags.IsComponentsV2,
	}

	if (interaction.deferred) {
		await interaction.followUp(responseOptions)
	} else {
		await interaction.reply({
			...responseOptions,
			fetchReply: true,
		})
	}
}
