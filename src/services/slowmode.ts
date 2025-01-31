import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import * as api from '@/api/index.js'

interface ChannelMessageRate {
	messages: Discord.Collection<string, Discord.Message>
	lastCheck: number
}

// Map to store message rates for each channel
const channelRates: Map<string, ChannelMessageRate> = new Map()

/**
 * Manages slowmode for a message.
 * @param {Discord.Message} message - The message to manage slowmode for.
 * @returns {Promise<void>}
 */
export async function manageSlowmode(message: Discord.Message): Promise<void> {
	if (!(message.channel instanceof Discord.TextChannel)) return

	const config = await api.getPluginConfig(
		message.client.user.id,
		message.guild?.id ?? '',
		'slowmode'
	)

	// If the config is not enabled, return
	if (!config.enabled) return

	// Get the watch channels, threshold, duration, and rate duration from the config
	const { watch_channels, threshold, duration, rate_duration } = config

	// If the channel is not in the watch channels, return
	if (watch_channels && !watch_channels.includes(message.channel.id)) return

	// Get the channel ID
	const channelId = message.channel.id

	// Get the current time
	const now = Date.now()

	// Get the rate for the channel
	let rate = channelRates.get(channelId)

	// If the rate is not set, set it
	if (!rate) {
		rate = {
			messages: new Discord.Collection(),
			lastCheck: now,
		}
		channelRates.set(channelId, rate)
	}

	// Add the message to the rate collection
	rate.messages.set(message.id, message)

	// Remove messages older than the check interval
	rate.messages = rate.messages.filter(
		(msg) => now - msg.createdTimestamp < (duration ?? 0)
	)

	// If the duration is not set, return
	if (!duration) return

	// If the last check is older than the duration, update the slowmode
	if (now - rate.lastCheck >= (duration ?? 0)) {
		const messageCount = rate.messages.size

		try {
			// If the message count is greater than or equal to the threshold and the rate limit is not the high rate, set the rate limit to the high rate
			if (
				messageCount >= (threshold ?? 0) &&
				message.channel.rateLimitPerUser !== (rate_duration?.high_rate ?? 0)
			) {
				// Set the rate limit to the high rate
				await message.channel.setRateLimitPerUser(
					rate_duration?.high_rate ?? 0,
					'High message rate detected'
				)
				bunnyLog.info(
					`Increased slowmode to ${rate_duration?.high_rate ?? 0}s in channel ${message.channel.name} due to high message rate`
				)
			} else if (
				messageCount < (threshold ?? 0) &&
				message.channel.rateLimitPerUser !== (rate_duration?.low_rate ?? 0)
			) {
				// Set the rate limit to the low rate
				await message.channel.setRateLimitPerUser(
					rate_duration?.low_rate ?? 0,
					'Message rate returned to normal'
				)
				bunnyLog.info(
					`Decreased slowmode to ${rate_duration?.low_rate ?? 0}s in channel ${message.channel.name} as message rate normalized`
				)
			}
		} catch (error) {
			bunnyLog.error('Error updating slowmode:', error)
		}

		// Update the last check time and clear the messages
		rate.lastCheck = now
		rate.messages.clear()
	}
}
