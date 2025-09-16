import * as Discord from 'discord.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'

interface TwitchStream {
	id: string
	user_id: string
	user_login: string
	user_name: string
	game_id: string
	game_name: string
	type: string
	title: string
	viewer_count: number
	started_at: string
	language: string
	thumbnail_url: string
	tag_ids: string[]
	is_mature: boolean
}

/**
 * Twitch Service - Handles Twitch stream notifications
 */
export namespace TwitchService {
	/**
	 * Send stream notification using ComponentsV2
	 */
	export async function sendStreamNotification(
		stream: TwitchStream,
		channel: Discord.TextBasedChannel,
		config: {
			message: string | null
			ping_role_id: string | null
		}
	): Promise<void> {
		try {
			const message = config.message ||
				`🎮 **{user_name}** is now live on Twitch!\n` +
				`📺 **{title}**\n` +
				`🎯 Playing: **{game_name}**\n` +
				`👀 Viewers: **{viewer_count}**\n` +
				`🔗 https://twitch.tv/{user_login}`

			const formattedMessage = message
				.replace(/{user_name}/g, stream.user_name)
				.replace(/{user_login}/g, stream.user_login)
				.replace(/{title}/g, stream.title)
				.replace(/{game_name}/g, stream.game_name)
				.replace(/{viewer_count}/g, stream.viewer_count.toString())
				.replace(/{started_at}/g, new Date(stream.started_at).toLocaleString())

			// Create components using buildUniversalComponents like in close.ts
			const streamComponents = [
				{
					type: Discord.ComponentType.Section,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							content: `# 🎮 ${stream.user_name} is Live!`,
						},
					],
				},
				{
					type: Discord.ComponentType.Separator,
					spacing: Discord.SeparatorSpacingSize.Large,
					divider: false,
				},
				{
					type: Discord.ComponentType.Section,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							content: `## 📺 ${stream.title}\n\n` +
								`**🎯 Game:** ${stream.game_name}\n` +
								`**👀 Viewers:** ${stream.viewer_count.toLocaleString()}\n` +
								`**🌐 Language:** ${stream.language}\n` +
								`**⏰ Started:** ${new Date(stream.started_at).toLocaleString()}`,
						},
					],
				},
				{
					type: Discord.ComponentType.Separator,
					spacing: Discord.SeparatorSpacingSize.Large,
					divider: false,
				},
				{
					type: Discord.ComponentType.Section,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							content: `![Stream Thumbnail](${stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180')})`,
						},
					],
				},
			]

			// Add watch button using Discord's ButtonBuilder
			const buttonComponents: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] = []
			if (stream.user_login) {
				const actionRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
					.addComponents(
						new Discord.ButtonBuilder()
							.setLabel('Watch Stream')
							.setStyle(Discord.ButtonStyle.Link)
							.setURL(`https://twitch.tv/${stream.user_login}`)
					)
				buttonComponents.push(actionRow)
			}

			// Add role ping if configured
			let content = ''
			if (config.ping_role_id) {
				content = `<@&${config.ping_role_id}> ${formattedMessage}`
			} else {
				content = formattedMessage
			}

			// Prepare message options
			const messageOptions: Discord.MessageCreateOptions = {
				content,
			}

			// Add V2 components if available
			if (streamComponents.length > 0) {
				messageOptions.components = streamComponents
				messageOptions.flags = Discord.MessageFlags.IsComponentsV2
			}

			// Add button components if available
			if (buttonComponents.length > 0) {
				if (messageOptions.components) {
					messageOptions.components = [
						...messageOptions.components,
						...buttonComponents,
					]
				} else {
					messageOptions.components = buttonComponents
				}
			}

			// Type assertion to fix the channel.send issue
			const textChannel = channel as Discord.TextChannel
			await textChannel.send(messageOptions)

			StatusLogger.success(`Sent Twitch stream notification for ${stream.user_name}`)
		} catch (error) {
			StatusLogger.error('Error sending stream notification:', error)
		}
	}
}
