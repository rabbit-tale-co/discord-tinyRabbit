import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import * as tempvcAPI from '../api/tempvc'
import { getPluginConfig } from '../api/plugins'
import type * as TempVC from '../types/tempvc'

// Update the type to Bun.Timer if you're using Bun, otherwise NodeJS.Timeout
const updateIntervals = new Map<string, Timer>()
const expirationCache = new Map<string, number>()
const TIME_INTERVAL = 5 * 60 * 1000 // 5 minutes

/**
 * Initialize temporary voice channels.
 * @param {Discord.Client} client - The Discord client.
 */
export async function initializeTempChannels(client: Discord.Client) {
	// bunnyLog.info('Initializing temporary voice channels...')

	// Get the temporary channels from the database
	const tempChannels = await tempvcAPI.getTempChannels()

	for (const channelData of tempChannels) {
		// Get the guild from the client
		const guild = client.guilds.cache.get(channelData.guild_id)

		// If the guild is not found, continue
		if (!guild) {
			// bunnyLog.warn(
			// 	`Guild ${channelData.guild_id} not found for temp channel ${channelData.channel_id}`
			// )
			continue
		}

		// Get the channel from the guild
		const channel = guild.channels.cache.get(channelData.channel_id)

		// If the channel is not found, delete it from the database and continue
		if (!channel) {
			// bunnyLog.info(
			// 	`Temp channel ${channelData.channel_id} not found in guild ${guild.name}, removing from database`
			// )
			await tempvcAPI.deleteTemporaryChannel(
				channelData.channel_id,
				channelData.guild_id,
				channelData.bot_id
			)

			// Continue to the next iteration
			continue
		}

		// Get the expiration time from the database
		const expirationTime = new Date(channelData.expire_at).getTime()

		// Set the expiration time in the cache
		expirationCache.set(channelData.channel_id, expirationTime)

		// Start checking for expiration
		startExpirationCheck(client, channelData.channel_id)

		// bunnyLog.info(
		// 	`Restored temp channel: ${channel.name} in guild ${guild.name}`
		// )
	}

	// bunnyLog.success(
	// 	`Initialized ${tempChannels.length} temporary voice channels`
	// )
}

/**
 * Create a private voice channel for a member.
 */
export const createPrivateVoiceChannel: TempVC.CreatePrivateVoiceChannelFunction =
	async (state, config) => {
		// If the member is not found, return
		if (!state.member) {
			bunnyLog.warn('No member found in voice state.')
			return
		}

		// Get the temporary voice category
		const tempCategory = await getTempVoiceCategory(state.guild)

		// Get the duration for the member
		const duration = getDurationForMember(state.member, config.durations)

		// Get the expiration time
		const expirationTime = Date.now() + duration * 60 * 1000

		// Log the creation of the channel
		bunnyLog.info(
			`Creating channel for ${state.member.displayName}, expires at ${new Date(
				expirationTime
			).toLocaleString()}`
		)

		//TODO: if user will change channel name, than brin it back to original/or disable opiton to change name

		try {
			// Get the AFK channel
			const afkChannel = state.guild.afkChannel

			// Get the position for the new channel
			let position: number

			// If the AFK channel is in the same category, place the new channel above the AFK channel
			if (afkChannel && afkChannel.parentId === tempCategory.id) {
				position = afkChannel.position - 1 // Position above the AFK channel
				if (position < 0) position = 0 // Ensure position is not negative
			} else {
				// If AFK channel is not in the category or doesn't exist, place at the end
				position = tempCategory.children.cache.size
			}

			// Create the new channel
			const newChannel = await state.guild.channels.create({
				name: `╏🎧・${state.member.displayName}'s VC`,
				type: Discord.ChannelType.GuildVoice,
				parent: tempCategory.id,
				position: position,
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

			// Set the channel for the member
			await state.setChannel(newChannel)

			// Save the temporary channel to the database
			await tempvcAPI.saveTempChannelToDB(
				state.client?.user?.id || '',
				state.guild.id,
				newChannel.id,
				state.member.id,
				new Date(expirationTime)
			)

			// Set the expiration time in the cache
			expirationCache.set(newChannel.id, expirationTime)

			// Start checking for expiration
			startExpirationCheck(state.client, newChannel.id)

			// Log the creation of the channel
			bunnyLog.success(
				`Created and moved user to temporary voice channel: ${newChannel.name}, duration: ${duration} minutes`
			)
		} catch (error) {
			// Log the error
			bunnyLog.error('Error creating temporary voice channel:', error)
		}
	}

/**
 * Get the duration for a member based on their roles.
 * @param {Discord.GuildMember} member - The member.
 * @param {TempVC.DurationConfig[]} durations - The durations.
 * @returns {number} The duration.
 */
const getDurationForMember: TempVC.GetDurationForMemberFunction = (
	member: Discord.GuildMember,
	durations: TempVC.DurationConfig[]
): number => {
	// If the durations are not set, return 90 minutes
	if (!durations || durations.length === 0) return 90

	// Loop through the durations
	for (const config of durations) {
		// If the member has the role, return the duration
		if (member.roles.cache.has(config.role_id)) {
			// Return the duration
			return config.duration
		}
	}

	// If no duration is found, return 90 minutes
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
export const handleVoiceStateUpdate: TempVC.HandleVoiceStateUpdateFunction =
	async (oldState, newState) => {
		// Get the configuration for the plugin
		const config = (await getPluginConfig(
			newState.client?.user?.id || '',
			newState.guild.id,
			'tempvc'
		)) as TempVC.PluginConfig

		// If the plugin is not enabled, return
		if (!config.enabled) return

		// Check if the user joins the temporary voice channel creation channel
		if (newState.channel?.id === config.channel_id && newState.member) {
			// Create the private voice channel
			await createPrivateVoiceChannel(newState, config)
		}

		// Check if the user leaves a temporary voice channel
		if (oldState.channel && oldState.channel.id !== config.channel_id) {
			// Get the temporary channels
			const tempChannels = await tempvcAPI.getTempChannels()

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
						await tempvcAPI.deleteTemporaryChannel(
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
		const tempChannels = await tempvcAPI.getTempChannels()

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
		await tempvcAPI.deleteTemporaryChannel(
			channel_id,
			guild.id,
			client.user?.id || ''
		)

		// Stop the expiration check
		stopExpirationCheck(channel_id)
		return
	}

	// If the time left is less than or equal to 0 or the channel is empty, delete it
	if (timeLeft <= 0 || channel.members.size === 0) {
		try {
			// Delete the channel
			await channel.delete()

			// Delete the temporary channel from the database
			await tempvcAPI.deleteTemporaryChannel(
				channel_id,
				guild.id,
				client.user?.id || ''
			)

			// Stop the expiration check
			stopExpirationCheck(channel_id)

			// Log the deletion of the channel
			bunnyLog.success(`Deleted expired or empty channel: ${channel.name}`)
		} catch (error) {
			bunnyLog.error(`Error deleting channel ${channel_id}:`, error)
		}
		return
	}

	// Update channel name with time left
	try {
		// Get the total minutes left
		const totalMinutesLeft = Math.ceil(timeLeft / (60 * 1000))

		// Get the hours left
		const hoursLeft = Math.floor(totalMinutesLeft / 60)

		// Get the minutes left
		const minutesLeft = totalMinutesLeft % 60

		const timeString = `(${hoursLeft}h ${minutesLeft}m)`

		// Get the base name of the channel
		const baseName = channel.name.split(' (')[0] // Usuń poprzedni czas z nazwy

		// Create the new name
		const newName = `${baseName} ${timeString}`

		// If the channel name is not the new name, update it
		if (channel.name !== newName) {
			// Update the channel name
			await channel.setName(newName)

			// Log the update
			//bunnyLog.info(`Updated channel name to: ${newName}`)
		}
	} catch (error) {
		bunnyLog.error(`Error updating channel name for ${channel_id}:`, error)
	}
}

/**
 * Load expiration times into cache and start intervals.
 * @param {Discord.Client} client - The Discord client.
 */
export async function loadExpirationTimesIntoCache(client: Discord.Client) {
	// Get the temporary channels
	const tempChannels = await tempvcAPI.getTempChannels()

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
