import type * as Discord from "discord.js";
import * as MusicAPI from "@/api/music.js";
import { bunnyLog } from "bunny-log";
import { client } from "@/index.js";

// Export function for the "play" subcommand
export async function play(interaction: Discord.ChatInputCommandInteraction) {
	const query = interaction.options.getString("query", true);
	const voiceChannel = (interaction.member as Discord.GuildMember)?.voice
		?.channel;
	if (!voiceChannel) {
		await interaction.reply({
			content: "You must be in a voice channel to play music!",
		});
		return;
	}
	try {
		await MusicAPI.playMusic(
			client,
			interaction.guildId,
			voiceChannel.id,
			query,
		);
		await interaction.reply({ content: `Now playing: **${query}**` });
	} catch (error) {
		bunnyLog.error("Error playing music:", error);
		await interaction.reply({ content: "Error playing music." });
	}
}

// Export function for the "pause" subcommand
export async function pause(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.pauseMusic(client, interaction.guildId);
		await interaction.reply({ content: "Music paused." });
	} catch (error) {
		bunnyLog.error("Error pausing music:", error);

		await interaction.reply({
			content: "Error pausing music.",
		});
	}
}

// Export function for the "resume" subcommand
export async function resume(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.resumeMusic(client, interaction.guildId);
		await interaction.reply({ content: "Music resumed." });
	} catch (error) {
		bunnyLog.error("Error resuming music:", error);
		await interaction.reply({
			content: "Error resuming music.",
		});
	}
}

// Export function for the "skip" subcommand
export async function skip(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.skipTrack(client, interaction.guildId);
		await interaction.reply({
			content: "Skipped current track.",
		});
	} catch (error) {
		bunnyLog.error("Error skipping track:", error);
		await interaction.reply({
			content: "Error skipping track.",
		});
	}
}

// Export function for the "stop" subcommand
export async function stop(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.stopMusic(client, interaction.guildId);
		await interaction.reply({
			content: "Stopped music playback.",
		});
	} catch (error) {
		bunnyLog.error("Error stopping music:", error);
		await interaction.reply({
			content: "Error stopping music.",
		});
	}
}

// Export stub for the "queue" subcommand
export async function queue(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Queue functionality not implemented yet.",
	});
}

// Export stub for the "clear" subcommand
export async function clear(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Clear queue functionality not implemented yet.",
	});
}

// Export stub for the "remove" subcommand
export async function remove(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Remove track functionality not implemented yet.",
	});
}

// Export stub for the "shuffle" subcommand
export async function shuffle(
	interaction: Discord.ChatInputCommandInteraction,
) {
	await interaction.reply({
		content: "Shuffle functionality not implemented yet.",
	});
}

// Export stub for the "loop" subcommand
export async function loop(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Loop functionality not implemented yet.",
	});
}

// Export stub for the "volume" subcommand
export async function volume(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Volume control not implemented yet.",
	});
}

// Export stub for the "nowplaying" subcommand
export async function nowPlaying(
	interaction: Discord.ChatInputCommandInteraction,
) {
	await interaction.reply({
		content: "Now playing functionality not implemented yet.",
	});
}

// Export stub for the "lyrics" subcommand
export async function lyrics(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Lyrics functionality not implemented yet.",
	});
}

// Export stub for the "search" subcommand
export async function search(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Search functionality not implemented yet.",
	});
}

// Export stub for the "playlist" subcommand
export async function playlist(
	interaction: Discord.ChatInputCommandInteraction,
) {
	await interaction.reply({
		content: "Playlist functionality not implemented yet.",
	});
}

// Export stub for the "history" subcommand
export async function history(
	interaction: Discord.ChatInputCommandInteraction,
) {
	await interaction.reply({
		content: "History functionality not implemented yet.",
	});
}

// Export stub for the "help" subcommand
export async function help(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({
		content: "Music help functionality not implemented yet.",
	});
}
