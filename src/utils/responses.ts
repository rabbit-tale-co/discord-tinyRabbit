import * as Discord from 'discord.js'

const SUPPORT_SERVER_INVITE = 'https://discord.gg/RfBydgJpmU'
const OUR_SERVER = '1004735926234271864'
const SUPPORT_CHANNEL_ID = '1125401664665419837'

type ResponseType = 'error' | 'success' | 'info' | 'warning'
type InteractionType =
	| Discord.ChatInputCommandInteraction
	| Discord.MessageContextMenuCommandInteraction
	| Discord.UserContextMenuCommandInteraction
	| Discord.ButtonInteraction
	| Discord.ModalSubmitInteraction
	| Discord.MessageComponentInteraction

const RESPONSE_TYPES: Record<ResponseType, string> = {
	error: 'error',
	success: 'success',
	info: 'info',
	warning: 'warning',
} as const
const RESPONSE_COLORS: Record<ResponseType, Discord.ColorResolvable> = {
	error: 0xf23f43, // #F23F43
	success: 0x219a53, // #219A53
	info: Discord.Colors.Blurple, // #5865F2
	warning: 0xf0b232, // #F0B232
} as const

const RESPONSE_ICONS: Record<ResponseType, string> = {
	error: '❌',
	success: '✅',
	info: '🔍',
	warning: '⚠️',
} as const

/**
 * Create a response embed
 * @param {ResponseType} type - The type of response
 * @param {string} message - The message to display
 * @param {string} code - The code to display
 * @returns {Discord.EmbedBuilder} The response embed
 */
export const createResponseEmbed = (
	type: ResponseType,
	message: string,
	code?: string
): Discord.EmbedBuilder => {
	const embed = new Discord.EmbedBuilder()
		.setColor(RESPONSE_COLORS[type])
		.setTitle(`${RESPONSE_ICONS[type]} ${RESPONSE_TYPES[type]}`)

	// Add the code if it exists
	if (code) {
		embed.addFields({ name: 'Code', value: code, inline: true })
	}

	// Add the message
	embed.addFields({ name: 'Message', value: message, inline: true })

	return embed
}

/**
 * Handle a response
 * @param {InteractionType} interaction - The interaction
 * @param {ResponseType} type - The type of response
 * @param {string} message - The message to display
 * @param {Object} options - The options for the response
 * @param {string} options.code - The code to display
 * @param {boolean} options.ephemeral - Whether the response should be ephemeral
 * @param {boolean} options.includeSupport - Whether the response should include support information
 * @returns {Promise<void>}
 */
export const handleResponse = async (
	interaction: InteractionType,
	type: ResponseType,
	message: string,
	options?: {
		code?: string
		ephemeral?: boolean
		includeSupport?: boolean
		error?: Error
	}
): Promise<void> => {
	const {
		code,
		ephemeral = type === 'error', // Set ephemeral to true for errors by default
		includeSupport = type === 'error',
		error,
	} = options || {}

	// For ChatInputCommandInteraction, defer the reply if not already done
	if (
		interaction.isChatInputCommand() &&
		!interaction.deferred &&
		!interaction.replied
	) {
		await interaction.deferReply({ flags: ephemeral ? 64 : undefined })
	}

	// For success messages, send as plain text
	if (type === 'success') {
		if (interaction.deferred) {
			await interaction.followUp({ content: message })
		} else {
			await interaction.reply({ content: message })
		}
		return
	}

	// For other types (error, warning, info), create and send embed
	const embed = createResponseEmbed(type, message, code)

	// Add error information if provided
	if (error) {
		embed.addFields({
			name: 'Error Details',
			value: `\`\`\`${error?.message?.slice(0, 1000) || 'Unknown error'}\`\`\``,
			inline: false,
		})
	}

	// Create content parts
	const contentParts: string[] = []

	// Add support information if needed
	if (includeSupport) {
		const isOurServer = interaction.guild?.id === OUR_SERVER
		const botName = interaction.client.user.username || 'Tiny Rabbit'
		contentParts.push(`Oops! ${botName} flopped! 🐰💫`)
		contentParts.push(
			isOurServer ? `<#${SUPPORT_CHANNEL_ID}>` : SUPPORT_SERVER_INVITE
		)
	}

	const responseOptions = {
		content: contentParts.join('\n\n'),
		embeds: [embed],
		flags: ephemeral ? 64 : undefined,
	}

	if (interaction.deferred) {
		await interaction.followUp(responseOptions)
	} else {
		await interaction.reply(responseOptions)
	}
}
