import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import { MusicService } from '@/services/music.js'

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
		bunnyLog.info(`Started music streaming in guild ${guild_id}`)
	} catch (error) {
		bunnyLog.error(`Error starting music in guild ${guild_id}:`, error)
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
		bunnyLog.info(`Paused music in guild ${guild_id}`)
	} catch (error) {
		bunnyLog.error(`Error pausing music in guild ${guild_id}:`, error)
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
		bunnyLog.info(`Resumed music in guild ${guild_id}`)
	} catch (error) {
		bunnyLog.error(`Error resuming music in guild ${guild_id}:`, error)
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
		bunnyLog.info(`Skipped track in guild ${guild_id}`)
	} catch (error) {
		bunnyLog.error(`Error skipping track in guild ${guild_id}:`, error)
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
		bunnyLog.info(`Stopped music in guild ${guild_id}`)
	} catch (error) {
		bunnyLog.error(`Error stopping music in guild ${guild_id}:`, error)
	}
}
