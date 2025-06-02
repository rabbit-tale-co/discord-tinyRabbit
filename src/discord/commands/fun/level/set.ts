import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/discord/api/index.js'
import { updateMemberRoles } from '@/services/roleService.js'
import type { LevelStatus } from '@/types/levels.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'

export async function setLevel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		await interaction.deferReply({
			flags: Discord.MessageFlags.Ephemeral,
		})

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

		// Check admin permissions
		if (
			!interaction.memberPermissions?.has(
				Discord.PermissionFlagsBits.Administrator
			)
		) {
			throw new Error(
				'You need to have administrator permissions to use this command.'
			)
		}

		// Get command options
		const targetUser = interaction.options.getUser('user', true)
		const newLevel = interaction.options.getNumber('level', true)
		const newXp = interaction.options.getNumber('xp', true)

		// Update user data
		const updatedData: LevelStatus = {
			xp: newXp,
			level: newLevel,
			levelChangeStatus: utils.LevelUpResult.NoChange,
		}

		await api.addOrUpdateUserLevel(
			interaction.client.user.id,
			guildId,
			targetUser,
			updatedData
		)

		// Update roles
		try {
			if (interaction.guild) {
				await updateMemberRoles(
					interaction.client.user.id,
					interaction.guild,
					targetUser,
					updatedData
				)
			}
		} catch (error) {
			StatusLogger.error(`Error updating user roles: ${error instanceof Error ? error.message : String(error)}`);
			// Continue execution even if role update fails
		}

		// Create components array for success message
		const components = [
			{
				type: Discord.ComponentType.TextDisplay,
				content: '## Level Update Success',
			},
			{
				type: Discord.ComponentType.Separator,
				divider: true,
				spacing: Discord.SeparatorSpacingSize.Large,
			},
			{
				type: Discord.ComponentType.TextDisplay,
				content:
					`✅ Successfully updated level and XP for ${targetUser.tag}:\n` +
					`⭐️ **New Level**: ${newLevel}\n` +
					`✨ **New XP**: ${newXp}`,
			},
		]

		// Prepare message options
		const messageOptions: Discord.InteractionEditReplyOptions = {
			components: components,
			flags:
				Discord.MessageFlags.SuppressEmbeds |
				Discord.MessageFlags.IsComponentsV2 |
				Discord.MessageFlags.Ephemeral,
		}

		await interaction.editReply(messageOptions)
	} catch (error) {
		await utils.handleResponse(interaction, 'error', error.message, {
			code: 'XP002',
			ephemeral: true,
		})
	}
}
