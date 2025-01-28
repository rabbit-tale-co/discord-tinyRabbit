import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

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
 * Delete a temporary voice channel from the database.
 * @param {Discord.Channel['id']} channel_id - ID channel
 * @param {Discord.Guild['id']} guild_id - ID guild
 * @param {Discord.ClientUser['id']} bot_id - ID bot
 */
async function deleteTemporaryChannel(
	channel_id: Discord.Channel['id'],
	guild_id: Discord.Guild['id'],
	bot_id: Discord.ClientUser['id']
) {
	// Try to delete the temporary voice channel from the database
	const { error } = await supabase
		.from('temp_voice_channels')
		.delete()
		.match({ channel_id: channel_id, guild_id: guild_id, bot_id: bot_id })

	// Check if there is an error deleting the temporary voice channel
	if (error) {
		bunnyLog.error('Error deleting temporary channel from database:', error)
	}
}

/**
 * Check and update temporary voice channels.
 * @param {Discord.Client} client - Discord client
 */
async function checkAndUpdateChannels(client: Discord.Client) {
	// Get the current time
	const now = new Date()

	// Try to fetch the temporary voice channels from the database
	const { data, error } = await supabase.from('temp_voice_channels').select('*')

	// Check if there is an error fetching the temporary voice channels
	if (error) {
		bunnyLog.error('Error fetching temp channels:', error)
		return
	}

	// Iterate over each temporary voice channel
	for (const channel of data) {
		// Fetch the guild
		const guild = await client.guilds.fetch(channel.guild_id)

		// Check if the guild exists
		if (!guild) continue

		// Fetch the voice channel
		const voiceChannel = guild.channels.cache.get(
			channel.channel_id
		) as Discord.VoiceChannel

		// Check if the voice channel exists
		if (voiceChannel) {
			// Get the expiration time
			const expirationTime = new Date(channel.expiration_time)

			// Check if the expiration time is in the past or if the voice channel has no members
			if (now > expirationTime || voiceChannel.members.size === 0) {
				try {
					// Delete the voice channel
					await voiceChannel.delete()

					// Delete the temporary voice channel from the database
					await deleteTemporaryChannel(
						channel.channel_id,
						channel.guild_id,
						channel.bot_id
					)

					// Log the success
					bunnyLog.success(
						`Deleted temporary voice channel: ${voiceChannel.name}`
					)
				} catch (error) {
					bunnyLog.error(`Error deleting channel ${channel.channel_id}:`, error)
				}
			}
		} else {
			// The voice channel no longer exists, delete it from the database
			await deleteTemporaryChannel(
				channel.channel_id,
				channel.guild_id,
				channel.bot_id
			)
		}
	}
}

export { saveTempChannelToDB, deleteTemporaryChannel, checkAndUpdateChannels }

/**
 * Get temporary voice channels from the database.
 * @returns {Promise<TempVCConfig[]>} - An array of temporary voice channels.
 */
export async function getTempChannels(): Promise<TempVCConfig[]> {
	// Try to fetch the temporary voice channels from the database
	const { data, error } = await supabase.from('temp_voice_channels').select('*')

	// Check if there is an error fetching the temporary voice channels
	if (error) {
		bunnyLog.error('Error fetching temp channels:', error)
		return []
	}

	// bunnyLog.info(`Fetched ${data.length} temp channels from database`)

	// Return the temporary voice channels
	return data.map((channel) => ({
		...channel,
		expire_at: new Date(channel.expire_at).getTime(),
	})) as TempVCConfig[]
}
