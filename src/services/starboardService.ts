import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import { createUniversalEmbed } from '@/components/embed.js'
import type { UniversalEmbedOptions } from '@/types/embed.js'
import type { StarboardEntry } from '@/types/starboard.js'
import { hexToNumber } from '@/utils/formatter.js'
import { bunnyLog } from 'bunny-log'

/**
 * Watches for starboard reactions and updates the starboard accordingly.
 * @param {Discord.MessageReaction | Discord.PartialMessageReaction} reaction - The reaction to watch.
 * @returns {Promise<StarboardEntry | null>} The new starboard entry or null if no entry was created.
 */
async function watchStarboard(
	reaction: Discord.MessageReaction | Discord.PartialMessageReaction
): Promise<StarboardEntry | null> {
	try {
		// Fetch the starboard config
		const config = await api.getPluginConfig(
			reaction.client.user.id,
			reaction.message.guildId ?? '',
			'starboard'
		)

		// Check if the plugin is enabled
		if (!config?.enabled) {
			// bunnyLog.warn(
			// 	`Starboard plugin is not enabled on ${reaction.message.guild.name} (${reaction.message.guildId})`
			// )
			return null
		}

		// Get the emoji, watch channels, channel ID, and threshold from the config
		const { emoji, watch_channels, channel_id, threshold } = config

		// If the reaction or message is partial, fetch the full data
		if (reaction.partial) await reaction.fetch()

		// If the message is partial, fetch the full data
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
		if ((reaction.count ?? 0) < (threshold ?? 0)) return null

		// Fetch starboard channel
		const starboardChannel = reaction.message.guild?.channels.cache.get(
			channel_id ?? ''
		) as Discord.TextChannel | undefined

		// If the starboard channel is not found or is not a text channel, return null
		if (
			!starboardChannel ||
			starboardChannel.type !== Discord.ChannelType.GuildText
		) {
			// bunnyLog.error('Starboard channel not found or is not a text channel.')
			return null
		}

		// If the message author is a bot, return null
		if (reaction.message.author?.bot) {
			// bunnyLog.info('Ignoring starboard entry for a bot message.')
			return null
		}

		// Fetch users who reacted
		const users = await reaction.users.fetch()

		// Filter out bot reactions
		const nonBotReactionCount = users.filter((user) => !user.bot).size

		// If the non-bot reaction count doesn't meet the threshold, exit
		if (nonBotReactionCount < (threshold ?? 0)) {
			return null
		}

		// If the message author is a bot, return null
		if (reaction.message.author?.bot) {
			return null
		}

		// Fetch the existing starboard entry
		const existingStarboardEntry = (await api.getStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId ?? '',
			reaction.message.id
		)) as StarboardEntry | null

		// If the existing starboard entry is found, update it
		if (existingStarboardEntry) {
			try {
				// Fetch the starboard message
				const starboardMessage = await starboardChannel.messages.fetch(
					existingStarboardEntry.starboard_message_id
				)

				// Update existing starboard message
				if (starboardMessage.embeds.length > 0) {
					const embed = Discord.EmbedBuilder.from(
						starboardMessage.embeds[0]
					).setFooter({
						text: `${reaction.count} ${config.emoji}`,
					})

					// Update the starboard message
					await starboardMessage.edit({ embeds: [embed] })

					// Update the starboard entry
					await api.updateStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId ?? '',
						reaction.message.id,
						reaction.count ?? 0
					)

					// Return the existing starboard entry
					return existingStarboardEntry
				}
				bunnyLog.warn('No embeds found in the starboard message.')
			} catch (error) {
				if (error.code === 10008) {
					// Unknown Message error
					bunnyLog.warn(
						'Starboard message not found. Deleting entry and creating a new one.'
					)

					// Delete the existing starboard entry
					await api.deleteStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId ?? '',
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

		// Create the embed data
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
			image: attachments.length > 0 ? { url: attachments[0] } : undefined,
			//TODO: if post have more than 1 image, add them all (as separate messages)
		}

		// Create the embed
		const { embed } = createUniversalEmbed(embedData)

		// Create the message payload
		const messagePayload = {
			embeds: [embed],
		}

		// Send the message to the starboard channel
		const starboardMessage = await starboardChannel.send(messagePayload)

		// Create the new starboard entry
		const newEntry: StarboardEntry = {
			starboard_message_id: starboardMessage.id,
			star_count: reaction.count ?? 0,
			original_message_id: reaction.message.id,
		}

		// Create the new starboard entry
		await api.createStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId ?? '',
			reaction.message.id,
			starboardMessage.id,
			reaction.count ?? 0
		)

		// Return the new starboard entry
		return newEntry
	} catch (error) {
		bunnyLog.error('Error handling starboard:', error)
		return null
	}
}

export default watchStarboard
