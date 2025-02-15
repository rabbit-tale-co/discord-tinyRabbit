import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/api/index.js'
import { updateMemberRoles } from '@/services/roleService.js'
import type { LevelStatus } from '@/types/levels.js'
import { createUniversalEmbed } from '@/components/embed.js'
import { bunnyLog } from 'bunny-log'

/**
 * Handles the setxp command to set XP for a user.
 * @param {Discord.ChatInputCommandInteraction} interaction - The interaction object.
 */
async function setLevel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		// Defer the reply
		await interaction.deferReply()

		// Check if the XP plugin is enabled
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'levels'
		)
		if (!config.enabled) {
			await utils.handleResponse(
				interaction,
				'error',
				'The XP system is currently disabled on this server.',
				{
					code: 'XP000',
				}
			)
			return
		}

		// Get the member
		const member = interaction.member as Discord.GuildMember

		// Check if the member has administrator permissions
		if (!member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
			await utils.handleResponse(
				interaction,
				'warning',
				'You need to have administrator permissions to use this command.',
				{
					code: 'XP001',
				}
			)
			return
		}

		// Get the options
		const options =
			interaction.options as Discord.CommandInteractionOptionResolver
		const targetUser = options.getUser('user', true)
		const newLevel = options.getNumber('level', true)
		const newXp = options.getNumber('xp', true)

		// Create the updated data
		const updatedData: LevelStatus = {
			xp: newXp,
			level: newLevel,
			levelChangeStatus: utils.LevelUpResult.NoChange,
		}

		// Add or update the user level
		await api.addOrUpdateUserLevel(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			targetUser,
			updatedData
		)

		// Try to update the member roles
		try {
			await updateMemberRoles(
				interaction.client.user.id,
				interaction.guild as Discord.Guild,
				targetUser,
				updatedData
			)
		} catch (roleError) {
			bunnyLog.error('Error updating user roles:', roleError)
			// Continue executing, even if the role update fails
		}

		// Create the message
		const message = `Successfully set level ${newLevel} and ${newXp} XP for user ${targetUser.tag}.`

		// Edit the reply
		await interaction.editReply(message)
	} catch (error) {
		await utils.handleResponse(
			interaction,
			'error',
			'An error occurred while setting user level and XP.',
			{
				code: 'XP002',
			}
		)
	}
}

/**
 * Handles the xp command to display XP for a user.
 * @param {Discord.ChatInputCommandInteraction} interaction - The interaction object.
 */
async function showLevel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		// Regular deferral without ephemeral
		await interaction.deferReply()

		// Check if the XP plugin is enabled
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'levels'
		)

		// Check if the XP plugin is enabled
		if (!config.enabled) {
			await utils.handleResponse(
				interaction,
				'warning',
				'The XP system is currently disabled on this server.',
				{ code: 'XP000' }
			)
			return
		}

		// Get the options
		const options =
			interaction.options as Discord.CommandInteractionOptionResolver
		const targetUser = options.getUser('user') || interaction.user

		const data = await api.getUser(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			targetUser.id
		)

		// Check if the user data is valid
		if (!data || data.status === 'not found') {
			await utils.handleResponse(
				interaction,
				'warning',
				'User not found in database.',
				{ code: 'XP003' }
			)
			return
		}

		// Get the user experience
		const userExperience = data.xp

		// Get the user level

		// Get the XP for the next level
		const userLevel = data.level

		// Get the XP needed for the next level
		const xpForNextLevel = utils.calculateXpForNextLevel(userLevel ?? 0)
		const xpNeededForNextLevel = xpForNextLevel - (userExperience ?? 0)

		// Get the global and server ranks
		const [globalRank, serverRank] = await Promise.all([
			api.getGlobalRank(interaction.client.user.id, targetUser.id),
			api.getServerRank(
				interaction.client.user.id,
				interaction.guild?.id as Discord.Guild['id'],
				targetUser.id
			),
		])

		// Get the avatar url
		const avatarUrl = targetUser
			.displayAvatarURL({ size: 4096 })
			.replace('webp', 'png')

		// Get the dominant color
		const colorThief = new utils.ColorThief()
		const dominantColor = await colorThief.getDominantColor(avatarUrl)

		// Create the fields
		const fields = [
			{
				name: '⭐️ LVL',
				value: `\`\`\`${utils.formatter.format(userLevel ?? 0)}\`\`\``,
				inline: true,
			},
			{
				name: '✨ XP',
				value: `\`\`\`${utils.formatter.format(userExperience ?? 0)}\`\`\``,
				inline: true,
			},
			{
				name: '🎯 XP for LVL-UP',
				value: `\`\`\`${utils.formatter.format(xpNeededForNextLevel ?? 0)}\`\`\``,
				inline: true,
			},
			{
				name: '🌐 Global Ranking',
				value: `\`\`\`${globalRank !== null ? `#${utils.formatter.format(globalRank ?? 0)}` : 'Not ranked'}\`\`\``,
				inline: true,
			},
			{
				name: '🏠 Server Ranking',
				value: `\`\`\`${serverRank !== null ? `#${utils.formatter.format(serverRank ?? 0)}` : 'Not ranked'}\`\`\``,
				inline: true,
			},
		]

		// Create the embed
		const xpEmbed = createUniversalEmbed({
			title: `${targetUser.displayName}'s XP Card`,
			fields,
			color: utils.hexToNumber(dominantColor),
			thumbnail: { url: avatarUrl },
		})

		// Send normal follow-up
		await interaction.editReply({
			embeds: [xpEmbed.embed],
		})
	} catch (error) {
		// Non-ephemeral error response
		await utils.handleResponse(interaction, 'error', error.message, {
			code: 'XP004',
		})
	}
}

export { showLevel, setLevel }
