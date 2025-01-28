import * as Discord from 'discord.js'

const SUPPORT_SERVER_INVITE = 'https://discord.gg/RfBydgJpmU'
const OUR_SERVER = '1004735926234271864'
const SUPPORT_CHANNEL_ID = '1125401664665419837'

/**
 * Create an error embed
 * @param error_code - The error code
 * @param error_message - The error message
 * @returns The error embed
 */
export function createErrorEmbed(
	error_code: string,
	error_message: string
): Discord.EmbedBuilder {
	return new Discord.EmbedBuilder()
		.setTitle('Error!')
		.setColor(Discord.Colors.Red)
		.addFields(
			{ name: 'Code', value: error_code, inline: true },
			{ name: 'Message', value: error_message, inline: true }
		)
}

/**
 * Create a success embed
 * @param success_message - The success message
 * @returns The success embed
 */
export function createSuccessEmbed(
	success_message: string
): Discord.EmbedBuilder {
	return new Discord.EmbedBuilder()
		.setTitle('Success!')
		.setColor(Discord.Colors.Green)
		.addFields({ name: 'Message', value: success_message, inline: true })
}

/**
 * Handle an error
 * @param interaction - The interaction
 * @param error_code - The error code
 * @param error_message - The error message
 */
export async function handleError(
	interaction:
		| Discord.ChatInputCommandInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction,
	error_code: string,
	error_message: string
): Promise<void> {
	// Create the error embed
	const errorEmbed = createErrorEmbed(error_code, error_message)

	// Check if the interaction is in our server
	const isOurServer = interaction.guild?.id === OUR_SERVER

	// Get the bot's name
	const botName = interaction.client.user.username || 'Tiny Rabbit'

	// Create the content for the error message
	const content = `Oops! ${botName} flopped! 🐰💫\nAsk a server admin for help, or if you're a dev, hop over to our support channel with these details.\n\n${isOurServer ? `<#${SUPPORT_CHANNEL_ID}>` : SUPPORT_SERVER_INVITE}`

	// Check if the interaction is deferred
	if (interaction.deferred) {
		// Follow up with the error message
		await interaction.followUp({
			content,
			embeds: [errorEmbed],
			ephemeral: true,
		})
	} else {
		// Reply with the error message
		await interaction.reply({ content, embeds: [errorEmbed], ephemeral: true })
	}
}

/**
 * Handle a success
 * @param interaction - The interaction
 * @param success_message - The success message
 */
export async function handleSuccess(
	interaction:
		| Discord.ChatInputCommandInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction,
	success_message: string
): Promise<void> {
	// Create the success embed
	const successEmbed = createSuccessEmbed(success_message)

	// Check if the interaction is deferred
	if (interaction.deferred) {
		// Follow up with the success message
		await interaction.followUp({
			embeds: [successEmbed],
			ephemeral: true,
		})
	} else {
		// Reply with the success message
		await interaction.reply({
			embeds: [successEmbed],
			ephemeral: true,
		})
	}
}
