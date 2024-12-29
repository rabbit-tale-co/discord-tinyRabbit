import * as Discord from 'discord.js'
import { formatter, hexToNumber } from '../utils/formatter.js'
import {
	calculateXpForNextLevel,
	LevelUpResult,
	XP_PER_MESSAGE,
} from '../utils/xpUtils.js'
import { updateMemberRoles } from '../services/roleService.js'
import { getUser } from '../api/user.js'
import { getGlobalRank, getServerRank } from '../api/userRank.js'
import type { Level, LevelStatus } from '../types/levels.js'
import { getDominantColor } from '../utils/colorThief.js'
import { createUniversalEmbed } from '../components/embed.js'
import { bunnyLog } from 'bunny-log'
import { addOrUpdateUserLevel } from '../api/levels.js'
import { handleError } from '../utils/errorHandlers'
import { getPluginConfig } from '../api/plugins'

/**
 * Fetches user data from the database.
 * @param {ClientUser['id']} bot_id - The ID of the bot.
 * @param {Guild['id']} guildId - The ID of the guild.
 * @param {User['id']} userId - The ID of the user.
 * @returns The user data.
 */
async function fetchUserData(
	bot_id: Discord.ClientUser['id'],
	guildId: Discord.Guild['id'],
	userId: Discord.User['id']
): Promise<Level> {
	try {
		let data = await getUser(bot_id, guildId, userId)
		if (!data) data = { status: 'not found' } //{ xp: XP_PER_MESSAGE, level: 0 }
		return data
	} catch (error) {
		bunnyLog.error(
			`Error fetching user data for guild ${guildId}, user ${userId}:`,
			error
		)
		throw new Error('Failed to fetch user data')
	}
}

/**
 * Handles the setxp command to set XP for a user.
 * @param {CommandInteraction} interaction - The interaction object.
 */
async function setUserXpAndLevel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		await interaction.deferReply({ ephemeral: true })

		// Check if the XP plugin is enabled
		const config = await getPluginConfig(
			interaction.client.user.id,
			interaction.guild.id,
			'levels'
		)
		if (!config.enabled) {
			await handleError(
				interaction,
				'XP000',
				'The XP system is currently disabled on this server.'
			)
			return
		}

		const member = interaction.member as Discord.GuildMember
		if (!member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
			await handleError(
				interaction,
				'XP001',
				'You need to have administrator permissions to use this command.'
			)
			return
		}

		const options =
			interaction.options as Discord.CommandInteractionOptionResolver
		const targetUser = options.getUser('user', true)
		const newLevel = options.getNumber('level', true)
		const newXp = options.getNumber('xp', true)

		// bunnyLog.info(
		// 	`Attempting to set level ${newLevel} and XP ${newXp} for user ${targetUser.id}`
		// )

		const updatedData: LevelStatus = {
			xp: newXp,
			level: newLevel,
			levelChangeStatus: LevelUpResult.NoChange,
		}

		await addOrUpdateUserLevel(
			interaction.client.user.id,
			interaction.guild.id,
			targetUser,
			updatedData
		)

		try {
			await updateMemberRoles(
				interaction.client.user.id,
				interaction.guild,
				targetUser,
				updatedData
			)
		} catch (roleError) {
			bunnyLog.error('Error updating user roles:', roleError)
			// Kontynuuj wykonywanie, nawet jeśli aktualizacja ról się nie powiedzie
		}

		const message = `Successfully set level ${newLevel} and ${newXp} XP for user ${targetUser.tag}.`
		await interaction.editReply(message)
	} catch (error) {
		await handleError(
			interaction,
			'XP002',
			'An error occurred while setting user level and XP.'
		)
	}
}

/**
 * Handles the xp command to display XP for a user.
 * @param {CommandInteraction} interaction - The interaction object.
 */
async function levelCommand(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	// Check if the XP plugin is enabled
	const config = await getPluginConfig(
		interaction.client.user.id,
		interaction.guild.id,
		'levels'
	)
	if (!config.enabled) {
		await handleError(
			interaction,
			'XP000',
			'The XP system is currently disabled on this server.'
		)
		return
	}

	const options =
		interaction.options as Discord.CommandInteractionOptionResolver
	const targetUser = options.getUser('user') || interaction.user

	try {
		const data = await fetchUserData(
			interaction.client.user.id,
			interaction.guild.id,
			targetUser.id
		)

		if (data.status === 'not found') {
			await handleError(interaction, 'XP003', 'User not found in database.')
			return
		}

		// bunnyLog.api(`User ${targetUser.id} data: ${JSON.stringify(data, null, 2)}`)

		const userExperience = data.xp
		const userLevel = data.level
		const xpForNextLevel = calculateXpForNextLevel(userLevel)
		const xpNeededForNextLevel = xpForNextLevel - userExperience

		const [globalRank, serverRank] = await Promise.all([
			getGlobalRank(interaction.client.user.id, targetUser.id),
			getServerRank(
				interaction.client.user.id,
				interaction.guild.id,
				targetUser.id
			),
		])

		const avatarUrl = targetUser
			.displayAvatarURL({ size: 4096 })
			.replace('webp', 'png')
		const dominantColor = await getDominantColor(avatarUrl)

		const fields = [
			{
				name: '⭐️ LVL',
				value: `\`\`\`${formatter.format(userLevel)}\`\`\``,
				inline: true,
			},
			{
				name: '✨ XP',
				value: `\`\`\`${formatter.format(userExperience)}\`\`\``,
				inline: true,
			},
			{
				name: '🎯 XP for LV-UP',
				value: `\`\`\`${formatter.format(xpNeededForNextLevel)}\`\`\``,
				inline: true,
			},
			{
				name: '🌐 Global Ranking',
				value: `\`\`\`${globalRank !== null ? `#${formatter.format(globalRank)}` : 'Not ranked'}\`\`\``,
				inline: true,
			},
			{
				name: '🏠 Server Ranking',
				value: `\`\`\`${serverRank !== null ? `#${formatter.format(serverRank)}` : 'Not ranked'}\`\`\``,
				inline: true,
			},
		]

		const xpEmbed = createUniversalEmbed({
			title: `${targetUser.displayName}'s XP Card`,
			fields,
			color: hexToNumber(dominantColor),
			thumbnail: { url: avatarUrl },
		})
		await interaction.reply({
			// content: `User ${targetUser.displayName} has ${formatter.format(userExperience)} XP and is level ${formatter.format(userLevel)}.`,
			embeds: [xpEmbed.embed],
		})
	} catch (error) {
		await handleError(interaction, 'XP004', error)
	}
}

export { levelCommand, setUserXpAndLevel }
