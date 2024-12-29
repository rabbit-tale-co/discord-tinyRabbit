import * as Discord from 'discord.js'

const SUPPORT_SERVER_INVITE = 'https://discord.gg/RfBydgJpmU'
const OUR_SERVER = '1004735926234271864'
const SUPPORT_CHANNEL_ID = '1125401664665419837'

export function createErrorEmbed(
	errorCode: string,
	errorMessage: string
): Discord.EmbedBuilder {
	return new Discord.EmbedBuilder()
		.setTitle('Error!')
		.setColor(Discord.Colors.Red)
		.addFields(
			{ name: 'Code', value: errorCode, inline: true },
			{ name: 'Message', value: errorMessage, inline: true }
		)
}

export function createSuccessEmbed(
	successMessage: string
): Discord.EmbedBuilder {
	return new Discord.EmbedBuilder()
		.setTitle('Success!')
		.setColor(Discord.Colors.Green)
		.addFields({ name: 'Message', value: successMessage, inline: true })
}

export async function handleError(
	interaction:
		| Discord.ChatInputCommandInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction,
	errorCode: string,
	errorMessage: string
): Promise<void> {
	const errorEmbed = createErrorEmbed(errorCode, errorMessage)
	const isOurServer = interaction.guild?.id === OUR_SERVER
	const botName = interaction.client.user.username || 'Tiny Rabbit'
	const content = `Oops! ${botName} flopped! 🐰💫\nAsk a server admin for help, or if you're a dev, hop over to our support channel with these details.\n\n${isOurServer ? `<#${SUPPORT_CHANNEL_ID}>` : SUPPORT_SERVER_INVITE}`

	if (interaction.deferred) {
		await interaction.followUp({
			content,
			embeds: [errorEmbed],
			ephemeral: true,
		})
	} else {
		await interaction.reply({ content, embeds: [errorEmbed], ephemeral: true })
	}
}

export async function handleSuccess(
	interaction:
		| Discord.ChatInputCommandInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction,
	successMessage: string
): Promise<void> {
	const successEmbed = createSuccessEmbed(successMessage)

	if (interaction.deferred) {
		await interaction.followUp({
			embeds: [successEmbed],
			ephemeral: true,
		})
	} else {
		await interaction.reply({
			embeds: [successEmbed],
			ephemeral: true,
		})
	}
}
