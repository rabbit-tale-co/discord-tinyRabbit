import {
	EmbedBuilder,
	AttachmentBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	type APIButtonComponent,
} from 'discord.js'
import type { UniversalEmbedOptions } from '../types/embed'

/**
 * Creates a universal embed with various optional parameters.
 * @param {UniversalEmbedOptions} options - The data for the embed and additional options.
 * @returns {{ embed: EmbedBuilder; attachment?: AttachmentBuilder; action_row?: ActionRowBuilder<ButtonBuilder> }} The generated embed and optional attachment.
 */
function createUniversalEmbed({
	buttons,
	image,
	...embed_data
}: UniversalEmbedOptions): {
	embed: EmbedBuilder
	attachment?: AttachmentBuilder
	action_row?: ActionRowBuilder<ButtonBuilder>
} {
	const embed = new EmbedBuilder(embed_data)

	let attachment: AttachmentBuilder | null
	if (image?.url) {
		if (image.external) {
			attachment = new AttachmentBuilder(image.url)
		} else embed.setImage(image.url)
	}

	let action_row: ActionRowBuilder<ButtonBuilder> | null
	if (buttons && buttons.length > 0) {
		const button_builders = buttons.map((button) => {
			if (button instanceof ButtonBuilder) return button
			return new ButtonBuilder(button as APIButtonComponent)
		})

		action_row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			button_builders
		)
	}

	return { embed, attachment, action_row }
}

export { createUniversalEmbed }
