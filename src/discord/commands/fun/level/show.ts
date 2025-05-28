import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/discord/api/index.js'
import * as V2 from 'discord-components-v2'

export async function showLevel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		await interaction.deferReply()

		const guildId = interaction.guildId
		if (!guildId) {
			throw new Error('This command can only be used in a server.')
		}

		// Check if levels plugin is enabled
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			guildId,
			'levels'
		)
		if (!config.enabled) {
			throw new Error('The XP system is currently disabled on this server.')
		}

		// Get target user
		const targetUser = interaction.options.getUser('user') || interaction.user

		// Get user data
		const data = await api.getUser(
			interaction.client.user.id,
			guildId,
			targetUser.id
		)

		if (!data || data.status === 'not found') {
			throw new Error('User not found in database.')
		}

		const userExperience = data.xp
		const userLevel = data.level

		// Get rankings
		const [globalRank, serverRank] = await Promise.all([
			api.getGlobalRank(interaction.client.user.id, targetUser.id),
			api.getServerRank(interaction.client.user.id, guildId, targetUser.id),
		])

		// Get avatar url
		const avatarUrl = targetUser
			.displayAvatarURL({ size: 4096 })
			.replace('webp', 'png')

		const colorHex = await new utils.ColorThief().getDominantColor(avatarUrl)
		const accentColor = Number.parseInt(colorHex.replace('#', ''), 16)

		// Calculate XP for next level
		const xpForNextLevel = utils.calculateXpForNextLevel(userLevel ?? 0)
		const xpNeededForNextLevel = xpForNextLevel - (userExperience ?? 0)

		// Create components array
		const components = [
			{
				type: Discord.ComponentType.Section,
				components: [
					{
						type: Discord.ComponentType.TextDisplay,
						content: `## ${targetUser.displayName}'s XP Card`,
					},
					{
						type: Discord.ComponentType.TextDisplay,
						content: `⭐️ **Level**: ${utils.formatter.format(userLevel ?? 0)}\n✨ **XP**: ${utils.formatter.format(userExperience ?? 0)}\n🎯 **Next Level in**: ${utils.formatter.format(
							xpNeededForNextLevel ?? 0
						)}`,
					},
				],
				accessory: {
					type: Discord.ComponentType.Thumbnail,
					media: {
						url: avatarUrl,
					},
				},
			},
			{
				type: Discord.ComponentType.MediaGallery,
				items: [
					{
						media: {
							url: 'https://cdn.discordapp.com/splashes/1004735926234271864/60d186cd18b27e1fe9efba5481e42a19.jpg?size=2048',
							description: 'Rabbit Hole',
						},
					},
				],
			},
			{
				type: Discord.ComponentType.Separator,
				divider: false,
				spacing: Discord.SeparatorSpacingSize.Large,
			},
			{
				type: Discord.ComponentType.TextDisplay,
				content: `🌎 **Global Ranking**: ${globalRank !== null ? `🏆 #${utils.formatter.format(globalRank ?? 0)}` : 'Not ranked'}`,
			},
			{
				type: Discord.ComponentType.TextDisplay,
				content: `📍 **Server Ranking**: ${serverRank !== null ? `🥇 #${utils.formatter.format(serverRank ?? 0)}` : 'Not ranked'}`,
			},
		]

		// Prepare message options
		const messageOptions: Discord.InteractionEditReplyOptions = {
			components: components,
			flags:
				Discord.MessageFlags.SuppressEmbeds |
				Discord.MessageFlags.IsComponentsV2,
		}

		await interaction.editReply(messageOptions)
	} catch (error) {
		await utils.handleResponse(interaction, 'error', error.message, {
			code: 'XP004',
			ephemeral: true,
		})
	}
}
