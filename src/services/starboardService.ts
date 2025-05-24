import * as Discord from "discord.js";
import * as api from "@/api/index.js";
import { createUniversalEmbed } from "@/components/embed.js";
import type { UniversalEmbedOptions } from "@/types/embed.js";
import type { StarboardEntry } from "@/types/starboard.js";
import { hexToNumber } from "@/utils/formatter.js";
import { bunnyLog } from "bunny-log";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

/**
 * Watches for starboard reactions and updates the starboard accordingly.
 * @param {Discord.MessageReaction | Discord.PartialMessageReaction} reaction - The reaction to watch.
 * @returns {Promise<StarboardEntry | null>} The new starboard entry or null if no entry was created.
 */
async function watchStarboard(
	reaction: Discord.MessageReaction | Discord.PartialMessageReaction,
): Promise<StarboardEntry | null> {
	try {
		// Fetch the starboard config
		const config = await api.getPluginConfig(
			reaction.client.user.id,
			reaction.message.guildId ?? "",
			"starboard",
		);

		// Check if the plugin is enabled
		if (!config?.enabled) {
			bunnyLog.info(
				`Starboard plugin is not enabled for guild ${reaction.message.guildId}`,
			);
			return null;
		}

		// Get the emoji, watch channels, channel ID, and threshold from the config
		const { emoji, watch_channels, channel_id, threshold } = config;

		// If the reaction or message is partial, fetch the full data
		if (reaction.partial) {
			try {
				await reaction.fetch();
			} catch (error) {
				bunnyLog.error("Failed to fetch reaction:", error);
				return null;
			}
		}

		// If the message is partial, fetch the full data
		if (reaction.message.partial) {
			try {
				await reaction.message.fetch();
			} catch (error) {
				bunnyLog.error("Failed to fetch message:", error);
				return null;
			}
		}

		// Check if the reaction is in a monitored channel (if any channels are configured)
		if (
			Array.isArray(watch_channels) &&
			watch_channels.length > 0 &&
			!watch_channels.includes(reaction.message.channel.id)
		) {
			bunnyLog.info(
				`Message not in watched channels: ${reaction.message.channel.id}`,
			);
			return null;
		}

		// Check if the reaction matches the configured emoji
		if (reaction.emoji.name !== emoji) {
			bunnyLog.info(
				`Reaction emoji ${reaction.emoji.name} does not match configured emoji ${emoji}`,
			);
			return null;
		}

		// If the reaction count doesn't meet the threshold, exit
		if ((reaction.count ?? 0) < (threshold ?? 0)) {
			bunnyLog.info(
				`Reaction count ${reaction.count} below threshold ${threshold}`,
			);
			return null;
		}

		// Fetch starboard channel
		const starboardChannel = reaction.message.guild?.channels.cache.get(
			channel_id ?? "",
		) as Discord.TextChannel | undefined;

		// If the starboard channel is not found or is not a text channel, return null
		if (
			!starboardChannel ||
			starboardChannel.type !== Discord.ChannelType.GuildText
		) {
			bunnyLog.error(
				`Starboard channel ${channel_id} not found or is not a text channel`,
			);
			return null;
		}

		// If the message author is a bot, return null
		if (reaction.message.author?.bot) {
			bunnyLog.info("Ignoring starboard entry for a bot message");
			return null;
		}

		// Fetch users who reacted
		const users = await reaction.users.fetch();

		// Filter out bot reactions
		const nonBotReactionCount = users.filter((user) => !user.bot).size;

		// If the non-bot reaction count doesn't meet the threshold, exit
		if (nonBotReactionCount < (threshold ?? 0)) {
			bunnyLog.info(
				`Non-bot reaction count ${nonBotReactionCount} below threshold ${threshold}`,
			);
			return null;
		}

		// Fetch the existing starboard entry
		const existingStarboardEntry = (await api.getStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId ?? "",
			reaction.message.id,
		)) as StarboardEntry | null;

		// Prepare message content and components
		const attachments = reaction.message.attachments.map((attachment) => ({
			url: attachment.url,
			spoiler: attachment.spoiler,
		}));

		let emojiDisplay: string;
		if (reaction.emoji.id) {
			emojiDisplay = `<:${reaction.emoji.name}:${reaction.emoji.id}`;
			if (reaction.emoji.animated) {
				emojiDisplay = `<a:${reaction.emoji.name}:${reaction.emoji.id}`;
			}
		} else {
			emojiDisplay = reaction.emoji.name;
		}

		const content = [
			"✨ **Starboard Highlight!** ✨",
			`> ${reaction.message.content || "*No text content*"}`,
			"",
			`👤 **Author:** <@${reaction.message.author?.id}>`,
			`#️⃣ **Channel:** <#${reaction.message.channel.id}>`,
			`${emojiDisplay} **Count:** ${reaction.count ?? 0}`,
		].join("\n");

		const jumpButton = new ButtonBuilder()
			.setLabel("Jump to message")
			.setStyle(ButtonStyle.Link)
			.setURL(reaction.message.url);

		const actionRow = new ActionRowBuilder().addComponents(jumpButton);

		// If the existing starboard entry is found, update it
		if (existingStarboardEntry) {
			try {
				// Fetch the starboard message
				const starboardMessage = await starboardChannel.messages.fetch(
					existingStarboardEntry.starboard_message_id,
				);

				try {
					await starboardMessage.edit({
						content,
						components: [actionRow.toJSON()],
						files: attachments.map((a) => a.url),
					});

					// Update the DB with the new reaction count
					await api.updateStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId ?? "",
						reaction.message.id,
						reaction.count ?? 0,
					);

					return existingStarboardEntry;
				} catch (error) {
					if (
						error.message.includes(
							"Cannot edit a message authored by another user",
						)
					) {
						bunnyLog.warn("Cannot edit starboard message, creating new one");

						// Send a new message
						const newMessage = await starboardChannel.send({
							content,
							components: [actionRow.toJSON()],
							files: attachments.map((a) => a.url),
						});

						// Update the DB with the new message ID
						await api.updateStarboardEntry(
							reaction.client.user.id,
							reaction.message.guildId ?? "",
							reaction.message.id,
							reaction.count ?? 0,
						);

						return {
							...existingStarboardEntry,
							starboard_message_id: newMessage.id,
						};
					}
					throw error;
				}
			} catch (error) {
				if (error.code === 10008) {
					// Unknown Message error
					bunnyLog.warn("Starboard message not found, creating new entry");

					// Delete the existing starboard entry
					await api.deleteStarboardEntry(
						reaction.client.user.id,
						reaction.message.guildId ?? "",
						reaction.message.id,
					);
					// Fall through to create a new starboard entry
				} else {
					throw error;
				}
			}
		}

		// Create new starboard entry
		const starboardMessage = await starboardChannel.send({
			content,
			components: [actionRow.toJSON()],
			files: attachments.map((a) => a.url),
		});

		// Create the new starboard entry
		const newEntry: StarboardEntry = {
			starboard_message_id: starboardMessage.id,
			star_count: reaction.count ?? 0,
			original_message_id: reaction.message.id,
		};

		await api.createStarboardEntry(
			reaction.client.user.id,
			reaction.message.guildId ?? "",
			reaction.message.id,
			starboardMessage.id,
			reaction.count ?? 0,
		);

		return newEntry;
	} catch (error) {
		bunnyLog.error("Error handling starboard:", error);
		return null;
	}
}

export default watchStarboard;
