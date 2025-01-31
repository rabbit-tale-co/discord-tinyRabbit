import type * as Discord from "discord.js";

export interface DurationConfig {
	role_id: string;
	duration: number;
}

export interface PluginConfig {
	enabled: boolean;
	channel_id: string;
	durations: DurationConfig[];
}

export type CreatePrivateVoiceChannelFunction = (
	state: Discord.VoiceState,
	config: PluginConfig,
) => Promise<void>;

export type GetDurationForMemberFunction = (
	member: Discord.GuildMember,
	durations: DurationConfig[],
) => number;

export type HandleVoiceStateUpdateFunction = (
	oldState: Discord.VoiceState,
	newState: Discord.VoiceState,
) => Promise<void>;

export interface TempVC {
	guild_id: string;
	channel_id: string;
	bot_id: string;
	user_id: string;
	expire_at: Date;
}
