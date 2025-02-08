import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import * as api from '@/api/index.js'
import type * as Types from '@/types/index.js'
import * as utils from '@/utils/index.js'

// Update the type to Bun.Timer if you're using Bun, otherwise NodeJS.Timeout
const updateIntervals = new Map<string, Timer>()
const expirationCache = new Map<string, number>()

// Global map to store update messages sent in the associated text channels for temporary voice channels.
const voiceUpdateMessages = new Map<string, Discord.Message>()

/**
 * Create a private voice channel for a member.
 */
export const createPrivateVoiceChannel = async (state: Discord.VoiceState) => {
	// If the member is not found, return
	if (!state.member) {
		bunnyLog.warn('No member found in voice state.')

		return
	}

	const config = await api.getPluginConfig(
		state.client?.user?.id || '',
		state.guild.id,
		'tempvc'
	)

	// Use the channel the user joined as trigger. If it has a parent, use that category;
	// otherwise, fallback to the default temporary voice category.

	let parentCategory: Discord.CategoryChannel
	if (state.channel?.parentId) {
		const cat = state.guild.channels.cache.get(state.channel.parentId)
		if (cat && cat.type === Discord.ChannelType.GuildCategory) {
			parentCategory = cat as Discord.CategoryChannel
		} else {
			parentCategory = await getTempVoiceCategory(state.guild)
		}
	} else {
		parentCategory = await getTempVoiceCategory(state.guild)
	}

	// Compute the position: place it immediately below the "join to create" channel.
	let position = 0
	if (state.channel) {
		position = state.channel.position + 1
	} else {
		position = parentCategory.children.cache.size
	}

	// Get the duration for the member
	const duration = getDurationForMember(state.member, config.durations)

	// Compute the expiration time
	const expirationTime = Date.now() + duration * 60 * 1000

	try {
		// Get the AFK channel if available (not essential in this updated logic)
		const afkChannel = state.guild.afkChannel

		// Create the new voice channel under the determined parent category
		const newChannel = await state.guild.channels.create({
			name: utils.replacePlaceholders(config.title, state.member, state.guild), // `╏🎧・${state.member.displayName}'s VC`,

			type: Discord.ChannelType.GuildVoice,
			parent: parentCategory.id,
			position: position, // initial position value; we'll adjust it below.
			permissionOverwrites: [
				{
					id: state.member.id,
					deny: [Discord.PermissionFlagsBits.ManageChannels],
				},
				{
					id: state.guild.id,
					allow: [
						Discord.PermissionFlagsBits.ViewChannel,
						Discord.PermissionFlagsBits.Connect,
					],
				},
			],
		})
		// Force the new channel's position:
		// If the "join to create" and the AFK channel are in the same category, then:
		// - If the join channel is above the AFK channel, insert the new channel between them.
		// - Otherwise, simply place it below the join channel.
		// If there's no AFK channel in the same category, place the new channel immediately below the join channel.
		{
			const afkChannel = state.guild.afkChannel
			if (
				state.channel &&
				afkChannel &&
				state.channel.parentId &&
				afkChannel.parentId === state.channel.parentId
			) {
				if (state.channel.position < afkChannel.position) {
					// Join is above AFK; insert between.
					const desiredPos = state.channel.position + 1
					if (desiredPos >= afkChannel.position) {
						await newChannel.setPosition(afkChannel.position - 1)
					} else {
						await newChannel.setPosition(desiredPos)
					}
				} else {
					// Join is not above AFK; simply place below the join channel.
					await newChannel.setPosition(state.channel.position + 1)
				}
			} else {
				// No AFK channel in the same category; place immediately below the join channel.
				await newChannel.setPosition(
					state.channel ? state.channel.position + 1 : 0
				)
			}
		}

		// bunnyLog.success(`Temporary voice channel created: ${newChannel.name}`)

		// Set the channel for the member and continue as before...
		await state.setChannel(newChannel)
		await api.saveTempChannelToDB(
			state.client?.user?.id || '',
			state.guild.id,
			newChannel.id,
			state.member.id,
			new Date(expirationTime)
		)
		expirationCache.set(newChannel.id, expirationTime)
		startExpirationCheck(state.client, newChannel.id)

		// If the new voice channel supports text (e.g. built-in chat), send an update message directly.
		if (newChannel.isTextBased()) {
			try {
				const expirationUnix = Math.floor(expirationTime / 1000)
				const updateMsg = await newChannel.send(
					`**Temporary Voice Channel Created**\nChannel: **${newChannel.name}**\nExpires At: <t:${expirationUnix}:F> (<t:${expirationUnix}:R>)`
				)
				voiceUpdateMessages.set(newChannel.id, updateMsg)
			} catch (error) {
				bunnyLog.error(
					'Failed to send update message directly in the voice channel:',
					error
				)
			}
		}
	} catch (error) {
		bunnyLog.error('Error creating temporary voice channel:', error)
	}
}

/**
 * Get the duration for a member based on their roles.
 * @param {Discord.GuildMember} member - The member.
 * @param {TempVC.DurationConfig[]} durations - The durations.
 * @returns {number} The duration.
 */
const getDurationForMember = (
	member: Discord.GuildMember,
	durations: Types.DefaultConfigs['tempvc']['durations']
): number => {
	// If durations is not set or empty, return 90 minutes.

	if (!durations || (Array.isArray(durations) && durations.length === 0))
		return 90

	// Ensure durations is an array.
	const durationArray = Array.isArray(durations)
		? durations
		: (Object.values(durations) as Types.DefaultConfigs['tempvc']['durations'])

	// Loop through the durations.
	for (const config of durationArray) {
		if (member.roles.cache.has(config.role_id)) {
			return config.minutes
		}
	}

	// Fallback to 90 minutes.
	return 90
}

/**
 * Get or create the temporary voice category for a guild.
 * @param {Discord.Guild} guild - The guild.
 * @returns {Promise<Discord.CategoryChannel>} The temporary voice category.
 */
async function getTempVoiceCategory(
	guild: Discord.Guild
): Promise<Discord.CategoryChannel> {
	// Get the category from the guild
	let category = guild.channels.cache.find(
		(c) =>
			c.type === Discord.ChannelType.GuildCategory &&
			c.name === 'Temporary Voice Channels'
	) as Discord.CategoryChannel | undefined

	// If the category is not found, create it
	if (!category) {
		// Create the category
		category = await guild.channels.create({
			name: 'Temporary Voice Channels',
			type: Discord.ChannelType.GuildCategory,
		})
	}

	// Return the category
	return category
}

/**
 * Handle voice state updates to manage temporary voice channels.
 */
export const handleVoiceStateUpdate = async (
	oldState: Discord.VoiceState,
	newState: Discord.VoiceState
) => {
	// Get the configuration for the plugin
	const config = await api.getPluginConfig(
		newState.client?.user?.id || '',
		newState.guild.id,
		'tempvc'
	)

	// If the plugin is not enabled, return
	if (!config.enabled) return

	// Check if the user joins the temporary voice channel creation channel
	if (newState.channel?.id === config.channel_id && newState.member) {
		// Create the private voice channel
		await createPrivateVoiceChannel(newState)
	}

	// Check if the user leaves a temporary voice channel
	if (oldState.channel && oldState.channel.id !== config.channel_id) {
		// Get the temporary channels
		const tempChannels = await api.getTempChannels()

		// Check if the channel is a temporary channel
		const isTempChannel = tempChannels.some(
			(ch) => ch.channel_id === oldState.channel?.id
		)

		// If the channel is a temporary channel, delete it
		if (isTempChannel) {
			// Get the current channel
			const currentChannel = oldState.guild.channels.cache.get(
				oldState.channel.id
			) as Discord.VoiceChannel | undefined

			// If the channel is empty, delete it
			if (currentChannel && currentChannel.members.size === 0) {
				try {
					// Delete the channel
					await currentChannel.delete()

					// Delete the temporary channel from the database
					await api.deleteTemporaryChannel(
						currentChannel.id,
						oldState.guild.id,
						oldState.client?.user?.id || ''
					)

					// Stop and remove the interval
					stopExpirationCheck(currentChannel.id)

					// Log the deletion of the channel
					bunnyLog.success(
						`Deleted empty temporary voice channel: ${currentChannel.name}`
					)
				} catch (error) {
					// Log the error
					bunnyLog.error(
						`Error deleting empty temporary voice channel: ${error}`
					)
				}
			}
		}
	}
}

/**
 * Start checking if a channel has expired.
 * @param {Discord.Client} client - The Discord client.
 * @param {string} channelId - The ID of the channel.
 */
function startExpirationCheck(client: Discord.Client, channelId: string) {
	// If the interval is already set, return
	if (updateIntervals.has(channelId)) return

	// Set the interval
	const interval = setInterval(
		() => checkChannelExpiration(client, channelId),
		5 * 60 * 1000 // 5 minutes
	)

	// Set the interval
	updateIntervals.set(channelId, interval)
}

/**
 * Stop checking if a channel has expired.
 * @param {string} channel_id - The ID of the channel.
 */
function stopExpirationCheck(channel_id: string) {
	// Get the interval
	const interval = updateIntervals.get(channel_id)

	// If the interval is set, clear it
	if (interval) {
		clearInterval(interval)
		updateIntervals.delete(channel_id)
	}
	expirationCache.delete(channel_id)
}

/**
 * Check if a channel has expired and delete it if necessary.
 * @param {Discord.Client} client - The Discord client.
 * @param {string} channel_id - The ID of the channel.
 */
async function checkChannelExpiration(
	client: Discord.Client,
	channel_id: string
) {
	// Get the expiration time from the cache
	let expirationTime = expirationCache.get(channel_id)

	// Fetch channel data from database if not in cache
	if (expirationTime === undefined) {
		// Get the temporary channels
		const tempChannels = await api.getTempChannels()

		// Find the channel data
		const channelData = tempChannels.find((ch) => ch.channel_id === channel_id)

		// If the channel data is not found, log a warning and stop the expiration check
		if (!channelData) {
			bunnyLog.warn(`Channel ${channel_id} not found in database`)
			stopExpirationCheck(channel_id)
			return
		}

		// Set the expiration time in the cache
		expirationTime = new Date(channelData.expire_at).getTime()
		expirationCache.set(channel_id, expirationTime)
	}

	// Get the current time
	const now = Date.now()

	// Get the time left
	const timeLeft = expirationTime - now

	// Get the guild
	const guild = client.guilds.cache.find((g) =>
		g.channels.cache.has(channel_id)
	)

	// If the guild is not found, log a warning and stop the expiration check
	if (!guild) {
		bunnyLog.warn(`Guild for channel ${channel_id} not found`)
		stopExpirationCheck(channel_id)
		return
	}

	// Get the channel
	const channel = guild.channels.cache.get(channel_id) as
		| Discord.VoiceChannel
		| undefined

	// If the channel is not found, log a warning and stop the expiration check
	if (!channel) {
		bunnyLog.info(
			`Channel ${channel_id} not found in guild, removing from cache`
		)

		// Delete the temporary channel from the database
		await api.deleteTemporaryChannel(
			channel_id,
			guild.id,
			client.user?.id || ''
		)

		// Stop the expiration check
		stopExpirationCheck(channel_id)
		return
	}

	// If the time left is less than or equal to 0 or the channel is empty, delete it,
	// and notify the creator.
	if (timeLeft <= 0 || channel.members.size === 0) {
		try {
			// Delete the channel
			await channel.delete()

			// Delete the temporary channel from the database
			await api.deleteTemporaryChannel(
				channel_id,
				guild.id,
				client.user?.id || ''
			)

			// Stop the expiration check
			stopExpirationCheck(channel_id)

			// Update the associated text channel message to notify expiration, then remove from map.
			if (voiceUpdateMessages.has(channel_id)) {
				const updateMsg = voiceUpdateMessages.get(channel_id)
				try {
					await updateMsg?.edit({
						content: `**Temporary Voice Channel Update**\nChannel: **${channel.name}**\nThis channel has **expired and been deleted**.`,
					})
				} catch (err) {
					// FIXME: this error happens every time when channel is deleted (time expiration)
					bunnyLog.error(
						`Failed to update final update message for channel ${channel_id}:`,
						err
					)
				}
				voiceUpdateMessages.delete(channel_id)
			}

			// bunnyLog.success(`Deleted expired or empty channel: ${channel.name}`)
		} catch (error) {
			bunnyLog.error(`Error deleting channel ${channel_id}:`, error)
		}
		return
	}

	// Update channel name with time remaining
	const totalMinutesLeft = Math.ceil(timeLeft / (60 * 1000))
	const hoursLeft = Math.floor(totalMinutesLeft / 60)
	const minutesLeft = totalMinutesLeft % 60
	const timeString = `(${hoursLeft}h ${minutesLeft}m)`

	// Get base name by removing existing time if present
	const baseName = channel.name.split(' (')[0]

	// Create new name with updated time
	const newName = `${baseName} ${timeString}`

	//TODO: probably too many updates, maybe do not update channel name at all?
	if (channel.name !== newName) {
		await channel.setName(newName)

		// Update the associated text channel message with expiration time using Discord timestamp formatting.
		if (voiceUpdateMessages.has(channel_id)) {
			const expirationUnix = Math.floor(expirationTime / 1000)
			const updateMsg = voiceUpdateMessages.get(channel_id)
			try {
				await updateMsg?.edit({
					content: `**Temporary Voice Channel Update**\nChannel: **${channel.name}**\nExpires At: <t:${expirationUnix}:F> (<t:${expirationUnix}:R>)`,
				})
			} catch (err) {
				bunnyLog.error(
					`Failed to update update message for channel ${channel_id}:`,
					err
				)
			}
		}
	}
}

/**
 * Load expiration times into cache and start intervals.
 * @param {Discord.Client} client - The Discord client.
 */
export async function loadExpirationTimesIntoCache(client: Discord.Client) {
	// Get the temporary channels
	const tempChannels = await api.getTempChannels()

	// Loop through the temporary channels
	for (const channelData of tempChannels) {
		// Get the expiration time
		const expirationTime = new Date(channelData.expire_at).getTime()

		// Set the expiration time in the cache
		expirationCache.set(channelData.channel_id, expirationTime)
		startExpirationCheck(client, channelData.channel_id)
	}

	// Log the loading of the expiration times
	//bunnyLog.info(`Loaded ${tempChannels.length} expiration times into cache`)
}

/**
 * Cleanup expired or empty temporary voice channels.
 */
export async function cleanupExpiredTempChannels(client: Discord.Client) {
	// Get all temporary channels from the database
	const tempChannels = await api.getTempChannels()

	// Process each temporary channel with aggregated logging
	let cleanedCount = 0
	for (const channelData of tempChannels) {
		const guild = client.guilds.cache.get(channelData.guild_id)
		if (!guild) continue

		// Fetch the channel from the guild as a VoiceChannel
		const channel = guild.channels.cache.get(channelData.channel_id) as
			| Discord.VoiceChannel
			| undefined

		// Compute expiration time from the database record
		const expirationTime = new Date(channelData.expire_at).getTime()

		// If the channel doesn't exist, remove it from the database and continue
		if (!channel) {
			await api.deleteTemporaryChannel(
				channelData.channel_id,
				channelData.guild_id,
				channelData.bot_id
			)
			continue
		}

		// Check if the channel is expired or empty by using the current voice states cache.
		const voiceStateCount = guild.voiceStates.cache.filter(
			(vs) => vs.channelId === channel.id
		).size
		if (Date.now() >= expirationTime || voiceStateCount === 0) {
			try {
				await channel.delete()
				await api.deleteTemporaryChannel(
					channelData.channel_id,
					channelData.guild_id,
					channelData.bot_id
				)
				cleanedCount++
			} catch (err) {
				bunnyLog.error(`Failed to clean up channel ${channel.id}:`, err)
			}
		}
	}
	if (cleanedCount > 0) {
		bunnyLog.info(
			`Cleaned up ${cleanedCount} expired temporary voice channel(s).`
		)
	}
}
