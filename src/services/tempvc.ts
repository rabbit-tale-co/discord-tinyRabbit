import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import {
	saveTempChannelToDB,
	getTempChannels,
	deleteTemporaryChannel,
} from '../api/tempvc'
import { getPluginConfig } from '../api/plugins'
import type * as TempVC from '../types/tempvc'

// Update the type to Bun.Timer if you're using Bun, otherwise NodeJS.Timeout
const updateIntervals = new Map<string, Timer>()
const expirationCache = new Map<string, number>()
const TIME_INTERVAL = 5 * 60 * 1000 // 5 minutes

export async function initializeTempChannels(client: Discord.Client) {
	// bunnyLog.info('Initializing temporary voice channels...')
	const tempChannels = await getTempChannels()

	for (const channelData of tempChannels) {
		const guild = client.guilds.cache.get(channelData.guild_id)
		if (!guild) {
			// bunnyLog.warn(
			// 	`Guild ${channelData.guild_id} not found for temp channel ${channelData.channel_id}`
			// )
			continue
		}

		const channel = guild.channels.cache.get(channelData.channel_id)
		if (!channel) {
			// bunnyLog.info(
			// 	`Temp channel ${channelData.channel_id} not found in guild ${guild.name}, removing from database`
			// )
			await deleteTemporaryChannel(
				channelData.channel_id,
				channelData.guild_id,
				channelData.bot_id
			)
			continue
		}

		const expirationTime = new Date(channelData.expire_at).getTime()
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
		if (!state.member) {
			bunnyLog.warn('No member found in voice state.')
			return
		}

		const tempCategory = await getTempVoiceCategory(state.guild)
		const duration = getDurationForMember(state.member, config.durations)
		const expirationTime = Date.now() + duration * 60 * 1000

		bunnyLog.info(
			`Creating channel for ${state.member.displayName}, expires at ${new Date(
				expirationTime
			).toLocaleString()}`
		)

		//TODO: if user will change channel name, than brin it back to original/or disable opiton to change name
		try {
			const afkChannel = state.guild.afkChannel
			let position: number

			if (afkChannel && afkChannel.parentId === tempCategory.id) {
				// AFK channel is in the same category
				position = afkChannel.position - 1 // Position above the AFK channel
				if (position < 0) position = 0 // Ensure position is not negative
			} else {
				// If AFK channel is not in the category or doesn't exist, place at the end
				position = tempCategory.children.cache.size
			}

			const newChannel = await state.guild.channels.create({
				name: `╏🎧・${state.member.displayName}'s VC`,
				type: Discord.ChannelType.GuildVoice,
				parent: tempCategory.id,
				position: position,
				permissionOverwrites: [
					{
						id: state.member.id,
						// allow: [
						// 	Discord.PermissionFlagsBits.ManageChannels,
						// 	Discord.PermissionFlagsBits.MoveMembers,
						// ],
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

			await state.setChannel(newChannel)

			await saveTempChannelToDB(
				state.client.user.id,
				state.guild.id,
				newChannel.id,
				state.member.id,
				new Date(expirationTime)
			)

			expirationCache.set(newChannel.id, expirationTime)

			// Start checking for expiration
			startExpirationCheck(state.client, newChannel.id)

			bunnyLog.success(
				`Created and moved user to temporary voice channel: ${newChannel.name}, duration: ${duration} minutes`
			)
		} catch (error) {
			bunnyLog.error('Error creating temporary voice channel:', error)
		}
	}

/**
 * Get the duration for a member based on their roles.
 */
const getDurationForMember: TempVC.GetDurationForMemberFunction = (
	member,
	durations
) => {
	if (!durations || durations.length === 0) return 90

	for (const config of durations) {
		if (member.roles.cache.has(config.role_id)) {
			return config.duration
		}
	}

	return 90
}

/**
 * Get or create the temporary voice category for a guild.
 */
async function getTempVoiceCategory(
	guild: Discord.Guild
): Promise<Discord.CategoryChannel> {
	let category = guild.channels.cache.find(
		(c) =>
			c.type === Discord.ChannelType.GuildCategory &&
			c.name === 'Temporary Voice Channels'
	) as Discord.CategoryChannel | undefined

	if (!category) {
		category = await guild.channels.create({
			name: 'Temporary Voice Channels',
			type: Discord.ChannelType.GuildCategory,
		})
	}

	return category
}

/**
 * Handle voice state updates to manage temporary voice channels.
 */
export const handleVoiceStateUpdate: TempVC.HandleVoiceStateUpdateFunction =
	async (oldState, newState) => {
		const config = (await getPluginConfig(
			newState.client?.user?.id || '',
			newState.guild.id,
			'tempvc'
		)) as TempVC.PluginConfig

		if (!config.enabled) return

		// Check if the user joins the temporary voice channel creation channel
		if (newState.channel?.id === config.channel_id && newState.member) {
			await createPrivateVoiceChannel(newState, config)
		}

		// Check if the user leaves a temporary voice channel
		if (oldState.channel && oldState.channel.id !== config.channel_id) {
			const tempChannels = await getTempChannels()
			const isTempChannel = tempChannels.some(
				(ch) => ch.channel_id === oldState.channel?.id
			)

			if (isTempChannel) {
				const currentChannel = oldState.guild.channels.cache.get(
					oldState.channel.id
				) as Discord.VoiceChannel | undefined

				if (currentChannel && currentChannel.members.size === 0) {
					try {
						await currentChannel.delete()
						await deleteTemporaryChannel(
							currentChannel.id,
							oldState.guild.id,
							oldState.client.user.id
						)
						// Stop and remove the interval
						stopExpirationCheck(currentChannel.id)
						bunnyLog.success(
							`Deleted empty temporary voice channel: ${currentChannel.name}`
						)
					} catch (error) {
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
 */
function startExpirationCheck(client: Discord.Client, channelId: string) {
	if (updateIntervals.has(channelId)) return

	const interval = setInterval(
		() => checkChannelExpiration(client, channelId),
		5 * 60 * 1000 // 5 minutes
	)
	updateIntervals.set(channelId, interval)
}

/**
 * Stop checking if a channel has expired.
 */
function stopExpirationCheck(channelId: string) {
	const interval = updateIntervals.get(channelId)
	if (interval) {
		clearInterval(interval)
		updateIntervals.delete(channelId)
	}
	expirationCache.delete(channelId)
}

/**
 * Check if a channel has expired and delete it if necessary.
 */
async function checkChannelExpiration(
	client: Discord.Client,
	channelId: string
) {
	let expirationTime = expirationCache.get(channelId)

	// Fetch channel data from database if not in cache
	if (expirationTime === undefined) {
		const tempChannels = await getTempChannels()
		const channelData = tempChannels.find((ch) => ch.channel_id === channelId)

		if (!channelData) {
			bunnyLog.warn(`Channel ${channelId} not found in database`)
			stopExpirationCheck(channelId)
			return
		}

		expirationTime = new Date(channelData.expire_at).getTime()
		expirationCache.set(channelId, expirationTime)
	}

	const now = Date.now()
	const timeLeft = expirationTime - now

	const guild = client.guilds.cache.find((g) => g.channels.cache.has(channelId))

	if (!guild) {
		bunnyLog.warn(`Guild for channel ${channelId} not found`)
		stopExpirationCheck(channelId)
		return
	}

	const channel = guild.channels.cache.get(channelId) as
		| Discord.VoiceChannel
		| undefined

	if (!channel) {
		bunnyLog.info(
			`Channel ${channelId} not found in guild, removing from cache`
		)
		await deleteTemporaryChannel(channelId, guild.id, client.user.id)
		stopExpirationCheck(channelId)
		return
	}

	if (timeLeft <= 0 || channel.members.size === 0) {
		try {
			await channel.delete()
			await deleteTemporaryChannel(channelId, guild.id, client.user.id)
			stopExpirationCheck(channelId)
			bunnyLog.success(`Deleted expired or empty channel: ${channel.name}`)
		} catch (error) {
			bunnyLog.error(`Error deleting channel ${channelId}:`, error)
		}
		return
	}

	// Update channel name with time left
	try {
		const totalMinutesLeft = Math.ceil(timeLeft / (60 * 1000))
		const hoursLeft = Math.floor(totalMinutesLeft / 60)
		const minutesLeft = totalMinutesLeft % 60

		const timeString = `(${hoursLeft}h ${minutesLeft}m)`
		const baseName = channel.name.split(' (')[0] // Usuń poprzedni czas z nazwy

		const newName = `${baseName} ${timeString}`

		if (channel.name !== newName) {
			await channel.setName(newName)
			// bunnyLog.info(`Updated channel name to: ${newName}`)
		}
	} catch (error) {
		bunnyLog.error(
			`Błąd podczas aktualizacji nazwy kanału ${channelId}:`,
			error
		)
	}
}

/**
 * Load expiration times into cache and start intervals.
 */
export async function loadExpirationTimesIntoCache(client: Discord.Client) {
	const tempChannels = await getTempChannels()
	for (const channelData of tempChannels) {
		const expirationTime = new Date(channelData.expire_at).getTime()
		expirationCache.set(channelData.channel_id, expirationTime)
		startExpirationCheck(client, channelData.channel_id)
	}
	bunnyLog.info(`Loaded ${tempChannels.length} expiration times into cache`)
}
