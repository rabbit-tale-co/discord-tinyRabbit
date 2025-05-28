import type * as Discord from "discord.js";

interface ButtonData {
	custom_id?: string;
	label: string;
	style: Discord.ButtonStyle;
	type: Discord.ComponentType.Button;
}

type UniversalEmbedOptions = Discord.EmbedData & {
	buttons?: Array<ButtonData>;
	image?: { url: Discord.Snowflake; external?: boolean };
};

export type { UniversalEmbedOptions, ButtonData };
