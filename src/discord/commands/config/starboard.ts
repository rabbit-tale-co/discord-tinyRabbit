import * as Discord from 'discord.js'
import * as utils from '@/utils/index.js'
import * as api from '@/discord/api/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as V2 from 'discord-components-v2'
import type { DefaultConfigs } from '@/types/index.js'

/* -------------------------------------------------------------------------- */
/*                               HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */

/**
 * Validates if a string is a valid emoji (Unicode emoji or Discord custom emoji)
 */
function isValidEmoji(input: string): boolean {
	// Trim whitespace
	const trimmed = input.trim()

	// Check for Discord custom emoji format: <:name:id> or <a:name:id>
	const discordEmojiRegex = /^<a?:\w+:\d+>$/
	if (discordEmojiRegex.test(trimmed)) {
		return true
	}

	// Check for Unicode emoji
	// This regex matches most Unicode emoji sequences
	const unicodeEmojiRegex =
		/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?)+$/u
	if (unicodeEmojiRegex.test(trimmed)) {
		return true
	}

	// Additional check for common emoji patterns that might not be caught by the above
	const commonEmojiRegex =
		/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u
	if (commonEmojiRegex.test(trimmed)) {
		return true
	}

	return false
}

/* -------------------------------------------------------------------------- */
/*                               PUBLIC ENTRY                                   */
/* -------------------------------------------------------------------------- */

export async function config(
	inter:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction
) {
	if (!inter.inGuild() || !inter.guildId) {
		StatusLogger.warn(
			`[Starboard Config] Interaction not in guild - guildId: ${inter.guildId}`
		)
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'SB001' }
		)
		return
	}

	try {
		if (inter.isChatInputCommand()) {
			await handleInitialConfig(inter)
		} else if (inter.isStringSelectMenu()) {
			await handleConfigSelect(inter)
		} else if (inter.isChannelSelectMenu()) {
			await handleChannelSelect(inter)
		} else if (inter.isButton()) {
			await handleButtonClick(inter)
		} else if (inter.isModalSubmit()) {
			await handleModalSubmit(inter)
		}
	} catch (error) {
		StatusLogger.error(
			'[Starboard Config] Unhandled error in main config function:',
			error
		)

		// Try to respond with error
		try {
			if (!inter.replied && !inter.deferred) {
				await inter.reply({
					content: '❌ An unexpected error occurred. Please try again.',
					flags: Discord.MessageFlags.Ephemeral,
				})
			} else if (inter.deferred) {
				await inter.editReply({
					content: '❌ An unexpected error occurred. Please try again.',
				})
			} else {
				await inter.followUp({
					content: '❌ An unexpected error occurred. Please try again.',
					flags: Discord.MessageFlags.Ephemeral,
				})
			}
		} catch (responseError) {
			StatusLogger.error(
				'[Starboard Config] Failed to send error response:',
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
		StatusLogger.warn(
			`[Starboard Config] User lacks ManageGuild permission - userId: ${inter.user.id}`
		)
		await utils.handleResponse(
			inter,
			'error',
			'You do not have permission to manage starboard configuration',
			{ code: 'SB002' }
		)
		return
	}

	if (!inter.guildId) {
		StatusLogger.error('[Starboard Config] Guild ID not found in interaction')
		await utils.handleResponse(inter, 'error', 'Guild ID not found', {
			code: 'SB003',
		})
		return
	}

	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# ⭐ Starboard Configuration\n\n',
			`System Status: ${starboardConfig?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/starboard.png'
		)
	)

	// Create sections for configuration
	const channelSection = V2.makeTextDisplay(
		[
			'## 📋 Channel Configuration\n',
			`Starboard Channel: ${starboardConfig?.channel_id ? `<#${starboardConfig.channel_id}>` : '❌ Not Set'}\n`,
			`Watched Channels: ${
				starboardConfig?.watch_channels?.length
					? starboardConfig.watch_channels.map((c) => `<#${c}>`).join(' ')
					: '🌐 All Channels'
			}`,
		].join('')
	)

	const settingsSection = V2.makeTextDisplay(
		[
			'## ⚙️ Starboard Settings\n',
			`Emoji: ${starboardConfig?.emoji || '⭐'}\n`,
			`Threshold: ${starboardConfig?.threshold || 1} ${(starboardConfig?.threshold || 1) === 1 ? 'reaction' : 'reactions'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'starboard_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: starboardConfig?.enabled,
		}),
		V2.makeButton({
			custom_id: 'starboard_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !starboardConfig?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('starboard_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Starboard Channel',
				value: 'starboard_channel',
				description: 'Set the starboard display channel',
				emoji: '📋',
			},
			{
				label: 'Emoji',
				value: 'emoji',
				description: 'Set the reaction emoji to watch',
				emoji: '⭐',
			},
			{
				label: 'Threshold',
				value: 'threshold',
				description: 'Set minimum reactions needed',
				emoji: '🎯',
			},
			{
				label: 'Watched Channels',
				value: 'watch_channels',
				description: 'Set specific channels to monitor',
				emoji: '👀',
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
			settingsSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleConfigSelect(inter: Discord.StringSelectMenuInteraction) {
	// Check if this is the threshold select menu
	if (inter.customId === 'starboard_threshold_select') {
		// Only defer if the interaction hasn't been handled yet
		if (!inter.replied && !inter.deferred) {
			await inter.deferUpdate()
		}

		const threshold = Number.parseInt(inter.values[0])

		const starboardConfig = await api.getPluginConfig(
			inter.client.user.id,
			inter.guildId,
			'starboard'
		)

		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId,
			'starboard',
			{
				...starboardConfig,
				threshold: threshold,
			}
		)

		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Starboard threshold set to ${threshold} ${threshold === 1 ? 'reaction' : 'reactions'}`,
			flags: Discord.MessageFlags.Ephemeral,
		})

		// Update the main config message
		await updateMainConfigMessageGeneric(inter)
		return
	}

	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const selectedOption = inter.values[0]

	switch (selectedOption) {
		case 'starboard_channel':
			await showStarboardChannelConfig(inter)
			break
		case 'emoji':
			await showEmojiConfig(inter)
			break
		case 'threshold':
			await showThresholdConfig(inter)
			break
		case 'watch_channels':
			await showWatchChannelsConfig(inter)
			break
		default:
			StatusLogger.warn(
				`[Starboard Config] Unknown config option: ${selectedOption}`
			)
			break
	}
}

async function handleChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	try {
		// Only defer if the interaction hasn't been handled yet
		if (!inter.replied && !inter.deferred) {
			await inter.deferUpdate()
		}

		const starboardConfig = await api.getPluginConfig(
			inter.client.user.id,
			inter.guildId,
			'starboard'
		)

		if (inter.customId === 'starboard_channel_select') {
			const channel = inter.values[0]
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId,
				'starboard',
				{
					...starboardConfig,
					channel_id: channel,
				}
			)

			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: `✅ Starboard channel set to <#${channel}>`,
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessageGeneric(inter)
		} else if (inter.customId === 'starboard_watch_channels_select') {
			// Handle empty selection as "monitor all channels"
			const channelsToSet =
				inter.values && inter.values.length > 0 ? inter.values : []

			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId,
				'starboard',
				{
					...starboardConfig,
					watch_channels: channelsToSet,
				}
			)

			if (channelsToSet.length > 0) {
				const channelList = channelsToSet.map((c) => `<#${c}>`).join(', ')
				// Send success message as ephemeral follow-up
				await inter.followUp({
					content: `✅ Watched channels set to: ${channelList}`,
					flags: Discord.MessageFlags.Ephemeral,
				})
			} else {
				// Send success message for monitoring all channels
				await inter.followUp({
					content: '✅ Now monitoring all channels for starboard reactions',
					flags: Discord.MessageFlags.Ephemeral,
				})
			}

			// Update the main config message
			await updateMainConfigMessageGeneric(inter)
		} else {
			StatusLogger.warn(
				`[Starboard Config] Unknown channel select customId: ${inter.customId}`
			)
		}
	} catch (error) {
		StatusLogger.error(
			'[Starboard Config] Error in handleChannelSelect:',
			error
		)

		// Try to respond with error if interaction hasn't been handled
		try {
			if (!inter.replied && !inter.deferred) {
				await inter.reply({
					content:
						'❌ An error occurred while processing your selection. Please try again.',
					flags: Discord.MessageFlags.Ephemeral,
				})
			} else {
				await inter.followUp({
					content:
						'❌ An error occurred while processing your selection. Please try again.',
					flags: Discord.MessageFlags.Ephemeral,
				})
			}
		} catch (followUpError) {
			StatusLogger.error(
				'[Starboard Config] Failed to send error message:',
				followUpError
			)
		}
	}
}

// Helper function to update the main config message from channel select interactions
async function updateMainConfigMessageFromChannelSelect(
	inter: Discord.ChannelSelectMenuInteraction
) {
	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# ⭐ Starboard Configuration\n\n',
			`System Status: ${starboardConfig?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/starboard.png'
		)
	)

	// Create sections for configuration
	const channelSection = V2.makeTextDisplay(
		[
			'## 📋 Channel Configuration\n',
			`Starboard Channel: ${starboardConfig?.channel_id ? `<#${starboardConfig.channel_id}>` : '❌ Not Set'}\n`,
			`Watched Channels: ${
				starboardConfig?.watch_channels?.length
					? starboardConfig.watch_channels.map((c) => `<#${c}>`).join(' ')
					: '🌐 All Channels'
			}`,
		].join('')
	)

	const settingsSection = V2.makeTextDisplay(
		[
			'## ⚙️ Starboard Settings\n',
			`Emoji: ${starboardConfig?.emoji || '⭐'}\n`,
			`Threshold: ${starboardConfig?.threshold || 1} ${(starboardConfig?.threshold || 1) === 1 ? 'reaction' : 'reactions'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'starboard_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: starboardConfig?.enabled,
		}),
		V2.makeButton({
			custom_id: 'starboard_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !starboardConfig?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('starboard_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Starboard Channel',
				value: 'starboard_channel',
				description: 'Set the starboard display channel',
				emoji: '📋',
			},
			{
				label: 'Emoji',
				value: 'emoji',
				description: 'Set the reaction emoji to watch',
				emoji: '⭐',
			},
			{
				label: 'Threshold',
				value: 'threshold',
				description: 'Set minimum reactions needed',
				emoji: '🎯',
			},
			{
				label: 'Watched Channels',
				value: 'watch_channels',
				description: 'Set specific channels to monitor',
				emoji: '👀',
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
			settingsSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleButtonClick(inter: Discord.ButtonInteraction) {
	// Check if this button will show a modal - if so, don't defer
	const modalButtons = [
		'starboard_change_emoji',
		'starboard_emoji_custom',
		'starboard_threshold_custom',
	]
	const willShowModal = modalButtons.includes(inter.customId)

	// Only defer if the interaction hasn't been handled yet AND it won't show a modal
	if (!inter.replied && !inter.deferred && !willShowModal) {
		await inter.deferUpdate()
	}

	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	switch (inter.customId) {
		case 'starboard_system_enable':
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId,
				'starboard',
				{
					...starboardConfig,
					enabled: true,
				}
			)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: '✅ Starboard system has been enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessage(inter)
			break

		case 'starboard_system_disable':
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId,
				'starboard',
				{
					...starboardConfig,
					enabled: false,
				}
			)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: '✅ Starboard system has been disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessage(inter)
			break

		case 'starboard_config_back':
			await updateMainConfigMessage(inter)
			break

		case 'clear_watch_channels':
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId,
				'starboard',
				{
					...starboardConfig,
					watch_channels: [],
				}
			)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: '✅ Watch channels cleared - now monitoring all channels',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessage(inter)
			break

		case 'starboard_change_emoji': {
			// Show modal for changing emoji
			const modal = new Discord.ModalBuilder()
				.setCustomId('starboard_emoji_modal')
				.setTitle('Change Starboard Emoji')

			const emojiRow =
				new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
					new Discord.TextInputBuilder()
						.setCustomId('emoji')
						.setLabel('Emoji (e.g., ⭐, 🌟, or custom emoji)')
						.setStyle(Discord.TextInputStyle.Short)
						.setValue(starboardConfig?.emoji || '⭐')
						.setRequired(true)
						.setMaxLength(100)
				)

			modal.addComponents(emojiRow)
			await inter.showModal(modal)
			break
		}

		case 'starboard_reset_emoji':
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId,
				'starboard',
				{
					...starboardConfig,
					emoji: '⭐',
				}
			)
			// Send success message as ephemeral follow-up
			await inter.followUp({
				content: '✅ Starboard emoji reset to ⭐',
				flags: Discord.MessageFlags.Ephemeral,
			})
			// Update the main config message
			await updateMainConfigMessage(inter)
			break

		case 'starboard_emoji_custom': {
			// Show modal for custom emoji
			const modal = new Discord.ModalBuilder()
				.setCustomId('starboard_emoji_modal')
				.setTitle('Custom Starboard Emoji')

			const emojiRow =
				new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
					new Discord.TextInputBuilder()
						.setCustomId('emoji')
						.setLabel('Emoji (e.g., ⭐, 🌟, or custom emoji name)')
						.setStyle(Discord.TextInputStyle.Short)
						.setValue(starboardConfig?.emoji || '⭐')
						.setRequired(true)
				)

			modal.addComponents(emojiRow)
			await inter.showModal(modal)
			break
		}

		case 'starboard_threshold_custom': {
			// Show modal for custom threshold
			const modal = new Discord.ModalBuilder()
				.setCustomId('starboard_threshold_modal')
				.setTitle('Custom Starboard Threshold')

			const thresholdRow =
				new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
					new Discord.TextInputBuilder()
						.setCustomId('threshold')
						.setLabel('Minimum reactions needed (number)')
						.setStyle(Discord.TextInputStyle.Short)
						.setValue(String(starboardConfig?.threshold || 1))
						.setRequired(true)
				)

			modal.addComponents(thresholdRow)
			await inter.showModal(modal)
			break
		}

		default:
			StatusLogger.warn(`Unhandled starboard button ID: ${inter.customId}`)
			break
	}
}

// Helper function to update the main config message
async function updateMainConfigMessage(inter: Discord.ButtonInteraction) {
	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# ⭐ Starboard Configuration\n\n',
			`System Status: ${starboardConfig?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/starboard.png'
		)
	)

	// Create sections for configuration
	const channelSection = V2.makeTextDisplay(
		[
			'## 📋 Channel Configuration\n',
			`Starboard Channel: ${starboardConfig?.channel_id ? `<#${starboardConfig.channel_id}>` : '❌ Not Set'}\n`,
			`Watched Channels: ${
				starboardConfig?.watch_channels?.length
					? starboardConfig.watch_channels.map((c) => `<#${c}>`).join(' ')
					: '🌐 All Channels'
			}`,
		].join('')
	)

	const settingsSection = V2.makeTextDisplay(
		[
			'## ⚙️ Starboard Settings\n',
			`Emoji: ${starboardConfig?.emoji || '⭐'}\n`,
			`Threshold: ${starboardConfig?.threshold || 1} ${(starboardConfig?.threshold || 1) === 1 ? 'reaction' : 'reactions'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'starboard_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: starboardConfig?.enabled,
		}),
		V2.makeButton({
			custom_id: 'starboard_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !starboardConfig?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('starboard_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Starboard Channel',
				value: 'starboard_channel',
				description: 'Set the starboard display channel',
				emoji: '📋',
			},
			{
				label: 'Emoji',
				value: 'emoji',
				description: 'Set the reaction emoji to watch',
				emoji: '⭐',
			},
			{
				label: 'Threshold',
				value: 'threshold',
				description: 'Set minimum reactions needed',
				emoji: '🎯',
			},
			{
				label: 'Watched Channels',
				value: 'watch_channels',
				description: 'Set specific channels to monitor',
				emoji: '👀',
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
			settingsSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleModalSubmit(inter: Discord.ModalSubmitInteraction) {
	// Only defer if the interaction hasn't been handled yet
	if (!inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	if (inter.customId === 'starboard_emoji_modal') {
		const emoji = inter.fields.getTextInputValue('emoji')

		// Validate emoji input
		if (!isValidEmoji(emoji)) {
			StatusLogger.warn(`[Starboard Config] Invalid emoji input: ${emoji}`)
			// Send error message as ephemeral follow-up
			await inter.followUp({
				content:
					'❌ Please enter a valid emoji only. Examples: ⭐, 🌟, or custom Discord emojis like <:star:123456789>',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return
		}

		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId,
			'starboard',
			{
				...starboardConfig,
				emoji: emoji.trim(),
			}
		)

		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Starboard emoji set to ${emoji.trim()}`,
			flags: Discord.MessageFlags.Ephemeral,
		})

		// Update the main config message
		await updateMainConfigMessageFromModal(inter)
	} else if (inter.customId === 'starboard_threshold_modal') {
		const threshold = Number.parseInt(
			inter.fields.getTextInputValue('threshold')
		)

		if (Number.isNaN(threshold) || threshold < 1) {
			StatusLogger.warn(
				`[Starboard Config] Invalid threshold value: ${threshold}`
			)
			// Send error message as ephemeral follow-up
			await inter.followUp({
				content: '❌ Threshold must be a number greater than 0',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return
		}

		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId,
			'starboard',
			{
				...starboardConfig,
				threshold: threshold,
			}
		)

		// Send success message as ephemeral follow-up
		await inter.followUp({
			content: `✅ Starboard threshold set to ${threshold} ${threshold === 1 ? 'reaction' : 'reactions'}`,
			flags: Discord.MessageFlags.Ephemeral,
		})

		// Update the main config message
		await updateMainConfigMessageFromModal(inter)
	} else {
		StatusLogger.warn(
			`[Starboard Config] Unknown modal customId: ${inter.customId}`
		)
	}
}

// Helper function to update the main config message from modal interactions
async function updateMainConfigMessageFromModal(
	inter: Discord.ModalSubmitInteraction
) {
	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# ⭐ Starboard Configuration\n\n',
			`System Status: ${starboardConfig?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/starboard.png'
		)
	)

	// Create sections for configuration
	const channelSection = V2.makeTextDisplay(
		[
			'## 📋 Channel Configuration\n',
			`Starboard Channel: ${starboardConfig?.channel_id ? `<#${starboardConfig.channel_id}>` : '❌ Not Set'}\n`,
			`Watched Channels: ${
				starboardConfig?.watch_channels?.length
					? starboardConfig.watch_channels.map((c) => `<#${c}>`).join(' ')
					: '🌐 All Channels'
			}`,
		].join('')
	)

	const settingsSection = V2.makeTextDisplay(
		[
			'## ⚙️ Starboard Settings\n',
			`Emoji: ${starboardConfig?.emoji || '⭐'}\n`,
			`Threshold: ${starboardConfig?.threshold || 1} ${(starboardConfig?.threshold || 1) === 1 ? 'reaction' : 'reactions'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'starboard_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: starboardConfig?.enabled,
		}),
		V2.makeButton({
			custom_id: 'starboard_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !starboardConfig?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('starboard_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Starboard Channel',
				value: 'starboard_channel',
				description: 'Set the starboard display channel',
				emoji: '📋',
			},
			{
				label: 'Emoji',
				value: 'emoji',
				description: 'Set the reaction emoji to watch',
				emoji: '⭐',
			},
			{
				label: 'Threshold',
				value: 'threshold',
				description: 'Set minimum reactions needed',
				emoji: '🎯',
			},
			{
				label: 'Watched Channels',
				value: 'watch_channels',
				description: 'Set specific channels to monitor',
				emoji: '👀',
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
			settingsSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

/* -------------------------------------------------------------------------- */
/*                            CONFIG HANDLERS                                   */
/* -------------------------------------------------------------------------- */

async function showStarboardChannelConfig(
	inter: Discord.StringSelectMenuInteraction
) {
	const channelSelect = V2.makeChannelSelect({
		custom_id: 'starboard_channel_select',
		placeholder: 'Select starboard channel',
		channel_types: [Discord.ChannelType.GuildText],
	})

	const row = V2.makeActionRow([channelSelect])

	// Create title section
	const titleSection = V2.makeTextDisplay(
		'# Select Starboard Channel\n\nChoose a channel where starred messages will be displayed'
	)

	const backButton = V2.makeButton({
		custom_id: 'starboard_config_back',
		label: '← Back to Settings',
		style: Discord.ButtonStyle.Secondary,
	})
	const backRow = V2.makeActionRow([backButton])

	await inter.editReply({
		components: [titleSection, row, backRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function showEmojiConfig(inter: Discord.StringSelectMenuInteraction) {
	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Create title section
	const titleSection = V2.makeTextDisplay(
		'# Configure Starboard Emoji\n\nSet the emoji that users need to react with to add messages to the starboard.'
	)

	// Current emoji display
	const currentEmojiSection = V2.makeTextDisplay(
		`## Current Emoji\n${starboardConfig?.emoji || '⭐'}`
	)

	const changeButton = V2.makeButton({
		custom_id: 'starboard_change_emoji',
		label: '✏️ Change Emoji',
		style: Discord.ButtonStyle.Primary,
	})

	const resetButton = V2.makeButton({
		custom_id: 'starboard_reset_emoji',
		label: '⭐ Reset to Default',
		style: Discord.ButtonStyle.Secondary,
	})

	const backButton = V2.makeButton({
		custom_id: 'starboard_config_back',
		label: '← Back to Settings',
		style: Discord.ButtonStyle.Secondary,
	})

	const buttonRow = V2.makeActionRow([changeButton, resetButton, backButton])

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	await inter.editReply({
		components: [titleSection, spacer, currentEmojiSection, spacer, buttonRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function showThresholdConfig(inter: Discord.StringSelectMenuInteraction) {
	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Create title section
	const titleSection = V2.makeTextDisplay(
		'# Configure Starboard Threshold\n\nSet the minimum number of reactions needed for a message to be added to the starboard.'
	)

	// Current threshold display
	const currentThresholdSection = V2.makeTextDisplay(
		`## Current Threshold\n${starboardConfig?.threshold || 1} ${(starboardConfig?.threshold || 1) === 1 ? 'reaction' : 'reactions'}`
	)

	// Create threshold select menu with options 1-50 (25 options)
	const thresholdSelect = V2.makeStringSelect('starboard_threshold_select')
		.setPlaceholder('Select threshold (reactions needed)')
		.addOptions([
			{ label: '1 reaction', value: '1', emoji: '1️⃣' },
			{ label: '2 reactions', value: '2', emoji: '2️⃣' },
			{ label: '3 reactions', value: '3', emoji: '3️⃣' },
			{ label: '4 reactions', value: '4', emoji: '4️⃣' },
			{ label: '5 reactions', value: '5', emoji: '5️⃣' },
			{ label: '6 reactions', value: '6', emoji: '6️⃣' },
			{ label: '7 reactions', value: '7', emoji: '7️⃣' },
			{ label: '8 reactions', value: '8', emoji: '8️⃣' },
			{ label: '9 reactions', value: '9', emoji: '9️⃣' },
			{ label: '10 reactions', value: '10', emoji: '🔟' },
			{ label: '15 reactions', value: '15', emoji: '🎯' },
			{ label: '20 reactions', value: '20', emoji: '🎪' },
			{ label: '25 reactions', value: '25', emoji: '🌟' },
			{ label: '30 reactions', value: '30', emoji: '⭐' },
			{ label: '35 reactions', value: '35', emoji: '💫' },
			{ label: '40 reactions', value: '40', emoji: '✨' },
			{ label: '45 reactions', value: '45', emoji: '🌠' },
			{ label: '50 reactions', value: '50', emoji: '🎆' },
		])

	const selectRow = V2.makeActionRow([thresholdSelect])

	const customButton = V2.makeButton({
		custom_id: 'starboard_threshold_custom',
		label: '🎯 Custom Number',
		style: Discord.ButtonStyle.Primary,
	})

	const backButton = V2.makeButton({
		custom_id: 'starboard_config_back',
		label: '← Back to Settings',
		style: Discord.ButtonStyle.Secondary,
	})

	const buttonRow = V2.makeActionRow([customButton, backButton])

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	await inter.editReply({
		components: [
			titleSection,
			spacer,
			currentThresholdSection,
			spacer,
			selectRow,
			spacer,
			buttonRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function showWatchChannelsConfig(
	inter: Discord.StringSelectMenuInteraction
) {
	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Use V2 channel select instead of regular Discord.js
	const channelSelect = V2.makeChannelSelect({
		custom_id: 'starboard_watch_channels_select',
		placeholder: 'Select channels to monitor (leave empty for all)',
		channel_types: [Discord.ChannelType.GuildText],
		min_values: 0,
		max_values: 25,
	})

	const selectRow = V2.makeActionRow([channelSelect])

	// Create title section with current watched channels info
	const currentChannels = starboardConfig?.watch_channels?.length
		? starboardConfig.watch_channels.map((c) => `<#${c}>`).join(', ')
		: 'All channels (no specific channels set)'

	const titleSection = V2.makeTextDisplay(
		`# Configure Watched Channels\n\nSelect specific channels to monitor for starboard reactions.\nIf no channels are selected, all channels will be monitored.\n\n**Current Setting:** ${currentChannels}`
	)

	const buttons = [
		V2.makeButton({
			custom_id: 'clear_watch_channels',
			label: 'Clear All (Monitor All Channels)',
			style: Discord.ButtonStyle.Secondary,
		}),
		V2.makeButton({
			custom_id: 'starboard_config_back',
			label: '← Back to Settings',
			style: Discord.ButtonStyle.Secondary,
		}),
	]
	const buttonRow = V2.makeActionRow(buttons)

	await inter.editReply({
		components: [titleSection, selectRow, buttonRow],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

// Helper function to update the main config message from any interaction
async function updateMainConfigMessageGeneric(inter: {
	editReply: (
		options?: Discord.InteractionEditReplyOptions
	) => Promise<Discord.Message>
	client: Discord.Client
	guildId: string
}) {
	const starboardConfig = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId,
		'starboard'
	)

	// Create title section with system status
	const titleSection = V2.makeSection(
		[
			'# ⭐ Starboard Configuration\n\n',
			`System Status: ${starboardConfig?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/starboard.png'
		)
	)

	// Create sections for configuration
	const channelSection = V2.makeTextDisplay(
		[
			'## 📋 Channel Configuration\n',
			`Starboard Channel: ${starboardConfig?.channel_id ? `<#${starboardConfig.channel_id}>` : '❌ Not Set'}\n`,
			`Watched Channels: ${
				starboardConfig?.watch_channels?.length
					? starboardConfig.watch_channels.map((c) => `<#${c}>`).join(' ')
					: '🌐 All Channels'
			}`,
		].join('')
	)

	const settingsSection = V2.makeTextDisplay(
		[
			'## ⚙️ Starboard Settings\n',
			`Emoji: ${starboardConfig?.emoji || '⭐'}\n`,
			`Threshold: ${starboardConfig?.threshold || 1} ${(starboardConfig?.threshold || 1) === 1 ? 'reaction' : 'reactions'}`,
		].join('')
	)

	// Create status buttons
	const statusButtons = [
		V2.makeButton({
			custom_id: 'starboard_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: starboardConfig?.enabled,
		}),
		V2.makeButton({
			custom_id: 'starboard_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !starboardConfig?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	// Create configuration menu
	const configMenu = V2.makeStringSelect('starboard_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Starboard Channel',
				value: 'starboard_channel',
				description: 'Set the starboard display channel',
				emoji: '📋',
			},
			{
				label: 'Emoji',
				value: 'emoji',
				description: 'Set the reaction emoji to watch',
				emoji: '⭐',
			},
			{
				label: 'Threshold',
				value: 'threshold',
				description: 'Set minimum reactions needed',
				emoji: '🎯',
			},
			{
				label: 'Watched Channels',
				value: 'watch_channels',
				description: 'Set specific channels to monitor',
				emoji: '👀',
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
			settingsSection,
			spacer,
			menuRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}
