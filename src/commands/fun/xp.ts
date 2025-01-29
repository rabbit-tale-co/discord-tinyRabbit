import * as Discord from 'discord.js'
import { formatter, hexToNumber } from '../../utils/formatter.js'
import { calculateXpForNextLevel, LevelUpResult } from '../../utils/xpUtils.js'
import { updateMemberRoles } from '../../services/roleService.js'
import { getUser } from '../../api/user.js'
import { getGlobalRank, getServerRank } from '../../api/userRank.js'
import type { Level, LevelStatus } from '../../types/levels.js'
import { getDominantColor } from '../../utils/colorThief.js'
import { createUniversalEmbed } from '../../components/embed.js'
import { bunnyLog } from 'bunny-log'
import { addOrUpdateUserLevel } from '../../api/levels.js'
import { handleResponse } from '../../utils/responses.js'
import { getPluginConfig } from '../../api/plugins.js'

/**
 * Fetches user data from the database.
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.User['id']} user_id - The ID of the user.
 * @returns The user data.
 */
async function fetchUserData(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
): Promise<Level> {
	try {
		// Get the user data
		let data = await getUser(bot_id, guild_id, user_id)

		// Check if the user data is valid
		if (!data) data = { status: 'not found' }

		// Return the user data
		return data
	} catch (error) {
		// Log the error
		bunnyLog.error(
			`Error fetching user data for guild ${guild_id}, user ${user_id}:`,
			error
		)
		throw new Error('Failed to fetch user data')
	}
}

/**
 * Handles the setxp command to set XP for a user.
 * @param {Discord.ChatInputCommandInteraction} interaction - The interaction object.
 */
async function setUserXpAndLevel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		// Defer the reply
		await interaction.deferReply({ ephemeral: true })

		// Check if the XP plugin is enabled
		const config = await getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'levels'
		)
		if (!config.enabled) {
			await handleResponse(
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
			await handleResponse(
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
			levelChangeStatus: LevelUpResult.NoChange,
		}

		// Add or update the user level
		await addOrUpdateUserLevel(
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
		await handleResponse(
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
async function levelCommand(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	// Check if the XP plugin is enabled
	const config = await getPluginConfig(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		'levels'
	)

	// Check if the XP plugin is enabled
	if (!config.enabled) {
		await handleResponse(
			interaction,
			'warning',
			'The XP system is currently disabled on this server.',
			{
				code: 'XP000',
			}
		)
		return
	}

	// Get the options
	const options =
		interaction.options as Discord.CommandInteractionOptionResolver
	const targetUser = options.getUser('user') || interaction.user

	try {
		const data = await fetchUserData(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			targetUser.id
		)

		// Check if the user data is valid
		if (data.status === 'not found') {
			await handleResponse(
				interaction,
				'warning',
				'User not found in database.',
				{
					code: 'XP003',
				}
			)
			return
		}

		// Get the user experience
		const userExperience = data.xp

		// Get the user level

		// Get the XP for the next level
		const userLevel = data.level

		// Get the XP needed for the next level
		const xpForNextLevel = calculateXpForNextLevel(userLevel ?? 0)
		const xpNeededForNextLevel = xpForNextLevel - (userExperience ?? 0)

		// Get the global and server ranks
		const [globalRank, serverRank] = await Promise.all([
			getGlobalRank(interaction.client.user.id, targetUser.id),
			getServerRank(
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
		const dominantColor = await getDominantColor(avatarUrl)

		// Create the fields
		const fields = [
			{
				name: '⭐️ LVL',
				value: `\`\`\`${formatter.format(userLevel ?? 0)}\`\`\``,
				inline: true,
			},
			{
				name: '✨ XP',
				value: `\`\`\`${formatter.format(userExperience ?? 0)}\`\`\``,
				inline: true,
			},
			{
				name: '🎯 XP for LV-UP',
				value: `\`\`\`${formatter.format(xpNeededForNextLevel ?? 0)}\`\`\``,
				inline: true,
			},
			{
				name: '🌐 Global Ranking',
				value: `\`\`\`${globalRank !== null ? `#${formatter.format(globalRank ?? 0)}` : 'Not ranked'}\`\`\``,
				inline: true,
			},
			{
				name: '🏠 Server Ranking',
				value: `\`\`\`${serverRank !== null ? `#${formatter.format(serverRank ?? 0)}` : 'Not ranked'}\`\`\``,
				inline: true,
			},
		]

		// Create the embed
		const xpEmbed = createUniversalEmbed({
			title: `${targetUser.displayName}'s XP Card`,
			fields,
			color: hexToNumber(dominantColor),
			thumbnail: { url: avatarUrl },
		})

		// Reply with the embed
		await interaction.reply({
			embeds: [xpEmbed.embed],
		})
	} catch (error) {
		await handleResponse(interaction, 'error', error.message, {
			code: 'XP004',
		})
	}
}

export { levelCommand, setUserXpAndLevel }
