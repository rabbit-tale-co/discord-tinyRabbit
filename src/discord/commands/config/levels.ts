import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import type { DefaultConfigs, ComponentsV2 } from '@/types/plugins.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as V2 from 'discord-components-v2'
import { getPluginConfig, updatePluginConfig } from '@/discord/api/index.js'

/* -------------------------------------------------------------------------- */
/*                            SECTION HELPERS                                   */
/* -------------------------------------------------------------------------- */

// Helper functions for common section patterns
const SECTION_BUILDERS = {
	addRewardRole: (selectedLevel?: number, selectedRoleId?: string) => {
		const titleSection = V2.makeSection(
			[
				'## 🏆 **Add Reward Role**',
				'> Configure a role reward for reaching a specific level.',
			],
			V2.makeButton({
				custom_id: 'levels_back_to_reward_roles',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const selectedSection = V2.makeTextDisplay(
			[
				'### 📊 **Selected Configuration**',
				`**Level**: ${selectedLevel !== undefined ? selectedLevel : 'Not selected'}`,
				`**Role**: ${selectedRoleId ? `<@&${selectedRoleId}>` : 'Not selected'}`,
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const stepsSection = V2.makeTextDisplay(
			[
				'### ⚙️ **Configuration Steps**',
				selectedLevel !== undefined
					? '1. ✅ Choose the level requirement'
					: '1. 🔢 Choose the level requirement',
				selectedRoleId
					? '2. ✅ Select the reward role'
					: '2. 🎭 Select the reward role (after choosing level)',
				'',
				'### ℹ️ **Information**',
				'**Level 0**: Starting role (user join Role [not given when joining], bot removes when leveling up)',
				'**Level 5+**: Achievement roles (bot removes previous role and assigns new one)',
			].join('\n')
		)

		const separator3 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			selectedSection,
			separator2,
			stepsSection,
			separator3,
		}
	},

	editRewardRole: (rewardRoles: Array<{ level: number; role_id: string }>) => {
		const titleSection = V2.makeSection(
			[
				'## ✏️ **Edit Reward Role**',
				'> Select a reward role to modify its level requirement.',
			],
			V2.makeButton({
				custom_id: 'levels_back_to_reward_roles',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const rewardsContent =
			rewardRoles.length === 0
				? ['> No reward roles configured yet.']
				: rewardRoles
						.sort((a, b) => a.level - b.level)
						.map(
							(reward, index) =>
								`${index + 1}. Level ${reward.level}: <@&${reward.role_id}>`
						)

		const currentRewardsSection = V2.makeTextDisplay(
			['### 🏆 **Current Reward Roles**', ...rewardsContent].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentRewardsSection,
			separator2,
		}
	},

	removeRewardRole: (
		rewardRoles: Array<{ level: number; role_id: string }>
	) => {
		const titleSection = V2.makeSection(
			[
				'## ➖ **Remove Reward Role**',
				'> Select reward roles to remove from the level system.',
			],
			V2.makeButton({
				custom_id: 'levels_back_to_reward_roles',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const rewardsContent =
			rewardRoles.length === 0
				? ['> No reward roles configured yet.']
				: rewardRoles
						.sort((a, b) => a.level - b.level)
						.map(
							(reward, index) =>
								`${index + 1}. Level ${reward.level}: <@&${reward.role_id}>`
						)

		const rewardsSection = V2.makeTextDisplay(
			['### 🏆 **Reward Roles**', ...rewardsContent].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			rewardsSection,
			separator2,
		}
	},

	boostRoles: (
		boostRoles: {
			x2?: string[]
			x3?: string[]
			x5?: string[]
		} | null,
		guild?: Discord.Guild
	) => {
		const titleSection = V2.makeSection(
			[
				'## 🚀 **Boost Roles Configuration**',
				'> Configure roles that receive XP multipliers for faster leveling.',
			],
			V2.makeButton({
				custom_id: 'levels_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		// Format boost roles display
		const x2Roles = boostRoles?.x2 || []
		const x3Roles = boostRoles?.x3 || []
		const x5Roles = boostRoles?.x5 || []

		// Get Discord Boost role
		const discordBoostRole = guild?.roles.premiumSubscriberRole
		const discordBoostText = discordBoostRole
			? `<@&${discordBoostRole.id}>`
			: 'Discord Boost (not found)'

		// Always show Discord Boost role in x2 content
		const x2Content =
			x2Roles.length === 0
				? discordBoostText
				: `${discordBoostText}, ${x2Roles.map((roleId) => `<@&${roleId}>`).join(', ')}`

		const x3Content =
			x3Roles.length === 0
				? '❌ No roles set'
				: x3Roles.map((roleId) => `<@&${roleId}>`).join(', ')

		const x5Content =
			x5Roles.length === 0
				? '❌ No roles set'
				: x5Roles.map((roleId) => `<@&${roleId}>`).join(', ')

		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Settings**',
				`**2x XP Boost**: ${x2Content}`,
				`**3x XP Boost**: ${x3Content}`,
				`**5x XP Boost**: ${x5Content}`,
				'',
				'### ℹ️ **Information**',
				'• **2x XP**: Double experience points (Discord Boost role included by default)',
				'• **3x XP**: Triple experience points',
				'• **5x XP**: Five times experience points',
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
		}
	},

	levelChannel: (currentChannelId?: string) => {
		const titleSection = V2.makeSection(
			[
				'## 📢 **Level Channel Configuration**',
				'> Set the channel where level-up notifications will be sent.',
			],
			V2.makeButton({
				custom_id: 'levels_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Settings**',
				`**Level Channel**: ${currentChannelId ? `<#${currentChannelId}>` : '❌ Not Set'}`,
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
		}
	},

	rewardMessage: (currentMessage: string) => {
		const titleSection = V2.makeSection(
			[
				'## 💬 **Reward Message Configuration**',
				'> Customize the message sent when users level up.',
			],
			V2.makeButton({
				custom_id: 'levels_back_to_main',
				label: 'Back',
				style: Discord.ButtonStyle.Secondary,
			})
		)

		const separator1 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		const currentSettingsSection = V2.makeTextDisplay(
			[
				'### 📊 **Current Message**',
				`\`\`\`${currentMessage}\`\`\``,
				'',
				'### 📝 **Available Variables**',
				'• `{level}` - The new level reached',
				'• `{user}` - Mention the user',
				"• `{username}` - User's display name",
			].join('\n')
		)

		const separator2 = V2.makeSeparator({
			spacing: Discord.SeparatorSpacingSize.Large,
			divider: false,
		})

		return {
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
		}
	},
}

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                               */
/* -------------------------------------------------------------------------- */

/**
 * Get current reward message with proper priority (components > reward_message > default)
 */
function getCurrentRewardMessage(config: DefaultConfigs['levels']): string {
	return (
		(config.components?.reward_message?.components?.[0] as { content?: string })
			?.content ||
		config.reward_message ||
		'Congratulations, you have leveled up to level {level}!'
	)
}

/**
 * Load levels configuration from database
 */
async function loadConfig(
	inter: Discord.Interaction
): Promise<DefaultConfigs['levels']> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	return await getPluginConfig(inter.client.user.id, inter.guildId, 'levels')
}

/**
 * Save levels configuration to database
 */
async function saveConfig(
	inter: Discord.Interaction,
	config: DefaultConfigs['levels']
): Promise<void> {
	if (!inter.guildId) {
		throw new Error('Guild ID not found')
	}

	await updatePluginConfig(
		inter.client.user.id,
		inter.guildId,
		'levels',
		config
	)
}

/* -------------------------------------------------------------------------- */
/*                               PUBLIC ENTRY                                   */
/* -------------------------------------------------------------------------- */

export async function config(
	inter:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction
) {
	// Early return if interaction already handled
	if (inter.replied || inter.deferred) {
		const customId = inter.isChatInputCommand() ? 'chat_input' : inter.customId
		StatusLogger.warn(
			`[Levels Config] Interaction already handled: ${customId}`
		)
		return
	}

	if (!inter.inGuild() || !inter.guildId) {
		StatusLogger.warn(
			`[Levels Config] Interaction not in guild - guildId: ${inter.guildId}`
		)
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'LC001' }
		)
		return
	}

	try {
		if (inter.isChatInputCommand()) {
			await handleInitialConfig(inter)
		} else if (inter.isStringSelectMenu()) {
			if (inter.customId === 'levels_config_select') {
				await handleConfigSelect(inter)
			} else if (inter.customId === 'levels_reward_role_edit_select') {
				await handleRewardRoleEditSelect(inter)
			} else if (inter.customId === 'levels_reward_role_remove_select') {
				await handleRewardRoleRemoveSelect(inter)
			} else if (inter.customId === 'levels_level_select') {
				await handleLevelSelect(inter)
			} else if (inter.customId === 'levels_level_edit_select') {
				await handleLevelEditSelect(inter)
			} else {
				StatusLogger.warn(
					`[Levels Config] Unknown select menu: ${inter.customId}`
				)
			}
		} else if (inter.isChannelSelectMenu()) {
			await handleChannelSelect(inter)
		} else if (inter.isRoleSelectMenu()) {
			await handleRoleSelect(inter)
		} else if (inter.isButton()) {
			await handleButtonClick(inter)
		} else if (inter.isModalSubmit()) {
			await handleModalSubmit(inter)
		}
	} catch (error) {
		StatusLogger.error(
			'[Levels Config] Unhandled error in main config function:',
			error
		)

		try {
			const errorSection = V2.makeTextDisplay(
				'❌ An unexpected error occurred. Please try again.'
			)

			if (!inter.replied && !inter.deferred) {
				await inter.reply({
					components: [errorSection],
					flags:
						Discord.MessageFlags.Ephemeral |
						Discord.MessageFlags.IsComponentsV2,
				})
			} else if (inter.deferred) {
				await inter.editReply({
					components: [errorSection],
					flags: Discord.MessageFlags.IsComponentsV2,
				})
			} else {
				await inter.followUp({
					components: [errorSection],
					flags:
						Discord.MessageFlags.Ephemeral |
						Discord.MessageFlags.IsComponentsV2,
				})
			}
		} catch (responseError) {
			StatusLogger.error(
				'[Levels Config] Failed to send error response:',
				responseError
			)
		}
	}
}

/* -------------------------------------------------------------------------- */
/*                            COMMAND HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleInitialConfig(
	inter: Discord.ChatInputCommandInteraction | Discord.ButtonInteraction
) {
	await inter.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	const hasPerms = inter.memberPermissions?.has(
		Discord.PermissionsBitField.Flags.ManageGuild
	)

	if (!hasPerms) {
		await utils.handleResponse(
			inter,
			'error',
			'You do not have permission to manage levels configuration',
			{ code: 'LC002' }
		)
		return
	}

	const levelsConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# 📈 **Levels System Configuration**\n\n',
			`System Status: ${levelsConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/levels.png'
		)
	)

	// Create sections
	const channelSection = V2.makeTextDisplay(
		[
			'## 📢 **Channel Configuration**\n',
			`Level Channel: ${levelsConfig.reward_channel_id ? `<#${levelsConfig.reward_channel_id}>` : '❌ Not Set'}`,
		].join('')
	)

	const rewardsSection = V2.makeTextDisplay(
		[
			'## 🏆 **Reward Configuration**\n',
			`Reward Roles: ${levelsConfig.reward_roles?.length ? `✅ ${levelsConfig.reward_roles.length} configured` : '❌ None Set'}\n`,
			`Boost Roles: ${(levelsConfig.boost_roles?.x2?.length || 0) + (levelsConfig.boost_roles?.x3?.length || 0) + (levelsConfig.boost_roles?.x5?.length || 0) ? '✅ Configured' : '❌ None Set'}`,
		].join('')
	)

	const messageSection = V2.makeTextDisplay(
		[
			'## 💬 **Message Configuration**\n',
			`Reward Message: ${getCurrentRewardMessage(levelsConfig) !== 'Congratulations, you have leveled up to level {level}!' ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'levels_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: levelsConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'levels_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !levelsConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('levels_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Level Channel',
				value: 'level_channel',
				description: 'Set level-up notification channel',
				emoji: '📢',
			},
			{
				label: 'Reward Roles',
				value: 'reward_roles',
				description: 'Configure level-based role rewards',
				emoji: '🏆',
			},
			{
				label: 'Boost Roles',
				value: 'boost_roles',
				description: 'Set roles with 3x XP boost',
				emoji: '🚀',
			},
			{
				label: 'Reward Message',
				value: 'reward_message',
				description: 'Customize level-up message',
				emoji: '💬',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			channelSection,
			spacer,
			rewardsSection,
			spacer,
			messageSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleConfigSelect(inter: Discord.StringSelectMenuInteraction) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedOption = inter.values[0]
	const levelsConfig = await loadConfig(inter)

	switch (selectedOption) {
		case 'level_channel':
			await handleLevelChannelConfig(inter, levelsConfig)
			break
		case 'reward_roles':
			await handleRewardRolesConfig(inter, levelsConfig)
			break
		case 'boost_roles':
			await handleBoostRolesConfig(inter, levelsConfig)
			break
		case 'reward_message':
			await handleRewardMessageConfig(inter, levelsConfig)
			break
		default:
			StatusLogger.warn(
				`[Levels Config] Unknown config option: ${selectedOption}`
			)
			break
	}
}

/* -------------------------------------------------------------------------- */
/*                            CONFIG HANDLERS                                   */
/* -------------------------------------------------------------------------- */

async function handleLevelChannelConfig(
	inter: Discord.StringSelectMenuInteraction,
	config: DefaultConfigs['levels']
) {
	const sections = SECTION_BUILDERS.levelChannel(config.reward_channel_id)

	const channelSelect = V2.makeChannelSelect({
		custom_id: 'levels_channel_select',
		placeholder: 'Select level notification channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	const channelRow = V2.makeActionRow([channelSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			channelRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRewardRolesConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction,
	config: DefaultConfigs['levels']
) {
	const rewardRoles = config.reward_roles || []

	// Create title section with back button
	const titleSection = V2.makeSection(
		[
			'## 🏆 **Reward Roles Configuration**',
			'> Configure role rewards for reaching specific levels.',
		],
		V2.makeButton({
			custom_id: 'levels_back_to_main',
			label: 'Back',
			style: Discord.ButtonStyle.Secondary,
		})
	)

	const separator = V2.makeSeparator({
		spacing: Discord.SeparatorSpacingSize.Large,
		divider: false,
	})

	// Create current rewards display
	const rewardsContent =
		rewardRoles.length === 0
			? ['> No reward roles configured yet.']
			: rewardRoles
					.sort((a, b) => a.level - b.level)
					.map(
						(reward, index) =>
							`${index + 1}. Level ${reward.level}: <@&${reward.role_id}>`
					)

	const detailsSection = V2.makeTextDisplay(
		[
			'### 🏆 **Current Reward Roles**',
			...rewardsContent,
			'',
			'### ℹ️ **Information**',
			'• **Level 0**: Starting role (automatically given when user joins, removed when leveling up)',
			'• **Level 5+**: Achievement roles (bot removes previous role and assigns new one)',
			'',
			'### ⚙️ **Management**',
			'Use the buttons below to manage reward roles:',
		].join('\n')
	)

	// Create management buttons
	const managementButtons = [
		V2.makeButton({
			custom_id: 'levels_reward_role_add',
			label: 'Add Reward',
			style: Discord.ButtonStyle.Primary,
		}),
		V2.makeButton({
			custom_id: 'levels_reward_role_edit',
			label: 'Edit Reward',
			style: Discord.ButtonStyle.Secondary,
			disabled: rewardRoles.length === 0,
		}),
		V2.makeButton({
			custom_id: 'levels_reward_role_remove',
			label: 'Remove Reward',
			style: Discord.ButtonStyle.Danger,
			disabled: rewardRoles.length === 0,
		}),
	]
	const managementRow = V2.makeActionRow(managementButtons)

	await inter.editReply({
		components: [titleSection, separator, detailsSection, managementRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleBoostRolesConfig(
	inter: Discord.StringSelectMenuInteraction | Discord.ButtonInteraction,
	config: DefaultConfigs['levels']
) {
	// Handle legacy boost_3x_roles migration to new boost_roles format
	const boostRoles = config.boost_roles || { x2: [], x3: [], x5: [] }

	const sections = SECTION_BUILDERS.boostRoles(boostRoles, inter.guild)

	// Create buttons for different boost levels
	const boostButtons = [
		V2.makeButton({
			custom_id: 'levels_boost_x2_configure',
			label: '2x XP Boost',
			style: Discord.ButtonStyle.Primary,
		}),
		V2.makeButton({
			custom_id: 'levels_boost_x3_configure',
			label: '3x XP Boost',
			style: Discord.ButtonStyle.Primary,
		}),
		V2.makeButton({
			custom_id: 'levels_boost_x5_configure',
			label: '5x XP Boost',
			style: Discord.ButtonStyle.Primary,
		}),
	]
	const boostButtonsRow = V2.makeActionRow(boostButtons)

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			boostButtonsRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRewardMessageConfig(
	inter:
		| Discord.StringSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.ButtonInteraction,
	config: DefaultConfigs['levels']
) {
	const sections = SECTION_BUILDERS.rewardMessage(
		getCurrentRewardMessage(config)
	)

	const editButton = V2.makeButton({
		custom_id: 'levels_edit_reward_message',
		label: 'Edit Message',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'levels_reset_reward_message',
		label: 'Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const buttonRow = V2.makeActionRow([editButton, resetButton])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentSettingsSection,
			sections.separator2,
			buttonRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

/* -------------------------------------------------------------------------- */
/*                            INTERACTION HANDLERS                             */
/* -------------------------------------------------------------------------- */

async function handleChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	try {
		if (!inter.replied && !inter.deferred) {
			await inter.deferUpdate()
		}

		const channel = inter.values[0]
		const levelsConfig = await loadConfig(inter)

		if (inter.customId === 'levels_channel_select') {
			levelsConfig.reward_channel_id = channel
			await saveConfig(inter, levelsConfig)

			await inter.followUp({
				content: `✅ Level channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await updateMainConfigMessage(inter)
		}
	} catch (error) {
		StatusLogger.error('[Levels Config] Error in handleChannelSelect:', error)
	}
}

async function handleRoleSelect(inter: Discord.RoleSelectMenuInteraction) {
	try {
		if (!inter.replied && !inter.deferred) {
			await inter.deferUpdate()
		}

		const roles = inter.values
		const levelsConfig = await loadConfig(inter)

		if (
			inter.customId.startsWith('levels_boost_') &&
			inter.customId.endsWith('_roles_select')
		) {
			// Extract boost level from custom_id (e.g., 'levels_boost_x2_roles_select' -> 'x2')
			const boostLevel = inter.customId
				.replace('levels_boost_', '')
				.replace('_roles_select', '') as 'x2' | 'x3' | 'x5'

			// Initialize boost_roles if not exists
			if (!levelsConfig.boost_roles) {
				levelsConfig.boost_roles = { x2: [], x3: [], x5: [] }
			}

			// Get Discord Boost role ID to filter it out
			const discordBoostRoleId = inter.guild?.roles.premiumSubscriberRole?.id

			// Filter out Discord Boost role from selection (it's automatically in x2)
			const filteredRoles = discordBoostRoleId
				? roles.filter((roleId) => roleId !== discordBoostRoleId)
				: roles

			// Check if user tried to select Discord Boost role
			const triedToSelectDiscordBoost =
				discordBoostRoleId && roles.includes(discordBoostRoleId)

			levelsConfig.boost_roles[boostLevel] = filteredRoles
			await saveConfig(inter, levelsConfig)

			const boostMultiplier =
				boostLevel === 'x2' ? '2x' : boostLevel === 'x3' ? '3x' : '5x'
			const rolesList = filteredRoles
				.map((roleId) => `<@&${roleId}>`)
				.join(', ')

			let message = `✅ ${boostMultiplier} XP boost roles set to ${rolesList || 'none'}`
			if (triedToSelectDiscordBoost) {
				message +=
					'\n⚠️ Discord Boost role is automatically included in 2x XP boost and was filtered out'
			}

			await inter.followUp({
				content: message,
				flags: Discord.MessageFlags.Ephemeral,
			})

			await updateMainConfigMessage(inter)
		} else if (inter.customId.startsWith('levels_reward_role_select_')) {
			// Extract level from custom_id
			const level = Number.parseInt(
				inter.customId.replace('levels_reward_role_select_', '')
			)
			const roleId = roles[0] // Single role selection

			// Update reward roles
			const existingRewards = levelsConfig.reward_roles || []
			const filteredRewards = existingRewards.filter((r) => r.level !== level)

			levelsConfig.reward_roles = [
				...filteredRewards,
				{ level, role_id: roleId },
			]

			await saveConfig(inter, levelsConfig)

			await inter.followUp({
				content: `✅ Set level ${level} reward to <@&${roleId}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})

			// Return to reward roles config
			await handleRewardRolesConfig(inter, levelsConfig)
		}
	} catch (error) {
		StatusLogger.error('[Levels Config] Error in handleRoleSelect:', error)
	}
}

async function handleButtonClick(inter: Discord.ButtonInteraction) {
	// Don't defer for modal buttons
	const isModalButton = inter.customId === 'levels_edit_reward_message'

	if (!isModalButton && !inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const levelsConfig = await loadConfig(inter)

	switch (inter.customId) {
		case 'levels_system_enable':
			levelsConfig.enabled = true
			await saveConfig(inter, levelsConfig)
			await inter.followUp({
				content: '✅ Levels system has been enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'levels_system_disable':
			levelsConfig.enabled = false
			await saveConfig(inter, levelsConfig)
			await inter.followUp({
				content: '✅ Levels system has been disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await updateMainConfigMessage(inter)
			break

		case 'levels_reward_role_add':
			await handleRewardRoleAdd(inter)
			break

		case 'levels_reward_role_edit':
			await handleRewardRoleEdit(inter)
			break

		case 'levels_reward_role_remove':
			await handleRewardRoleRemove(inter)
			break

		case 'levels_edit_reward_message':
			await handleEditRewardMessage(inter)
			break

		case 'levels_reset_reward_message':
			levelsConfig.reward_message =
				'Congratulations, you have leveled up to level {level}!'
			await saveConfig(inter, levelsConfig)
			await inter.followUp({
				content: '✅ Reward message reset to default',
				flags: Discord.MessageFlags.Ephemeral,
			})
			await handleRewardMessageConfig(inter, levelsConfig)
			break

		case 'levels_back_to_main':
			await updateMainConfigMessage(inter)
			break

		case 'levels_back_to_reward_roles':
			await handleRewardRolesConfig(inter, levelsConfig)
			break

		case 'levels_back_to_boost_roles':
			await handleBoostRolesConfig(inter, levelsConfig)
			break

		case 'levels_boost_x2_configure':
			await handleBoostLevelConfig(inter, levelsConfig, 'x2')
			break

		case 'levels_boost_x3_configure':
			await handleBoostLevelConfig(inter, levelsConfig, 'x3')
			break

		case 'levels_boost_x5_configure':
			await handleBoostLevelConfig(inter, levelsConfig, 'x5')
			break

		default:
			StatusLogger.warn(`[Levels Config] Unhandled button: ${inter.customId}`)
			break
	}
}

async function handleModalSubmit(inter: Discord.ModalSubmitInteraction) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const levelsConfig = await loadConfig(inter)

	if (inter.customId === 'levels_reward_message_modal') {
		const newMessage = inter.fields.getTextInputValue('reward_message')

		// Update only components
		// Initialize components if not exists
		if (!levelsConfig.components) {
			levelsConfig.components = {}
		}
		if (!levelsConfig.components.reward_message) {
			levelsConfig.components.reward_message = { components: [] }
		}
		if (!levelsConfig.components.reward_message.components[0]) {
			levelsConfig.components.reward_message.components = [
				{
					type: Discord.ComponentType.TextDisplay,
					content: newMessage,
				} as unknown as ComponentsV2,
			]
		} else {
			// Update existing component content
			;(
				levelsConfig.components.reward_message.components[0] as {
					content: string
				}
			).content = newMessage
		}

		await saveConfig(inter, levelsConfig)

		await inter.followUp({
			content: '✅ Reward message updated successfully',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await handleRewardMessageConfig(inter, levelsConfig)
	}
}

/* -------------------------------------------------------------------------- */
/*                            HELPER HANDLERS                                  */
/* -------------------------------------------------------------------------- */

async function handleRewardRoleAdd(inter: Discord.ButtonInteraction) {
	const sections = SECTION_BUILDERS.addRewardRole()

	// Create level selector (0-100)
	const levelOptions = []
	for (let i = 0; i <= 100; i += 5) {
		levelOptions.push({
			label: `Level ${i}`,
			value: i.toString(),
			description: `Reward for reaching level ${i}`,
		})
	}

	const levelSelect = V2.makeStringSelect('levels_level_select')
		.setPlaceholder('Select level requirement...')
		.addOptions(levelOptions.slice(0, 25)) // Discord limit

	const levelRow = V2.makeActionRow([levelSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.stepsSection,
			sections.separator2,
			levelRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleLevelSelect(inter: Discord.StringSelectMenuInteraction) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedLevel = Number.parseInt(inter.values[0])
	const sections = SECTION_BUILDERS.addRewardRole(selectedLevel)

	const roleSelect = V2.makeRoleSelect({
		custom_id: `levels_reward_role_select_${selectedLevel}`,
		placeholder: 'Select reward role...',
		min_values: 1,
		max_values: 1,
	})

	const roleRow = V2.makeActionRow([roleSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.selectedSection,
			sections.separator2,
			sections.stepsSection,
			sections.separator3,
			roleRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRewardRoleEdit(inter: Discord.ButtonInteraction) {
	const levelsConfig = await loadConfig(inter)
	const rewardRoles = levelsConfig.reward_roles || []

	if (rewardRoles.length === 0) {
		await inter.followUp({
			content: 'No reward roles to edit. Add some rewards first.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	const sections = SECTION_BUILDERS.editRewardRole(rewardRoles)

	const options = await Promise.all(
		rewardRoles.map(async (reward) => {
			const role = await inter.guild?.roles
				.fetch(reward.role_id)
				.catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${reward.role_id})`

			return {
				label: `Level ${reward.level}: ${roleName}`,
				value: `${reward.level}_${reward.role_id}`,
				description: `Edit reward for level ${reward.level}`,
			}
		})
	)

	const editSelect = V2.makeStringSelect('levels_reward_role_edit_select')
		.setPlaceholder('Select reward to edit...')
		.addOptions(options)

	const editRow = V2.makeActionRow([editSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.currentRewardsSection,
			sections.separator2,
			editRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRewardRoleEditSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const [level, roleId] = inter.values[0].split('_')
	const selectedLevel = Number.parseInt(level)

	// Show level selector for editing
	const levelOptions = []
	for (let i = 0; i <= 100; i += 5) {
		levelOptions.push({
			label: `Level ${i}`,
			value: `edit_${selectedLevel}_${roleId}_${i}`,
			description: `Change to level ${i}`,
		})
	}

	const levelSelect = V2.makeStringSelect('levels_level_edit_select')
		.setPlaceholder('Select new level requirement...')
		.addOptions(levelOptions.slice(0, 25))

	const levelRow = V2.makeActionRow([levelSelect])

	const titleSection = V2.makeSection(
		[
			'## ✏️ **Edit Reward Role**',
			`> Editing reward: Level ${selectedLevel} -> <@&${roleId}>`,
		],
		V2.makeButton({
			custom_id: 'levels_back_to_reward_roles',
			label: 'Back',
			style: Discord.ButtonStyle.Secondary,
		})
	)

	const separator = V2.makeSeparator({
		spacing: Discord.SeparatorSpacingSize.Large,
		divider: false,
	})

	await inter.editReply({
		components: [titleSection, separator, levelRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleLevelEditSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	// Parse the selected value - should be edit_oldLevel_roleId_newLevel
	const value = inter.values[0]
	const parts = value.split('_')
	const oldLevel = Number.parseInt(parts[1])
	const roleId = parts[2]
	const newLevel = Number.parseInt(parts[3])

	const levelsConfig = await loadConfig(inter)

	// Update the reward role
	const rewardRoles = levelsConfig.reward_roles || []
	const updatedRoles = rewardRoles.map((reward) =>
		reward.level === oldLevel && reward.role_id === roleId
			? { ...reward, level: newLevel }
			: reward
	)

	levelsConfig.reward_roles = updatedRoles
	await saveConfig(inter, levelsConfig)

	await inter.followUp({
		content: `✅ Updated reward role <@&${roleId}> from level ${oldLevel} to level ${newLevel}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleRewardRolesConfig(inter, levelsConfig)
}

async function handleRewardRoleRemove(inter: Discord.ButtonInteraction) {
	const levelsConfig = await loadConfig(inter)
	const rewardRoles = levelsConfig.reward_roles || []

	if (rewardRoles.length === 0) {
		await inter.followUp({
			content: '❌ No reward roles to remove.',
			flags: Discord.MessageFlags.Ephemeral,
		})
		return
	}

	const sections = SECTION_BUILDERS.removeRewardRole(rewardRoles)

	const options = await Promise.all(
		rewardRoles.map(async (reward) => {
			const role = await inter.guild?.roles
				.fetch(reward.role_id)
				.catch(() => null)
			const roleName = role ? role.name : `Unknown Role (${reward.role_id})`

			return {
				label: `Level ${reward.level}: ${roleName}`,
				value: `${reward.level}_${reward.role_id}`,
				description: 'Remove this reward',
			}
		})
	)

	const removeSelect = V2.makeStringSelect('levels_reward_role_remove_select')
		.setPlaceholder('Select rewards to remove...')
		.setMinValues(1)
		.setMaxValues(options.length)
		.addOptions(options)

	const removeRow = V2.makeActionRow([removeSelect])

	await inter.editReply({
		components: [
			sections.titleSection,
			sections.separator1,
			sections.rewardsSection,
			sections.separator2,
			removeRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleRewardRoleRemoveSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const levelsConfig = await loadConfig(inter)
	const selectedRewards = inter.values.map((value) => {
		const [level, roleId] = value.split('_')
		return { level: Number.parseInt(level), role_id: roleId }
	})

	// Remove selected rewards
	levelsConfig.reward_roles = (levelsConfig.reward_roles || []).filter(
		(reward) =>
			!selectedRewards.some(
				(selected) =>
					selected.level === reward.level && selected.role_id === reward.role_id
			)
	)

	await saveConfig(inter, levelsConfig)

	const removedText = selectedRewards
		.map((reward) => `Level ${reward.level}: <@&${reward.role_id}>`)
		.join(', ')

	await inter.followUp({
		content: `✅ Removed reward roles: ${removedText}`,
		flags: Discord.MessageFlags.Ephemeral,
	})

	await handleRewardRolesConfig(inter, levelsConfig)
}

async function handleEditRewardMessage(inter: Discord.ButtonInteraction) {
	const levelsConfig = await loadConfig(inter)

	const modal = new Discord.ModalBuilder()
		.setCustomId('levels_reward_message_modal')
		.setTitle('Edit Reward Message')

	const messageInput = new Discord.TextInputBuilder()
		.setCustomId('reward_message')
		.setLabel('Reward Message')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setValue(getCurrentRewardMessage(levelsConfig))
		.setRequired(true)
		.setMaxLength(2000)

	const messageRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			messageInput
		)
	modal.addComponents(messageRow)

	await inter.showModal(modal)
}

async function handleBoostLevelConfig(
	inter: Discord.ButtonInteraction,
	config: DefaultConfigs['levels'],
	boostLevel: 'x2' | 'x3' | 'x5'
) {
	const boostMultiplier =
		boostLevel === 'x2' ? '2x' : boostLevel === 'x3' ? '3x' : '5x'

	// Initialize boost_roles if not exists
	if (!config.boost_roles) {
		config.boost_roles = { x2: [], x3: [], x5: [] }
	}

	const titleSection = V2.makeSection(
		[
			`## 🚀 **${boostMultiplier} XP Boost Configuration**`,
			`> Configure roles that receive ${boostMultiplier} experience points.`,
		],
		V2.makeButton({
			custom_id: 'levels_back_to_boost_roles',
			label: 'Back',
			style: Discord.ButtonStyle.Secondary,
		})
	)

	const separator1 = V2.makeSeparator({
		spacing: Discord.SeparatorSpacingSize.Large,
		divider: false,
	})

	// Get current roles for this boost level
	const currentRoles = config.boost_roles[boostLevel] || []

	// Get Discord Boost role for x2 display
	const discordBoostRole = inter.guild?.roles.premiumSubscriberRole
	const discordBoostText = discordBoostRole
		? `<@&${discordBoostRole.id}>`
		: 'Discord Boost (not found)'

	// For x2, always show Discord Boost role as included
	const rolesContent =
		boostLevel === 'x2'
			? currentRoles.length === 0
				? discordBoostText
				: `${discordBoostText}, ${currentRoles.map((roleId) => `<@&${roleId}>`).join(', ')}`
			: currentRoles.length === 0
				? '❌ No roles set'
				: currentRoles.map((roleId) => `<@&${roleId}>`).join(', ')

	const currentSettingsSection = V2.makeTextDisplay(
		[
			'### 📊 **Current Settings**',
			`**${boostMultiplier} XP Boost Roles**: ${rolesContent}`,
			'',
			'### ℹ️ **Information**',
			boostLevel === 'x2'
				? 'Discord Boost role is automatically included in 2x XP boost and cannot be removed'
				: `Users with these roles will earn ${boostMultiplier} the normal experience points`,
		].join('\n')
	)

	const separator2 = V2.makeSeparator({
		spacing: Discord.SeparatorSpacingSize.Large,
		divider: false,
	})

	const roleSelect = V2.makeRoleSelect({
		custom_id: `levels_boost_${boostLevel}_roles_select`,
		placeholder: `Select roles for ${boostMultiplier} XP boost`,
		min_values: 0,
		max_values: 10,
	})

	// Pre-select current roles if any
	if (currentRoles.length > 0) {
		roleSelect.setDefaultRoles(currentRoles)
	}

	// Note: Discord Boost role is automatically included in x2 boost
	// User should not select it manually for any boost level

	const roleRow = V2.makeActionRow([roleSelect])

	await inter.editReply({
		components: [
			titleSection,
			separator1,
			currentSettingsSection,
			separator2,
			roleRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function updateMainConfigMessage(
	inter:
		| Discord.ButtonInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ModalSubmitInteraction
		| Discord.StringSelectMenuInteraction
) {
	const levelsConfig = await loadConfig(inter)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# 📈 **Levels System Configuration**\n\n',
			`System Status: ${levelsConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/levels.png'
		)
	)

	// Create sections
	const channelSection = V2.makeTextDisplay(
		[
			'## 📢 **Channel Configuration**\n',
			`Level Channel: ${levelsConfig.reward_channel_id ? `<#${levelsConfig.reward_channel_id}>` : '❌ Not Set'}`,
		].join('')
	)

	const rewardsSection = V2.makeTextDisplay(
		[
			'## 🏆 **Reward Configuration**\n',
			`Reward Roles: ${levelsConfig.reward_roles?.length ? `✅ ${levelsConfig.reward_roles.length} configured` : '❌ None Set'}\n`,
			`Boost Roles: ${(levelsConfig.boost_roles?.x2?.length || 0) + (levelsConfig.boost_roles?.x3?.length || 0) + (levelsConfig.boost_roles?.x5?.length || 0) ? '✅ Configured' : '❌ None Set'}`,
		].join('')
	)

	const messageSection = V2.makeTextDisplay(
		[
			'## 💬 **Message Configuration**\n',
			`Reward Message: ${getCurrentRewardMessage(levelsConfig) !== 'Congratulations, you have leveled up to level {level}!' ? '✅ Configured' : '❌ Default'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'levels_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: levelsConfig.enabled,
		}),
		V2.makeButton({
			custom_id: 'levels_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !levelsConfig.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('levels_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Level Channel',
				value: 'level_channel',
				description: 'Set level-up notification channel',
				emoji: '📢',
			},
			{
				label: 'Reward Roles',
				value: 'reward_roles',
				description: 'Configure level-based role rewards',
				emoji: '🏆',
			},
			{
				label: 'Boost Roles',
				value: 'boost_roles',
				description: 'Set roles with 3x XP boost',
				emoji: '🚀',
			},
			{
				label: 'Reward Message',
				value: 'reward_message',
				description: 'Customize level-up message',
				emoji: '💬',
			},
		])

	const menuRow = V2.makeActionRow([configMenu])

	await inter.editReply({
		components: [
			titleSection,
			statusRow,
			spacer,
			channelSection,
			spacer,
			rewardsSection,
			spacer,
			messageSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}
