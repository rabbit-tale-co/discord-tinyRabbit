import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import { getPluginConfig } from '../api/plugins'

interface ChannelMessageRate {
	messages: Discord.Collection<string, Discord.Message>
	lastCheck: number
}

const channelRates: Map<string, ChannelMessageRate> = new Map()

export async function manageSlowmode(message: Discord.Message): Promise<void> {
	if (!(message.channel instanceof Discord.TextChannel)) return

	const config = await getPluginConfig(
		message.client.user.id,
		message.guild.id,
		'slowmode'
	)

	if (!config.enabled) return

	const { watch_channels, threshold, duration, rate_duration } = config

	if (watch_channels && !watch_channels.includes(message.channel.id)) return

	const channelId = message.channel.id
	const now = Date.now()

	let rate = channelRates.get(channelId)

	if (!rate) {
		rate = {
			messages: new Discord.Collection(),
			lastCheck: now,
		}
		channelRates.set(channelId, rate)
	}

	rate.messages.set(message.id, message)

	// Remove messages older than the check interval
	rate.messages = rate.messages.filter(
		(msg) => now - msg.createdTimestamp < duration
	)

	if (now - rate.lastCheck >= duration) {
		const messageCount = rate.messages.size

		try {
			if (
				messageCount >= threshold &&
				message.channel.rateLimitPerUser !== rate_duration.high_rate
			) {
				await message.channel.setRateLimitPerUser(
					rate_duration.high_rate,
					'High message rate detected'
				)
				bunnyLog.info(
					`Increased slowmode to ${rate_duration.high_rate}s in channel ${message.channel.name} due to high message rate`
				)
			} else if (
				messageCount < threshold &&
				message.channel.rateLimitPerUser !== rate_duration.low_rate
			) {
				await message.channel.setRateLimitPerUser(
					rate_duration.low_rate,
					'Message rate returned to normal'
				)
				bunnyLog.info(
					`Decreased slowmode to ${rate_duration.low_rate}s in channel ${message.channel.name} as message rate normalized`
				)
			}
		} catch (error) {
			bunnyLog.error('Error updating slowmode:', error)
		}

		rate.lastCheck = now
		rate.messages.clear()
	}
}
