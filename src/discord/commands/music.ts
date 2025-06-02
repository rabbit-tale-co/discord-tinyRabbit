import type * as Discord from 'discord.js'
import * as MusicAPI from '@/discord/api/music.js'
import { StatusLogger, ServiceLogger, CommandLogger } from '@/utils/bunnyLogger.js'
import { client } from '@/server.js'

// Export function for the "play" subcommand
export async function play(interaction: Discord.ChatInputCommandInteraction) {
	const query = interaction.options.getString('query', true)
	const voiceChannel = (interaction.member as Discord.GuildMember)?.voice
		?.channel
	if (!voiceChannel) {
		await interaction.reply({
			content: 'You must be in a voice channel to play music!',
		})
		return
	}
	try {
		await MusicAPI.playMusic(
			client,
			interaction.guildId,
			voiceChannel.id,
			query
		)
		await interaction.reply({ content: `Now playing: **${query}**` })
	} catch (error) {
		ServiceLogger.error('Music Play', error instanceof Error ? error : new Error(String(error)))
		await interaction.reply({ content: 'Error playing music.' })
	}
}

// Export function for the "pause" subcommand
export async function pause(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.pauseMusic(client, interaction.guildId)
		await interaction.reply({ content: 'Music paused.' })
	} catch (error) {
		ServiceLogger.error('Music Pause', error instanceof Error ? error : new Error(String(error)))

		await interaction.reply({
			content: 'Error pausing music.',
		})
	}
}

// Export function for the "resume" subcommand
export async function resume(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.resumeMusic(client, interaction.guildId)
		await interaction.reply({ content: 'Music resumed.' })
	} catch (error) {
		ServiceLogger.error('Music Resume', error instanceof Error ? error : new Error(String(error)))
		await interaction.reply({
			content: 'Error resuming music.',
		})
	}
}

// Export function for the "skip" subcommand
export async function skip(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.skipTrack(client, interaction.guildId)
		await interaction.reply({
			content: 'Skipped to the next track.',
		})
	} catch (error) {
		ServiceLogger.error('Music Skip', error instanceof Error ? error : new Error(String(error)))
		await interaction.reply({
			content: 'Error skipping track.',
		})
	}
}

// Export function for the "stop" subcommand
export async function stop(interaction: Discord.ChatInputCommandInteraction) {
	try {
		await MusicAPI.stopMusic(client, interaction.guildId)
		await interaction.reply({
			content: 'Music stopped and queue cleared.',
		})
	} catch (error) {
		ServiceLogger.error('Music Stop', error instanceof Error ? error : new Error(String(error)))
		await interaction.reply({
			content: 'Error stopping music.',
		})
	}
}

// Export stub for the "queue" subcommand
export async function queue(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Queue command not implemented yet.' })
}

// Export stub for the "clear" subcommand
export async function clear(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Clear command not implemented yet.' })
}

// Export stub for the "remove" subcommand
export async function remove(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Remove command not implemented yet.' })
}

// Export stub for the "shuffle" subcommand
export async function shuffle(
	interaction: Discord.ChatInputCommandInteraction
) {
	await interaction.reply({ content: 'Shuffle command not implemented yet.' })
}

// Export stub for the "loop" subcommand
export async function loop(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Loop command not implemented yet.' })
}

// Export stub for the "volume" subcommand
export async function volume(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Volume command not implemented yet.' })
}

// Export stub for the "nowplaying" subcommand
export async function nowPlaying(
	interaction: Discord.ChatInputCommandInteraction
) {
	await interaction.reply({
		content: 'Now playing command not implemented yet.',
	})
}

// Export stub for the "lyrics" subcommand
export async function lyrics(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Lyrics command not implemented yet.' })
}

// Export stub for the "search" subcommand
export async function search(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Search command not implemented yet.' })
}

// Export stub for the "playlist" subcommand
export async function playlist(
	interaction: Discord.ChatInputCommandInteraction
) {
	await interaction.reply({
		content: 'Playlist command not implemented yet.',
	})
}

// Export stub for the "history" subcommand
export async function history(
	interaction: Discord.ChatInputCommandInteraction
) {
	await interaction.reply({ content: 'History command not implemented yet.' })
}

// Export stub for the "help" subcommand
export async function help(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.reply({ content: 'Help command not implemented yet.' })
}
