import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/discord/api/index.js'
import { generateRankCard } from './rankCard.js'

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

		// Get additional user data (optional)
		let additionalData = {}

		// You can add more API calls here to get additional data
		// For example: user balance, linked accounts, etc.

		// Example: Get user balance if economy plugin is enabled
		// const balanceData = await api.getUserBalance(interaction.client.user.id, guildId, targetUser.id)
		// if (balanceData) {
		//   additionalData.balance = balanceData.amount
		// }

		// Example: Get linked accounts
		// const linkedAccounts = await api.getLinkedAccounts(interaction.client.user.id, guildId, targetUser.id)
		// if (linkedAccounts) {
		//   additionalData.linkedAccounts = linkedAccounts
		// }

		// Debug: Log the data being passed to rank card
		const rankCardData = {
			avatarURL: avatarUrl,
			displayName: targetUser.displayName,
			level: userLevel,
			globalRank: globalRank,
			serverRank: serverRank,
			currentXP: currentXP,
			requiredXP: requiredXP,
			background: {
				type: 'gradient',
				colors: ['#0f172a', '#1e293b'],
			},
			additionalData: additionalData,
			// Use custom Geist fonts (will auto-register all weights)
			// fontPath: './src/assets/fonts/Geist-Bold.otf', // Optional: specific font file
			// fontFamily: 'Geist-Bold', // Will be set automatically
		}

		console.log('Rank card data:', rankCardData)

		// Generate rank card using canvas with enhanced data
		const rankCardBuffer = await generateRankCard(rankCardData)

		// Create attachment
		const attachment = new Discord.AttachmentBuilder(rankCardBuffer, {
			name: 'rank_card.png',
		})

		// Send the rank card as an image
		await interaction.editReply({
			files: [attachment],
		})

		// COMMENTED OUT: Original Component V2 implementation
		/*
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
		*/
	} catch (error) {
		// For errors, we want to followUp with ephemeral message since we already deferred
		await utils.handleResponse(interaction, 'error', error.message, {
			code: 'XP004',
			ephemeral: true,
		})
	}
}
