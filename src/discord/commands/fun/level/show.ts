import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'
import * as utils from '@/utils/index.js'

export async function showLevel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		// Defer the reply first, not ephemeral for normal display
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

		// Get user data from API
		const data = await api.getUser(
			interaction.client.user.id,
			guildId,
			targetUser.id
		)

		if (!data || data.status === 'not found') {
			throw new Error('User not found in database.')
		}

		// Debug: Log the data we're getting
		console.log('User data from API:', {
			user_id: targetUser.id,
			guild_id: guildId,
			data: data,
			userExperience: data.xp,
			userLevel: data.level,
		})

		const userExperience = data.xp ?? 0
		const userLevel = data.level ?? 0

		// Get rankings
		const [globalRank, serverRank] = await Promise.all([
			api.getGlobalRank(interaction.client.user.id, targetUser.id),
			api.getServerRank(interaction.client.user.id, guildId, targetUser.id),
		])

		// Debug: Log ranking data
		console.log('Ranking data:', {
			globalRank: globalRank,
			serverRank: serverRank,
		})

		// Get avatar url with better fallback handling
		let avatarUrl = targetUser.displayAvatarURL({
			size: 1024,
			extension: 'png',
			forceStatic: true,
		})

		// Debug: Check if avatar URL is valid
		console.log('Initial avatar URL:', avatarUrl)

		// If the avatar URL is a default Discord avatar, try to get the user's actual avatar
		if (avatarUrl.includes('embed/avatars/') || !avatarUrl) {
			console.log('Detected default avatar, trying alternative methods...')

			// Try different methods to get the actual avatar
			try {
				// Method 1: Try without forceStatic
				avatarUrl = targetUser.displayAvatarURL({
					size: 1024,
					extension: 'png',
				})
				console.log('Method 1 avatar URL:', avatarUrl)

				// Method 2: Try with different size
				if (avatarUrl.includes('embed/avatars/')) {
					avatarUrl = targetUser.displayAvatarURL({
						size: 512,
						extension: 'png',
					})
					console.log('Method 2 avatar URL:', avatarUrl)
				}

				// Method 3: Try with webp extension
				if (avatarUrl.includes('embed/avatars/')) {
					avatarUrl = targetUser.displayAvatarURL({
						size: 1024,
						extension: 'webp',
					})
					console.log('Method 3 avatar URL:', avatarUrl)
				}
			} catch (error) {
				console.warn('Failed to get avatar URL:', error)
				// Use a default avatar URL as last resort
				avatarUrl = `https://cdn.discordapp.com/embed/avatars/${parseInt(targetUser.discriminator) % 5}.png`
			}
		}

		// Debug: Log avatar URL
		console.log('Avatar URL:', avatarUrl)
		console.log('User ID:', targetUser.id)
		console.log('Username:', targetUser.username)
		console.log('Display Name:', targetUser.displayName)

		// Calculate XP for next level
		const xpForNextLevel = utils.calculateXpForNextLevel(userLevel)
		const currentXP = userExperience
		const requiredXP = xpForNextLevel

		// Debug: Log XP calculations
		console.log('XP calculations:', {
			currentXP: currentXP,
			requiredXP: requiredXP,
			userLevel: userLevel,
			xpForNextLevel: xpForNextLevel,
		})

		// Additional data section removed (no longer used with canvas removal)

		// Build Components V2 summary instead of canvas image
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
						content: `⭐️ **Level**: ${utils.formatter.format(userLevel ?? 0)}\n✨ **XP**: ${utils.formatter.format(currentXP ?? 0)} / ${utils.formatter.format(requiredXP ?? 0)}`,
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

		const messageOptions: Discord.InteractionEditReplyOptions = {
			components,
			flags:
				Discord.MessageFlags.SuppressEmbeds |
				Discord.MessageFlags.IsComponentsV2,
		}

		await interaction.editReply(messageOptions)
	} catch (error) {
		// For errors, we want to followUp with ephemeral message since we already deferred
		await utils.handleResponse(interaction, 'error', error.message, {
			code: 'XP004',
			ephemeral: true,
		})
	}
}
