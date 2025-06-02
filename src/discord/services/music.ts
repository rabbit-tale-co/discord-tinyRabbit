import * as Discord from "discord.js";
import * as voice from "@discordjs/voice";
import playdl from "play-dl";
import type { Readable } from "node:stream";
import { StatusLogger, ServiceLogger } from '@/utils/bunnyLogger.js'

export class MusicService {
	private static instances: Map<string, MusicService> = new Map();
	private client: Discord.Client;
	private guildId: Discord.Guild["id"];
	private connection?: voice.VoiceConnection;
	private audioPlayer?: voice.AudioPlayer;
	private queue: string[] = [];
	private isPlaying = false;
	private currentTrack?: string;

	private constructor(client: Discord.Client, guildId: Discord.Guild["id"]) {
		this.client = client;
		this.guildId = guildId;
	}

	/**
	 * Get the singleton instance for a guild.
	 */
	public static getInstance(
		client: Discord.Client,
		guildId: Discord.Guild["id"],
	): MusicService {
		const key = guildId;
		if (!MusicService.instances.has(key)) {
			MusicService.instances.set(key, new MusicService(client, guildId));
		}
		return MusicService.instances.get(key) as MusicService;
	}

	/**
	 * Connect to the given voice channel using @discordjs/voice.
	 */
	public async connect(
		voiceChannelId: Discord.VoiceChannel["id"],
	): Promise<void> {
		const guild = this.client.guilds.cache.get(this.guildId);
		if (!guild) throw new Error("Guild not found");
		const channel = guild.channels.cache.get(voiceChannelId);
		if (!channel || channel.type !== Discord.ChannelType.GuildVoice) {
			throw new Error("Voice channel not found or invalid type");
		}
		this.connection = voice.joinVoiceChannel({
			channelId: voiceChannelId,
			guildId: this.guildId,
			adapterCreator: guild.voiceAdapterCreator,
			selfDeaf: false,
		});

		if (!this.audioPlayer) {
			this.audioPlayer = voice.createAudioPlayer({
				behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play },
			});
			this.connection.subscribe(this.audioPlayer);
			// Auto-play next track when current one ends
			this.audioPlayer.on(voice.AudioPlayerStatus.Idle, () => {
				StatusLogger.debug("Audio player is idle, attempting to play next track");
				this._playNext();
			});
		}
		ServiceLogger.ready(
			`voice connection for channel ${voiceChannelId} in guild ${this.guildId}`,
		);
	}

	/**
	 * Play a track by URL. This method adds the track to the queue
	 * and starts playback if not already playing.
	 * For a production bot, integrate with a search library (e.g., ytdl-core) here.
	 */
	public async play(query: string): Promise<void> {
		this.queue.push(query);
		if (!this.isPlaying) {
			this._playNext();
		} else {
			StatusLogger.info(`Queued track: ${query}`);
		}
	}

	/**
	 * Internal method to play the next track in the queue.
	 */
	private async _playNext(): Promise<void> {
		if (this.queue.length === 0) {
			StatusLogger.info("Queue is empty, stopping playback");
			this.currentTrack = undefined;
			this.isPlaying = false;
			return;
		}
		const track = this.queue.shift();
		this.currentTrack = track;
		try {
			// First, retrieve video info to verify that the player response data exists.
			const videoInfo = await playdl.video_info(track);
			StatusLogger.debug(`Video Info: ${JSON.stringify(videoInfo)}`);

			if (!videoInfo || !videoInfo.video_details) {
				throw new Error(
					"Video info is undefined. Check if the URL is playable.",
				);
			}

			const details = videoInfo.video_details as {
				player_response?: Record<string, unknown>;
			};
			const playerResponse = details.player_response;
			if (!playerResponse || Object.keys(playerResponse).length === 0) {
				StatusLogger.warn(
					"Initial Player Response Data is undefined. Proceeding without validation.",
				);
			}

			// Then stream the track.
			const streamData = await playdl.stream(track, {
				quality: 2,
				verbose: true,
			} as any);
			StatusLogger.debug(`Stream Data: ${JSON.stringify({
				type: streamData.type,
				quality: 2,
			})}`);

			const resource = voice.createAudioResource(
				streamData.stream as Readable,
				{
					inputType:
						streamData.type === "opus"
							? voice.StreamType.Opus
							: voice.StreamType.Arbitrary,
				},
			);
			this.audioPlayer?.play(resource);
			this.isPlaying = true;
			StatusLogger.success(`Now playing: ${track}`);
		} catch (error) {
			StatusLogger.error("Error creating audio resource", error as Error);
			this._playNext();
		}
	}

	/**
	 * Pause the current playback.
	 */
	public async pause(): Promise<void> {
		if (!this.audioPlayer || !this.isPlaying) {
			throw new Error("Nothing is currently playing");
		}
		this.audioPlayer.pause();
		this.isPlaying = false;
		StatusLogger.info(`Paused track: ${this.currentTrack}`);
	}

	/**
	 * Resume paused playback.
	 */
	public async resume(): Promise<void> {
		if (!this.audioPlayer) throw new Error("No audio player available");
		if (this.isPlaying) throw new Error("Music is already playing");
		this.audioPlayer.unpause();
		this.isPlaying = true;
		StatusLogger.info(`Resumed track: ${this.currentTrack}`);
	}

	/**
	 * Skip the current track.
	 */
	public async skip(): Promise<void> {
		if (!this.audioPlayer) throw new Error("No audio player available");
		StatusLogger.info(`Skipping track: ${this.currentTrack}`);
		// Stopping the player will trigger the Idle event and play the next track.
		this.audioPlayer.stop();
	}

	/**
	 * Stop playback, clear the queue, and disconnect.
	 */
	public async stop(): Promise<void> {
		this.queue = [];
		this.currentTrack = undefined;
		if (this.audioPlayer) {
			this.audioPlayer.stop();
			this.isPlaying = false;
			StatusLogger.info("Stopped music playback");
		}
		if (this.connection) {
			this.connection.destroy();
			StatusLogger.info(`Disconnected from voice channel in guild ${this.guildId}`);
			this.connection = undefined;
			this.audioPlayer = undefined;
		}
	}
}

process.on("unhandledRejection", (error) => {
	StatusLogger.error("Unhandled Rejection", error as Error);
	// Optionally, implement retry logic or further error handling here.
});
