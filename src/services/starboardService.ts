import {
	ChannelType,
	EmbedBuilder,
	type MessageReaction,
	type PartialMessageReaction,
	type TextChannel,
} from 'discord.js'
import { getPluginConfig } from '../api/plugins'
import {
	createStarboardEntry,
	deleteStarboardEntry,
	getStarboardEntry,
	updateStarboardEntry,
} from '../api/starboard'
import { createUniversalEmbed } from '../components/embed'
import type { UniversalEmbedOptions } from '../types/embed'
import type { StarboardEntry } from '../types/starboard'
import { hexToNumber } from '../utils/formatter'
import { bunnyLog } from 'bunny-log'

async function watchStarboard(
	reaction: MessageReaction | PartialMessageReaction
): Promise<StarboardEntry | null> {
	try {
		// Fetch the starboard config
		const config = await getPluginConfig(
			reaction.client.user.id,
			reaction.message.guildId,
			'starboard'
		)

		// Check if the plugin is enabled
		if (!config?.enabled) {
			// bunnyLog.warn(
			// 	`Starboard plugin is not enabled on ${reaction.message.guild.name} (${reaction.message.guildId})`
			// )
			return null
		}

		const { emoji, watch_channels, channel_id, threshold } = config

		// If the reaction or message is partial, fetch the full data
		if (reaction.partial) await reaction.fetch()
		if (reaction.message.partial) await reaction.message.fetch()

		// Check if the reaction is in a monitored channel (if any channels are configured)
		if (
			Array.isArray(watch_channels) &&
			watch_channels.length > 0 &&
			!watch_channels.includes(reaction.message.channel.id)
		) {
			return null // Exit if the channel is not in the monitored list
		}

		// Check if the reaction matches the configured emoji
		if (reaction.emoji.name !== emoji) return null

		// If the reaction count doesn't meet the threshold, exit
		if (reaction.count < threshold) return null

		// Fetch starboard channel
		const starboardChannel = reaction.message.guild?.channels.cache.get(
			channel_id
		) as TextChannel | undefined

		if (!starboardChannel || starboardChannel.type !== ChannelType.GuildText) {
			// bunnyLog.error('Starboard channel not found or is not a text channel.')
			return null
		}

		if (reaction.message.author.bot) {
			// bunnyLog.info('Ignoring starboard entry for a bot message.')
			return null
		}

		// Fetch users who reacted
		const users = await reaction.users.fetch()

		// Filter out bot reactions
		const nonBotReactionCount = users.filter((user) => !user.bot).size

		// If the non-bot reaction count doesn't meet the threshold, exit
		if (nonBotReactionCount < threshold) {
			return null
		}

		//FIXME: do not count bot starboard message
		const existingStarboardEntry = (await getStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId,
			reaction.message.id
		)) as StarboardEntry | null

		if (existingStarboardEntry) {
			try {
				const starboardMessage = await starboardChannel.messages.fetch(
					existingStarboardEntry.starboard_message_id
				)

				// Update existing starboard message
				if (starboardMessage.embeds.length > 0) {
					const embed = EmbedBuilder.from(starboardMessage.embeds[0]).setFooter(
						{
							text: `${reaction.count} ${config.emoji}`,
						}
					)

					await starboardMessage.edit({ embeds: [embed] })
					await updateStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId,
						reaction.message.id,
						reaction.count
					)
					return existingStarboardEntry
				}
				bunnyLog.warn('No embeds found in the starboard message.')
			} catch (error) {
				if (error.code === 10008) {
					// Unknown Message error
					bunnyLog.warn(
						'Starboard message not found. Deleting entry and creating a new one.'
					)
					await deleteStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId,
						reaction.message.id
					)
					// Fall through to create a new starboard entry
				} else {
					throw error // Re-throw if it's a different error
				}
			}
		}

		// If no existing entry or if the entry was deleted, create a new one
		const attachments = reaction.message.attachments.map(
			(attachment) => attachment.url
		)

		const embedData: UniversalEmbedOptions = {
			color: hexToNumber('#fec676'),
			description: `${reaction.message.content}\n\n[Jump to message](${reaction.message.url})\nIn <#${reaction.message.channel.id}>`,
			author: {
				name: reaction.message.author?.tag || 'Unknown',
				iconURL: reaction.message.author?.displayAvatarURL(),
			},
			timestamp: new Date(reaction.message.createdTimestamp).toISOString(),
			footer: {
				text: `${reaction.count} ${config.emoji}`,
			},
			image: attachments.length > 0 ? { url: attachments[0] } : null,
		}
		const { embed } = createUniversalEmbed(embedData)

		const messagePayload = {
			embeds: [embed],
		}

		const starboardMessage = await starboardChannel.send(messagePayload)
		const newEntry: StarboardEntry = {
			starboard_message_id: starboardMessage.id,
			star_count: reaction.count,
			original_message_id: reaction.message.id,
		}
		await createStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId,
			reaction.message.id,
			starboardMessage.id,
			reaction.count
		)

		return newEntry
	} catch (error) {
		bunnyLog.error('Error handling starboard:', error)
		return null
	}
}

export default watchStarboard
