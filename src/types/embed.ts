import type * as Discord from 'discord.js'

interface ButtonData {
	customId?: string
	label: string
	style: Discord.ButtonStyle
	type: Discord.ComponentType.Button
}

type UniversalEmbedOptions = Discord.EmbedData & {
	buttons?: Array<ButtonData>
	image?: { url: Discord.Snowflake; external?: boolean }
}

export type { UniversalEmbedOptions, ButtonData }
