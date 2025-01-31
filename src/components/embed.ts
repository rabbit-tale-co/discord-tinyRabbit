import * as Discord from 'discord.js'
import type { UniversalEmbedOptions } from '../types/embed.js'

/**
 * Creates a universal embed with various optional parameters.
 * @param {UniversalEmbedOptions} options - The data for the embed and additional options.
 * @returns {{ embed: Discord.EmbedBuilder; attachment?: Discord.AttachmentBuilder; action_row?: Discord.ActionRowBuilder<Discord.ButtonBuilder> }} The generated embed and optional attachment.
 */
function createUniversalEmbed({
	buttons,
	image,
	...embed_data
}: UniversalEmbedOptions): {
	embed: Discord.EmbedBuilder
	attachment?: Discord.AttachmentBuilder
	action_row?: Discord.ActionRowBuilder<Discord.ButtonBuilder>
} {
	// Create the embed
	const embed = new Discord.EmbedBuilder(embed_data)

	// Initialize variables with null
	let attachment: Discord.AttachmentBuilder | null = null
	let action_row: Discord.ActionRowBuilder<Discord.ButtonBuilder> | null = null

	// Check if the image is provided
	if (image?.url) {
		// Check if the image is external
		if (image.external) {
			// Create the attachment
			attachment = new Discord.AttachmentBuilder(image.url)
		} else {
			// Set the image
			embed.setImage(image.url)
		}
	}

	// Check if the buttons are provided
	if (buttons && buttons.length > 0) {
		// Create the buttons
		const button_builders = buttons.map((button) => {
			if (button instanceof Discord.ButtonBuilder) return button
			return new Discord.ButtonBuilder(button as Discord.APIButtonComponent)
		})

		// Create the action row
		action_row =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				button_builders
			)
	}

	return {
		embed,
		attachment: attachment ?? undefined,
		action_row: action_row ?? undefined,
	}
}

export { createUniversalEmbed }
