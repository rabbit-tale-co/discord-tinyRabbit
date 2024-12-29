import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'
import type { TempVCConfig } from '../types/tempvc'

/**
 * @param {Discord.ClientUser['id']} bot_id - ID bot
 * @param {Discord.Guild['id']} guild_id - ID guild
 * @param {Discord.Channel['id']} channel_id - ID channel
 * @param {Discord.User['id']} creator_id - ID creator
 * @param {Date} expire_at - Expiration time
 */
async function saveTempChannelToDB(
	bot_id: string,
	guild_id: string,
	channel_id: string,
	creator_id: string,
	expire_at: Date
) {
	const { error } = await supabase.from('temp_voice_channels').insert({
		bot_id: bot_id,
		guild_id: guild_id,
		channel_id: channel_id,
		creator_id: creator_id,
		expire_at: expire_at.toISOString(),
	})

	if (error) {
		bunnyLog.error('Error saving temporary channel to database:', error)
	}
}

/**
 * @param {Discord.Channel['id']} channel_id - ID channel
 * @param {Discord.Guild['id']} guild_id - ID guild
 * @param {Discord.ClientUser['id']} bot_id - ID bot
 */
async function deleteTemporaryChannel(
	channel_id: Discord.Channel['id'],
	guild_id: Discord.Guild['id'],
	bot_id: Discord.ClientUser['id']
) {
	const { error } = await supabase
		.from('temp_voice_channels')
		.delete()
		.match({ channel_id: channel_id, guild_id: guild_id, bot_id: bot_id })

	if (error) {
		bunnyLog.error('Error deleting temporary channel from database:', error)
	}
}

/**
 * @param {Discord.Client} client - Discord client
 */
async function checkAndUpdateChannels(client: Discord.Client) {
	const now = new Date()
	const { data, error } = await supabase.from('temp_voice_channels').select('*')

	if (error) {
		bunnyLog.error('Error fetching temp channels:', error)
		return
	}

	for (const channel of data) {
		const guild = await client.guilds.fetch(channel.guild_id)
		if (!guild) continue

		const voiceChannel = guild.channels.cache.get(
			channel.channel_id
		) as Discord.VoiceChannel

		if (voiceChannel) {
			const expirationTime = new Date(channel.expiration_time)
			if (now > expirationTime || voiceChannel.members.size === 0) {
				try {
					await voiceChannel.delete()
					await deleteTemporaryChannel(
						channel.channel_id,
						channel.guild_id,
						channel.bot_id
					)
					bunnyLog.success(
						`Deleted temporary voice channel: ${voiceChannel.name}`
					)
				} catch (error) {
					bunnyLog.error(`Error deleting channel ${channel.channel_id}:`, error)
				}
			}
		} else {
			// Kanał już nie istnieje, usuń z bazy danych
			await deleteTemporaryChannel(
				channel.channel_id,
				channel.guild_id,
				channel.bot_id
			)
		}
	}
}

export { saveTempChannelToDB, deleteTemporaryChannel, checkAndUpdateChannels }

export async function getTempChannels(): Promise<TempVCConfig[]> {
	const { data, error } = await supabase.from('temp_voice_channels').select('*')

	if (error) {
		bunnyLog.error('Error fetching temp channels:', error)
		return []
	}

	// bunnyLog.info(`Fetched ${data.length} temp channels from database`)

	return data.map((channel) => ({
		...channel,
		expire_at: new Date(channel.expire_at).getTime(),
	})) as TempVCConfig[]
}
