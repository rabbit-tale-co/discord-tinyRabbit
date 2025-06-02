import type * as Discord from 'discord.js'
import { ServiceLogger, StatusLogger } from '@/utils/bunnyLogger.js'
import { MusicService } from '@/discord/services/music.js'

/**
 * Start playing music in a voice channel.
 * @param client - The Discord client.
 * @param guildId - The guild ID.
 * @param voiceChannelId - The voice channel ID.
 * @param query - A search query or direct URL.
 */
export async function playMusic(
	client: Discord.Client,
	guild_id: Discord.Guild['id'],
	voice_channel_id: Discord.VoiceChannel['id'],
	query: Discord.Snowflake
): Promise<void> {
	try {
		const service = MusicService.getInstance(client, guild_id)
		await service.connect(voice_channel_id)
		await service.play(query)
		StatusLogger.success(`Started music streaming in guild ${guild_id}`)
	} catch (error) {
		ServiceLogger.error('music', error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Pause the current music.
 * @param client - The Discord client.
 * @param guildId - The guild ID.
 */
export async function pauseMusic(
	client: Discord.Client,
	guild_id: Discord.Guild['id']
): Promise<void> {
	try {
		const service = MusicService.getInstance(client, guild_id)

		await service.pause()
		StatusLogger.success(`Paused music in guild ${guild_id}`)
	} catch (error) {
		ServiceLogger.error('music', error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Resume the current music.
 * @param client - The Discord client.
 * @param guildId - The guild ID.
 */
export async function resumeMusic(
	client: Discord.Client,
	guild_id: Discord.Guild['id']
): Promise<void> {
	try {
		const service = MusicService.getInstance(client, guild_id)

		await service.resume()
		StatusLogger.success(`Resumed music in guild ${guild_id}`)
	} catch (error) {
		ServiceLogger.error('music', error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Skip the current track.
 * @param client - The Discord client.
 * @param guildId - The guild ID.
 */
export async function skipTrack(
	client: Discord.Client,
	guild_id: Discord.Guild['id']
): Promise<void> {
	try {
		const service = MusicService.getInstance(client, guild_id)

		await service.skip()
		StatusLogger.success(`Skipped track in guild ${guild_id}`)
	} catch (error) {
		ServiceLogger.error('music', error instanceof Error ? error : new Error(String(error)))
	}
}

/**
 * Stop music playback and disconnect.
 * @param client - The Discord client.
 * @param guildId - The guild ID.
 */
export async function stopMusic(
	client: Discord.Client,
	guild_id: Discord.Guild['id']
): Promise<void> {
	try {
		const service = MusicService.getInstance(client, guild_id)

		await service.stop()
		StatusLogger.success(`Stopped music in guild ${guild_id}`)
	} catch (error) {
		ServiceLogger.error('music', error instanceof Error ? error : new Error(String(error)))
	}
}
