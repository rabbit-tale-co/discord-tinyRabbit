import * as Discord from 'discord.js'
import * as V2 from 'discord-components-v2'
import * as api from '@/discord/api/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as utils from '@/utils/index.js'

export async function config(
	inter:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ButtonInteraction
		| Discord.ModalSubmitInteraction
) {
	if (!inter.inGuild() || !inter.guildId) {
		await utils.handleResponse(
			inter,
			'error',
			'This command can only be used in a server',
			{ code: 'MODCFG001' }
		)
		return
	}

	try {
		if (
			inter.isChatInputCommand()
		) {
			await showMainConfig(inter)
			return
		}

		if (inter.isStringSelectMenu()) {
			await handleStringSelect(inter)
			return
		}

		if (inter.isRoleSelectMenu()) {
			await handleRoleSelect(inter)
			return
		}

		if (inter.isButton()) {
			await handleButton(inter)
			return
		}

		if (inter.isModalSubmit()) {
			await handleModal(inter)
			return
		}
	} catch (error) {
		StatusLogger.error('[Moderation Config] Unhandled error', error as Error)
		try {
			if (!inter.replied && !inter.deferred) {
				await utils.handleResponse(
					inter,
					'error',
					'An unexpected error occurred while processing moderation configuration.',
					{ code: 'MODCFG999' }
				)
			}
		} catch {}
	}
}

async function showMainConfig(
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
			'You do not have permission to manage moderation configuration',
			{ code: 'MODCFG002' }
		)
		return
	}

	const cfg = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId!,
		'moderation'
	)

	const title = V2.makeSection(
		[
			'# 🛡️ Moderation Configuration\n\n',
			`System Status: ${cfg?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/moderation.png'
		)
	)

	const settings = V2.makeTextDisplay(
		[
			'## ⚙️ Settings\n',
			`Watched Roles: ${cfg?.watch_roles?.length ? cfg.watch_roles.map((r) => `<@&${r}>`).join(', ') : '❌ None'}\n`,
			`Ban Interval: ${cfg?.ban_interval ?? 0} min\n`,
			`Delete Message Days: ${cfg?.delete_message_days ?? 0} day(s)`,
		].join('')
	)

	const statusButtons = [
		V2.makeButton({
			custom_id: 'moderation_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: !!cfg?.enabled,
		}),
		V2.makeButton({
			custom_id: 'moderation_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !cfg?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	const menu = V2.makeStringSelect('moderation_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Watched Roles',
				value: 'watch_roles',
				description: 'Roles to watch for auto-ban',
				emoji: '👀',
			},
			{
				label: 'Ban Interval (minutes)',
				value: 'ban_interval',
				description: 'How often to scan and ban',
				emoji: '⏱️',
			},
			{
				label: 'Delete Message Days',
				value: 'delete_message_days',
				description: 'Days of messages to delete on ban',
				emoji: '🧹',
			},
		])

	await inter.editReply({
		components: [
			title,
			statusRow,
			spacer,
			settings,
			spacer,
			V2.makeActionRow([menu]),
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function handleStringSelect(inter: Discord.StringSelectMenuInteraction) {
	if (!inter.replied && !inter.deferred) await inter.deferUpdate()

	const selected = inter.values[0]
	switch (selected) {
		case 'watch_roles':
			return showWatchRoles(inter)
		case 'ban_interval':
			return showBanInterval(inter)
		case 'delete_message_days':
			return showDeleteDays(inter)
		default:
			StatusLogger.warn(
				`[Moderation Config] Unknown select option: ${selected}`
			)
	}
}

async function handleRoleSelect(inter: Discord.RoleSelectMenuInteraction) {
	if (!inter.replied && !inter.deferred) await inter.deferUpdate()

	const cfg = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId!,
		'moderation'
	)

	if (inter.customId === 'moderation_watch_roles_select') {
		const roles = inter.values ?? []
		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId!,
			'moderation',
			{
				...cfg,
				watch_roles: roles,
			}
		)

		await inter.followUp({
			content: roles.length
				? `✅ Watched roles set to: ${roles.map((r) => `<@&${r}>`).join(', ')}`
				: '✅ Watch roles cleared',
			flags: Discord.MessageFlags.Ephemeral,
		})

		await showMainConfigFromAny(inter)
	}
}

async function handleButton(inter: Discord.ButtonInteraction) {
	// Don't defer for modal buttons
	const isModalButton = inter.customId.includes('_custom')

	if (!isModalButton && !inter.replied && !inter.deferred) {
		await inter.deferUpdate()
	}

	const cfg = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId!,
		'moderation'
	)

	switch (inter.customId) {
		case 'moderation_system_enable':
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId!,
				'moderation',
				{
					...cfg,
					enabled: true,
				}
			)
			await inter.reply({
				content: '✅ Moderation enabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return showMainConfigFromAny(inter)
		case 'moderation_system_disable':
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId!,
				'moderation',
				{
					...cfg,
					enabled: false,
				}
			)
			await inter.reply({
				content: '✅ Moderation disabled',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return showMainConfigFromAny(inter)
		case 'moderation_clear_watch_roles':
			await api.setPluginConfig(
				inter.client.user.id,
				inter.guildId!,
				'moderation',
				{
					...cfg,
					watch_roles: [],
				}
			)
			await inter.reply({
				content: '✅ Watch roles cleared',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return showMainConfigFromAny(inter)
		case 'moderation_ban_interval_custom': {
			const modal = new Discord.ModalBuilder()
				.setCustomId('moderation_ban_interval_modal')
				.setTitle('Custom Ban Interval (minutes)')

			const row =
				new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
					new Discord.TextInputBuilder()
						.setCustomId('ban_interval')
						.setLabel('Minutes (>= 1)')
						.setStyle(Discord.TextInputStyle.Short)
						.setRequired(true)
						.setValue(String(cfg?.ban_interval ?? 5))
				)

			modal.addComponents(row)
			await inter.showModal(modal)
			return
		}
		case 'moderation_delete_days_custom': {
			const modal = new Discord.ModalBuilder()
				.setCustomId('moderation_delete_days_modal')
				.setTitle('Custom Delete Message Days')

			const row =
				new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
					new Discord.TextInputBuilder()
						.setCustomId('delete_days')
						.setLabel('Days (0-7)')
						.setStyle(Discord.TextInputStyle.Short)
						.setRequired(true)
						.setValue(String(cfg?.delete_message_days ?? 0))
				)

			modal.addComponents(row)
			await inter.showModal(modal)
			return
		}
		case 'moderation_config_back':
			return showMainConfigFromAny(inter)
		default:
			if (inter.customId === 'moderation_config_back')
				return showMainConfigFromAny(inter)
	}
}

async function handleModal(inter: Discord.ModalSubmitInteraction) {
	if (!inter.replied && !inter.deferred) await inter.deferUpdate()

	const cfg = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId!,
		'moderation'
	)

	if (inter.customId === 'moderation_ban_interval_modal') {
		const value = Number.parseInt(
			inter.fields.getTextInputValue('ban_interval')
		)
		if (!Number.isFinite(value) || value < 1) {
			await inter.followUp({
				content: '❌ Ban interval must be >= 1 minute',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return
		}
		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId!,
			'moderation',
			{
				...cfg,
				ban_interval: value,
			}
		)
		await inter.followUp({
			content: `✅ Ban interval set to ${value} minute(s)`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		return showMainConfigFromAny(inter)
	}

	if (inter.customId === 'moderation_delete_days_modal') {
		const value = Number.parseInt(inter.fields.getTextInputValue('delete_days'))
		if (!Number.isFinite(value) || value < 0 || value > 7) {
			await inter.followUp({
				content: '❌ Delete message days must be between 0 and 7',
				flags: Discord.MessageFlags.Ephemeral,
			})
			return
		}
		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId!,
			'moderation',
			{
				...cfg,
				delete_message_days: value,
			}
		)
		await inter.followUp({
			content: `✅ Delete message days set to ${value}`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		return showMainConfigFromAny(inter)
	}
}

async function showWatchRoles(inter: Discord.StringSelectMenuInteraction) {
	// Load current config to preselect watched roles
	const cfg = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId!,
		'moderation'
	)

	const select = V2.makeRoleSelect({
		custom_id: 'moderation_watch_roles_select',
		placeholder: 'Select roles to watch',
		min_values: 0,
		max_values: 25,
	})

	// Preselect currently configured watched roles
	if (cfg?.watch_roles && Array.isArray(cfg.watch_roles) && cfg.watch_roles.length > 0) {
		select.setDefaultRoles(cfg.watch_roles)
	}

	const row = V2.makeActionRow([select])
	const back = V2.makeButton({
		custom_id: 'moderation_config_back',
		label: '← Back to Settings',
		style: Discord.ButtonStyle.Secondary,
	})
	const clear = V2.makeButton({
		custom_id: 'moderation_clear_watch_roles',
		label: 'Clear Roles',
		style: Discord.ButtonStyle.Secondary,
	})
	const buttons = V2.makeActionRow([clear, back])

	const title = V2.makeTextDisplay(
		'# Configure Watched Roles\n\nSelect roles whose members will be scanned at interval and banned safely.'
	)

	await inter.editReply({
		components: [title, row, buttons],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function showBanInterval(inter: Discord.StringSelectMenuInteraction) {
	const select = V2.makeStringSelect('moderation_ban_interval_select')
		.setPlaceholder('Select scan interval (minutes)')
		.addOptions([
			{ label: '1 minute', value: '1', emoji: '1️⃣' },
			{ label: '2 minutes', value: '2', emoji: '2️⃣' },
			{ label: '5 minutes', value: '5', emoji: '5️⃣' },
			{ label: '10 minutes', value: '10', emoji: '🔟' },
			{ label: '15 minutes', value: '15', emoji: '🕒' },
			{ label: '30 minutes', value: '30', emoji: '🕞' },
			{ label: '60 minutes', value: '60', emoji: '🕕' },
		])

	const row = V2.makeActionRow([select])
	const custom = V2.makeButton({
		custom_id: 'moderation_ban_interval_custom',
		label: 'Custom minutes',
		style: Discord.ButtonStyle.Primary,
	})
	const back = V2.makeButton({
		custom_id: 'moderation_config_back',
		label: '← Back to Settings',
		style: Discord.ButtonStyle.Secondary,
	})
	const buttons = V2.makeActionRow([custom, back])

	const title = V2.makeTextDisplay(
		'# Configure Ban Interval\n\nChoose how often the auto-moderation scan runs.'
	)

	await inter.editReply({
		components: [title, row, buttons],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function showDeleteDays(inter: Discord.StringSelectMenuInteraction) {
	const select = V2.makeStringSelect('moderation_delete_days_select')
		.setPlaceholder('Select days of messages to delete on ban')
		.addOptions([
			{ label: '0 days', value: '0', emoji: '0️⃣' },
			{ label: '1 day', value: '1', emoji: '1️⃣' },
			{ label: '2 days', value: '2', emoji: '2️⃣' },
			{ label: '3 days', value: '3', emoji: '3️⃣' },
			{ label: '4 days', value: '4', emoji: '4️⃣' },
			{ label: '5 days', value: '5', emoji: '5️⃣' },
			{ label: '6 days', value: '6', emoji: '6️⃣' },
			{ label: '7 days', value: '7', emoji: '7️⃣' },
		])

	const row = V2.makeActionRow([select])
	const custom = V2.makeButton({
		custom_id: 'moderation_delete_days_custom',
		label: 'Custom days',
		style: Discord.ButtonStyle.Primary,
	})
	const back = V2.makeButton({
		custom_id: 'moderation_config_back',
		label: '← Back to Settings',
		style: Discord.ButtonStyle.Secondary,
	})
	const buttons = V2.makeActionRow([custom, back])

	const title = V2.makeTextDisplay(
		'# Configure Delete Message Days\n\nChoose how many days of messages to delete upon ban (Discord max 7).'
	)

	await inter.editReply({
		components: [title, row, buttons],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

async function showMainConfigFromAny(inter:
	| Discord.ButtonInteraction
	| Discord.ChannelSelectMenuInteraction
	| Discord.RoleSelectMenuInteraction
	| Discord.ModalSubmitInteraction
	| Discord.StringSelectMenuInteraction
) {
	const cfg = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId!,
		'moderation'
	)

	const title = V2.makeSection(
		[
			'# 🛡️ Moderation Configuration\n\n',
			`System Status: ${cfg?.enabled ? '✅ Enabled' : '❌ Disabled'}`,
		],
		new Discord.ThumbnailBuilder().setURL(
			'https://cdn.discordapp.com/attachments/1234567890/1234567890/moderation.png'
		)
	)

	const settings = V2.makeTextDisplay(
		[
			'## ⚙️ Settings\n',
			`Watched Roles: ${cfg?.watch_roles?.length ? cfg.watch_roles.map((r) => `<@&${r}>`).join(', ') : '❌ None'}\n`,
			`Ban Interval: ${cfg?.ban_interval ?? 0} min\n`,
			`Delete Message Days: ${cfg?.delete_message_days ?? 0} day(s)`,
		].join('')
	)

	const statusButtons = [
		V2.makeButton({
			custom_id: 'moderation_system_enable',
			label: 'Enable',
			style: Discord.ButtonStyle.Success,
			disabled: !!cfg?.enabled,
		}),
		V2.makeButton({
			custom_id: 'moderation_system_disable',
			label: 'Disable',
			style: Discord.ButtonStyle.Danger,
			disabled: !cfg?.enabled,
		}),
	]
	const statusRow = V2.makeActionRow(statusButtons)

	const spacer = V2.makeSeparator({
		divider: false,
		spacing: Discord.SeparatorSpacingSize.Large,
	})

	const menu = V2.makeStringSelect('moderation_config_select')
		.setPlaceholder('🔧 Select setting to configure...')
		.addOptions([
			{
				label: 'Watched Roles',
				value: 'watch_roles',
				description: 'Roles to watch for auto-ban',
				emoji: '👀',
			},
			{
				label: 'Ban Interval (minutes)',
				value: 'ban_interval',
				description: 'How often to scan and ban',
				emoji: '⏱️',
			},
			{
				label: 'Delete Message Days',
				value: 'delete_message_days',
				description: 'Days of messages to delete on ban',
				emoji: '🧹',
			},
		])

	await inter.editReply({
		components: [
			title,
			statusRow,
			spacer,
			settings,
			spacer,
			V2.makeActionRow([menu]),
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}

// Additional select handlers for value updates
export async function handleConfigSelect(
	inter: Discord.StringSelectMenuInteraction
) {
	if (!inter.replied && !inter.deferred) await inter.deferUpdate()

	const cfg = await api.getPluginConfig(
		inter.client.user.id,
		inter.guildId!,
		'moderation'
	)

	if (inter.customId === 'moderation_ban_interval_select') {
		const minutes = Number.parseInt(inter.values[0])
		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId!,
			'moderation',
			{
				...cfg,
				ban_interval: minutes,
			}
		)
		await inter.followUp({
			content: `✅ Ban interval set to ${minutes} minute(s)`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		return showMainConfigFromAny(inter)
	}

	if (inter.customId === 'moderation_delete_days_select') {
		const days = Number.parseInt(inter.values[0])
		await api.setPluginConfig(
			inter.client.user.id,
			inter.guildId!,
			'moderation',
			{
				...cfg,
				delete_message_days: days,
			}
		)
		await inter.followUp({
			content: `✅ Delete message days set to ${days}`,
			flags: Discord.MessageFlags.Ephemeral,
		})
		return showMainConfigFromAny(inter)
	}
}
