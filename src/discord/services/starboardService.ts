import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import type { StarboardEntry } from '@/types/starboard.js'
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { StatusLogger, PluginLogger } from '@/utils/bunnyLogger.js'

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
			// PluginLogger.error('starboard', `Plugin not enabled for guild ${reaction.message.guildId}`)
			return null
		}

		// Get the emoji, watch channels, channel ID, and threshold from the config
		const { emoji, watch_channels, channel_id, threshold } = config

		// If the reaction or message is partial, fetch the full data
		if (reaction.partial) {
			try {
				await reaction.fetch()
			} catch (error) {
				StatusLogger.error('Failed to fetch reaction', error as Error)
				return null
			}
		}

		// If the message is partial, fetch the full data
		if (reaction.message.partial) {
			try {
				await reaction.message.fetch()
			} catch (error) {
				StatusLogger.error('Failed to fetch message', error as Error)
				return null
			}
		}

		// Check if the reaction is in a monitored channel (if any channels are configured)
		if (
			Array.isArray(watch_channels) &&
			watch_channels.length > 0 &&
			!watch_channels.includes(reaction.message.channel.id)
		) {
			// StatusLogger.debug(
			// 	`Message not in watched channels: ${reaction.message.channel.id}`
			// )
			return null
		}

		// Check if the reaction matches the configured emoji
		if (reaction.emoji.name !== emoji) {
			// StatusLogger.debug(
			// 	`Reaction emoji ${reaction.emoji.name} does not match configured emoji ${emoji}`
			// )
			return null
		}

		// If the reaction count doesn't meet the threshold, exit
		if ((reaction.count ?? 0) < (threshold ?? 0)) {
			// StatusLogger.debug(
			// 	`Reaction count ${reaction.count} below threshold ${threshold}`
			// )
			return null
		}

		// Fetch starboard channel
		const starboardChannel = reaction.message.guild?.channels.cache.get(
			channel_id ?? ''
		) as Discord.TextChannel | undefined

		// If the starboard channel is not found or is not a text channel, return null
		if (
			!starboardChannel ||
			starboardChannel.type !== Discord.ChannelType.GuildText
		) {
			StatusLogger.error(
				`Starboard channel ${channel_id} not found or is not a text channel`
			)
			return null
		}

		// If the message author is a bot, return null
		if (reaction.message.author?.bot) {
			StatusLogger.debug('Ignoring starboard entry for a bot message')
			return null
		}

		// Fetch users who reacted
		const users = await reaction.users.fetch()

		// Filter out bot reactions
		const nonBotReactionCount = users.filter((user) => !user.bot).size

		// If the non-bot reaction count doesn't meet the threshold, exit
		if (nonBotReactionCount < (threshold ?? 0)) {
			StatusLogger.debug(
				`Non-bot reaction count ${nonBotReactionCount} below threshold ${threshold}`
			)
			return null
		}

		// Fetch the existing starboard entry
		const existingStarboardEntry = (await api.getStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId ?? '',
			reaction.message.id
		)) as StarboardEntry | null

		// Prepare message content and components
		const attachments = reaction.message.attachments.map((attachment) => ({
			url: attachment.url,
			spoiler: attachment.spoiler,
			description: attachment.description,
			width: attachment.width,
			height: attachment.height,
			proxy_url: attachment.proxyURL,
			content_type: attachment.contentType,
		}))

		let emojiDisplay: string
		if (reaction.emoji.id) {
			emojiDisplay = `<:${reaction.emoji.name}:${reaction.emoji.id}>`
			if (reaction.emoji.animated) {
				emojiDisplay = `<a:${reaction.emoji.name}:${reaction.emoji.id}>`
			}
		} else {
			emojiDisplay = reaction.emoji.name || '⭐'
		}

		// Get user avatar URL
		const avatarUrl =
			reaction.message.author?.displayAvatarURL({ size: 512 }) || ''

		// Create components using V2 system
		const components = [
			{
				type: Discord.ComponentType.Section,
				components: [
					{
						type: Discord.ComponentType.TextDisplay,
						content: `## ✨ ${reaction.message.author?.displayName || 'Unknown User'}'s Starboard Post`,
					},
					{
						type: Discord.ComponentType.TextDisplay,
						content: `>>> ${reaction.message.content || '*✨ No text content - check attachments below! ✨*'}`,
					},
					{
						type: Discord.ComponentType.TextDisplay,
						content: `${emojiDisplay} **${reaction.count ?? 0}** | 📍 <#${reaction.message.channel.id}> | 🕒 <t:${Math.floor(reaction.message.createdTimestamp / 1000)}:R>`,
					},
				],
				accessory: {
					type: Discord.ComponentType.Thumbnail,
					media: {
						url: avatarUrl,
					},
				},
			},
		]

		// Add MediaGallery for attachments
		if (attachments.length > 0) {
			const mediaGallery = {
				type: Discord.ComponentType.MediaGallery,
				items: attachments.map((attachment) => ({
					media: {
						url: attachment.url,
						width: attachment.width,
						height: attachment.height,
						proxy_url: attachment.proxy_url,
						content_type: attachment.content_type,
					},
					description: attachment.description,
					spoiler: attachment.spoiler,
				})),
			}
			;(components as unknown[]).push(mediaGallery)
		}

		// Prepare message options with files for attachments
		const messageOptions = {
			components: components,
			flags:
				Discord.MessageFlags.SuppressEmbeds |
				Discord.MessageFlags.IsComponentsV2,
		}

		// If the existing starboard entry is found, update it
		if (existingStarboardEntry) {
			try {
				// Fetch the starboard message
				const starboardMessage = await starboardChannel.messages.fetch(
					existingStarboardEntry.starboard_message_id
				)

				try {
					await starboardMessage.edit(messageOptions)
					// Update the DB with the new reaction count
					await api.updateStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId ?? '',
						reaction.message.id,
						reaction.count ?? 0
					)

					return existingStarboardEntry
				} catch (error) {
					if (
						error.message.includes(
							'Cannot edit a message authored by another user'
						)
					) {
						StatusLogger.warn('Cannot edit starboard message, creating new one')

						// Send a new message
						const newMessage = await starboardChannel.send(messageOptions)
						// Update the DB with the new message ID
						await api.updateStarboardEntry(
							reaction.client.user.id,
							reaction.message.guildId ?? '',
							reaction.message.id,
							reaction.count ?? 0
						)

						return {
							...existingStarboardEntry,
							starboard_message_id: newMessage.id,
						}
					}
					throw error
				}
			} catch (error) {
				if (error.code === 10008) {
					// Unknown Message error
					StatusLogger.warn('Starboard message not found, creating new entry')

					// Delete the existing starboard entry
					await api.deleteStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId ?? '',
						reaction.message.id
					)
					// Fall through to create a new starboard entry
				} else {
					throw error
				}
			}
		}

		// Create new starboard entry
		const starboardMessage = await starboardChannel.send(messageOptions)
		// Create the new starboard entry
		const newEntry: StarboardEntry = {
			starboard_message_id: starboardMessage.id,
			star_count: reaction.count ?? 0,
			original_message_id: reaction.message.id,
		}

		await api.createStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId ?? '',
			reaction.message.id,
			starboardMessage.id,
			reaction.count ?? 0
		)

		return newEntry
	} catch (error) {
		PluginLogger.error('starboard', error as Error)
		return null
	}
}

export default watchStarboard
