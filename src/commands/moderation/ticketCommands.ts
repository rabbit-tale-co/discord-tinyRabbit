import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import * as utils from '@/utils/index.js'
import { bunnyLog } from 'bunny-log'
import * as ticketUtils from './tickets.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'
import type { APIThreadMetadata } from 'discord.js'
import type { ThreadMetadata } from '@/types/tickets.js'

// Import types from tickets.ts
type ExtendedThreadMetadata = {
	thread_id?: string
	status?: string
	close_reason?: string
	guild_id?: string
	ticket_id?: string | number
	opened_by?: {
		id: string
		username: string
		displayName: string
		avatar: string
	}
	claimed_by?:
		| {
				id: string
				username: string
				displayName: string
				avatar: string
		  }
		| string
	claimed_time?: Date
	open_time?: number
	close_time?: Date
	ticket_type?: string
	reason?: string
	closed_by?: {
		id: string
		username: string
		displayName: string
		avatar: string
	}
	join_ticket_message_id?: string
	admin_channel_id?: string
	rating?: {
		value: number
		submitted_at?: string
		review_message_id?: string
		user_id?: string
		timestamp?: number
	}
	transcript_message_id?: string
	transcript_channel_id?: string
}

// Create a reference to the thread metadata store from tickets.ts
// This is a workaround since we can't directly access the variable from the module
const thread_metadata_store = new Map<string, ExtendedThreadMetadata>()

// Store configuration messages for reuse
const config_message_store = new Map<string, Discord.Message>()
const config_channel_message_map = new Map<
	string,
	{ channelId: string; messageId: string }
>()

// Store original configuration message and interaction for each guild
const original_config_interactions = new Map<
	string,
	Discord.ChatInputCommandInteraction | Discord.StringSelectMenuInteraction
>()
const original_config_messages = new Map<string, Discord.Message>()

// Define ticket data interface
interface TicketData {
	thread_id: string
	ticket_id?: string | number
	open_time?: number
	opened_by?: {
		id: string
		username?: string
		discriminator?: string
		avatar?: string
	}
	claimed_by?:
		| string
		| {
				id: string
				username?: string
				discriminator?: string
				avatar?: string
		  }
	guild_id: string
	metadata?: APIThreadMetadata
	status?: 'open' | 'closed' | 'locked'
}

// Stałe dla identyfikatorów customId
const ROLE_TIME_LIMIT_ADD_BUTTON_ID = 'add_role_time_limit_component'
const ROLE_TIME_LIMIT_REMOVE_BUTTON_ID = 'remove_role_time_limit'
const ROLE_TIME_LIMIT_REMOVE_SELECT_ID = 'remove_role_time_limit_select'

/**
 * Displays and updates ticket system configuration
 * @param interaction - The interaction to handle
 */
async function config(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	// Defer reply to give us time to process
	await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		// Check permissions
		if (
			!interaction.memberPermissions?.has(
				Discord.PermissionFlagsBits.ManageGuild
			)
		) {
			await utils.handleResponse(
				interaction,
				'error',
				'You need the `Manage Server` permission to configure tickets.',
				{ code: 'TC001' }
			)
			return
		}

		// Get current config
		const ticketConfig = (await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)) as PluginResponse<DefaultConfigs['tickets']>

		// Create main configuration select menu
		const configOptions = [
			{
				label: 'Admin Channel',
				description: 'Set the channel for admin notifications',
				value: 'admin_channel',
			},
			{
				label: 'Transcript Channel',
				description: 'Set the channel for ticket transcripts',
				value: 'transcript_channel',
			},
			{
				label: 'Moderator Roles',
				description: 'Set roles that can manage tickets',
				value: 'mod_roles',
			},
			{
				label: 'Auto-close Settings',
				description: 'Configure auto-closing inactive tickets',
				value: 'auto_close',
			},
			{
				label: 'Role Time Limits',
				description: 'Set time limits between tickets for specific roles',
				value: 'role_time_limits',
			},
		]

		const selectMenu = new Discord.StringSelectMenuBuilder()
			.setCustomId('ticket_config_select')
			.setPlaceholder('Select a configuration option')
			.addOptions(configOptions)

		const row =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				selectMenu
			)

		// Get current values for display
		const adminChannel = ticketConfig.admin_channel_id
			? `<#${ticketConfig.admin_channel_id}>`
			: 'Not set'
		const transcriptChannel = ticketConfig.transcript_channel_id
			? `<#${ticketConfig.transcript_channel_id}>`
			: 'Not set'
		const modRoles = ticketConfig.mods_role_ids?.length
			? ticketConfig.mods_role_ids.map((id) => `<@&${id}>`).join(', ')
			: 'None'
		const autoCloseEnabled = ticketConfig.auto_close?.[0]?.enabled
			? '✅ Enabled'
			: '❌ Disabled'
		const autoCloseThreshold = ticketConfig.auto_close?.[0]?.threshold
			? ticketUtils.formatTimeThreshold(ticketConfig.auto_close[0].threshold)
			: 'Not set'

		// Format role time limits for display
		const roleTimeLimits = ticketConfig.role_time_limits?.length
			? `${ticketConfig.role_time_limits.length} roles configured`
			: 'None'

		const configSummary = [
			'# 🎫 Ticket System Configuration',
			'',
			'## Current Settings',
			`**Status:** ${ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
			`**Admin Channel:** ${adminChannel}`,
			`**Transcript Channel:** ${transcriptChannel}`,
			`**Moderator Roles:** ${modRoles}`,
			`**Auto-close:** ${autoCloseEnabled} (${autoCloseThreshold})`,
			`**Role Time Limits:** ${roleTimeLimits}`,
			'',
			'## Select an option below to configure:',
		].join('\n')

		// Send the config panel
		await interaction.editReply({
			content: configSummary,
			components: [row],
		})
	} catch (error) {
		bunnyLog.error('Error displaying ticket config:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'Failed to load ticket configuration.',
			{ code: 'TC002' }
		)
	}
}

/**
 * Handles the selected configuration option
 * @param interaction - The select menu interaction
 */
async function handleConfigSelectMenu(
	interaction: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		const selectedOption = interaction.values[0]
		const ticketConfig = (await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)) as PluginResponse<DefaultConfigs['tickets']>

		// For auto-close settings, use regular components instead of modal
		if (selectedOption === 'auto_close') {
			// Defer update for regular components
			await interaction.deferUpdate().catch((err) => {
				bunnyLog.error(`Failed to defer update for auto-close: ${err.message}`)
				// We'll try to continue anyway
			})

			// Get current auto-close settings
			const autoClose = ticketConfig.auto_close?.[0] || {
				enabled: false,
				threshold: 72 * 60 * 60 * 1000, // 72 hours default
				reason: 'Ticket automatically closed due to inactivity.',
			}

			// Create toggle buttons for enabled/disabled with Set Reason in the same row
			const toggleRow =
				new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					new Discord.ButtonBuilder()
						.setCustomId('autoclose_enable')
						.setLabel('Enable')
						.setStyle(
							autoClose.enabled
								? Discord.ButtonStyle.Success
								: Discord.ButtonStyle.Secondary
						)
						.setDisabled(autoClose.enabled), // Disable the Enable button if already enabled
					new Discord.ButtonBuilder()
						.setCustomId('autoclose_disable')
						.setLabel('Disable')
						.setStyle(
							!autoClose.enabled
								? Discord.ButtonStyle.Danger
								: Discord.ButtonStyle.Secondary
						)
						.setDisabled(!autoClose.enabled), // Disable the Disable button if already disabled
					new Discord.ButtonBuilder()
						.setCustomId('autoclose_set_reason')
						.setLabel('Set Reason')
						.setStyle(Discord.ButtonStyle.Primary)
				)

			// Format the current threshold for display
			const formattedThreshold = ticketUtils.formatTimeThreshold(
				autoClose.threshold
			)

			// Create time unit selection menu for threshold - showing directly in the main panel
			const timeUnitOptions = [
				{ label: 'Seconds', value: 'seconds' },
				{ label: 'Minutes', value: 'minutes' },
				{ label: 'Hours', value: 'hours' },
				{ label: 'Days', value: 'days' },
				{ label: 'Weeks', value: 'weeks' },
				{ label: 'Predefined Values', value: 'predefined' },
			]

			const timeUnitSelectRow =
				new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
					new Discord.StringSelectMenuBuilder()
						.setCustomId('autoclose_time_unit_select')
						.setPlaceholder('Select time unit for threshold')
						.addOptions(timeUnitOptions)
				)

			// Add back button
			const backRow =
				new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					new Discord.ButtonBuilder()
						.setCustomId('ticket_config_back')
						.setLabel('Back to Main Menu')
						.setStyle(Discord.ButtonStyle.Secondary)
				)

			// Update the message with auto-close configuration panel
			await interaction
				.editReply({
					content: [
						'# Auto-close Settings',
						'',
						'Configure when inactive tickets should be automatically closed.',
						'',
						'## Current Settings',
						`**Status:** ${autoClose.enabled ? '✅ Enabled' : '❌ Disabled'}`,
						`**Threshold:** ${formattedThreshold}`,
						`**Close Reason:** ${autoClose.reason}`,
						'',
						'Use the controls below to update these settings:',
					].join('\n'),
					components: [toggleRow, timeUnitSelectRow, backRow],
				})
				.catch((err) => {
					bunnyLog.error(
						`Failed to update with auto-close settings: ${err.message}`
					)
					throw err
				})

			return
		}

		// For all other options, use deferUpdate first
		await interaction.deferUpdate().catch((err) => {
			bunnyLog.error(`Failed to defer update: ${err.message}`)
			// If deferred fails, we'll try to continue anyway
			// and let the error handling below catch any further issues
		})

		// Role time limits option
		if (selectedOption === 'role_time_limits') {
			await handleRoleTimeLimitsConfig(interaction, ticketConfig)
			return
		}

		// Handle other options
		switch (selectedOption) {
			case 'admin_channel': {
				// Create channel select for admin channel
				const adminRow =
					new Discord.ActionRowBuilder<Discord.ChannelSelectMenuBuilder>().addComponents(
						new Discord.ChannelSelectMenuBuilder()
							.setCustomId('ticket_admin_channel')
							.setPlaceholder('Select admin notification channel')
							.setChannelTypes([Discord.ChannelType.GuildText])
					)

				// Add back button
				const backRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						new Discord.ButtonBuilder()
							.setCustomId('ticket_config_back')
							.setLabel('Back to Main Menu')
							.setStyle(Discord.ButtonStyle.Secondary)
					)

				await interaction
					.editReply({
						content:
							'## Select Admin Channel\nChoose a channel where ticket notifications will be sent to moderators.',
						components: [adminRow, backRow],
					})
					.catch((err) =>
						bunnyLog.error(`Failed to edit reply: ${err.message}`)
					)
				break
			}

			case 'transcript_channel': {
				// Create channel select for transcript channel
				const transcriptRow =
					new Discord.ActionRowBuilder<Discord.ChannelSelectMenuBuilder>().addComponents(
						new Discord.ChannelSelectMenuBuilder()
							.setCustomId('ticket_transcript_channel')
							.setPlaceholder('Select transcript archive channel')
							.setChannelTypes([Discord.ChannelType.GuildText])
					)

				// Add back button
				const backRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						new Discord.ButtonBuilder()
							.setCustomId('ticket_config_back')
							.setLabel('Back to Main Menu')
							.setStyle(Discord.ButtonStyle.Secondary)
					)

				await interaction
					.editReply({
						content:
							'## Select Transcript Channel\nChoose a channel where closed ticket transcripts will be archived.',
						components: [transcriptRow, backRow],
					})
					.catch((err) =>
						bunnyLog.error(`Failed to edit reply: ${err.message}`)
					)
				break
			}

			case 'mod_roles': {
				// Create role select for moderator roles
				const rolesRow =
					new Discord.ActionRowBuilder<Discord.RoleSelectMenuBuilder>().addComponents(
						new Discord.RoleSelectMenuBuilder()
							.setCustomId('ticket_mod_roles')
							.setPlaceholder('Select moderator roles')
							.setMinValues(0)
							.setMaxValues(10)
					)

				// Add back button
				const backRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						new Discord.ButtonBuilder()
							.setCustomId('ticket_config_back')
							.setLabel('Back to Main Menu')
							.setStyle(Discord.ButtonStyle.Secondary)
					)

				await interaction
					.editReply({
						content:
							'## Select Moderator Roles\nChoose roles that can manage tickets (claim, close, etc.).',
						components: [rolesRow, backRow],
					})
					.catch((err) =>
						bunnyLog.error(`Failed to edit reply: ${err.message}`)
					)
				break
			}

			default:
				await interaction
					.followUp({
						content: 'Invalid option selected.',
						ephemeral: true,
					})
					.catch((err) =>
						bunnyLog.error(`Failed to send followUp: ${err.message}`)
					)
		}
	} catch (error) {
		bunnyLog.error(
			`Error handling ticket config selection: ${error.message || error}`,
			error
		)

		// Only try to respond if we haven't already
		try {
			if (!interaction.replied && !interaction.deferred) {
				await interaction.deferUpdate().catch(() => {}) // Ignore any errors

				await interaction
					.followUp({
						content:
							'An error occurred while processing your selection. Please try again.',
						ephemeral: true,
					})
					.catch(() => {}) // Ignore any errors
			} else if (!interaction.replied) {
				// If deferred but not replied
				await interaction
					.followUp({
						content:
							'An error occurred while processing your selection. Please try again.',
						ephemeral: true,
					})
					.catch(() => {}) // Ignore any errors
			}
		} catch (e) {
			bunnyLog.error(`Failed to send error response: ${e.message || e}`)
		}
	}
}

/**
 * Resetuje główny panel konfiguracyjny, odświeżając selektor i aktualne ustawienia
 */
async function resetConfigPanel(
	interaction: Discord.StringSelectMenuInteraction,
	ticketConfig: PluginResponse<DefaultConfigs['tickets']>
): Promise<void> {
	try {
		// Create main configuration select menu
		const configOptions = [
			{
				label: 'Admin Channel',
				description: 'Set the channel for admin notifications',
				value: 'admin_channel',
			},
			{
				label: 'Transcript Channel',
				description: 'Set the channel for ticket transcripts',
				value: 'transcript_channel',
			},
			{
				label: 'Moderator Roles',
				description: 'Set roles that can manage tickets',
				value: 'mod_roles',
			},
			{
				label: 'Auto-close Settings',
				description: 'Configure auto-closing inactive tickets',
				value: 'auto_close',
			},
			{
				label: 'Role Time Limits',
				description: 'Set time limits between tickets for specific roles',
				value: 'role_time_limits',
			},
		]

		const selectMenu = new Discord.StringSelectMenuBuilder()
			.setCustomId('ticket_config_select')
			.setPlaceholder('Select a configuration option')
			.addOptions(configOptions)

		const row =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				selectMenu
			)

		// Get current values for display
		const adminChannel = ticketConfig.admin_channel_id
			? `<#${ticketConfig.admin_channel_id}>`
			: 'Not set'
		const transcriptChannel = ticketConfig.transcript_channel_id
			? `<#${ticketConfig.transcript_channel_id}>`
			: 'Not set'
		const modRoles = ticketConfig.mods_role_ids?.length
			? ticketConfig.mods_role_ids.map((id) => `<@&${id}>`).join(', ')
			: 'None'
		const autoCloseEnabled = ticketConfig.auto_close?.[0]?.enabled
			? '✅ Enabled'
			: '❌ Disabled'
		const autoCloseThreshold = ticketConfig.auto_close?.[0]?.threshold
			? ticketUtils.formatTimeThreshold(ticketConfig.auto_close[0].threshold)
			: 'Not set'

		// Format role time limits for display
		const roleTimeLimits = ticketConfig.role_time_limits?.length
			? `${ticketConfig.role_time_limits.length} roles configured`
			: 'None'

		const configSummary = [
			'# 🎫 Ticket System Configuration',
			'',
			'## Current Settings',
			`**Status:** ${ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
			`**Admin Channel:** ${adminChannel}`,
			`**Transcript Channel:** ${transcriptChannel}`,
			`**Moderator Roles:** ${modRoles}`,
			`**Auto-close:** ${autoCloseEnabled} (${autoCloseThreshold})`,
			`**Role Time Limits:** ${roleTimeLimits}`,
			'',
			'## Select an option below to configure:',
		].join('\n')

		// Update the main config panel
		await interaction.update({
			content: configSummary,
			components: [row],
		})
	} catch (error) {
		bunnyLog.error('Error resetting config panel:', error)
	}
}

/**
 * Lists all active tickets
 * @param interaction - The interaction to handle
 */
async function list(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		// Check permissions
		if (
			!interaction.memberPermissions?.has(
				Discord.PermissionFlagsBits.ManageThreads
			)
		) {
			await utils.handleResponse(
				interaction,
				'error',
				'You need the `Manage Threads` permission to view ticket list.',
				{ code: 'TL001' }
			)
			return
		}

		// Get active tickets for this guild from the database
		const activeTicketsResponse = await api.getAllActiveTickets(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id']
		)

		// Cast to TicketData[] with type safety
		const activeTickets = (Array.isArray(activeTicketsResponse)
			? activeTicketsResponse
			: []) as unknown as TicketData[]

		if (!activeTickets || activeTickets.length === 0) {
			await utils.handleResponse(
				interaction,
				'info',
				'No active tickets found in this server.',
				{ code: 'TL002' }
			)
			return
		}

		// Sort tickets by opening time (newest first)
		activeTickets.sort((a, b) => (b.open_time || 0) - (a.open_time || 0))

		// Format ticket list
		const ticketList = activeTickets.map((ticket, index) => {
			const openTime = ticket.open_time
				? `<t:${Math.floor(ticket.open_time)}:R>`
				: 'Unknown'

			const openedBy = ticket.opened_by?.id
				? `<@${ticket.opened_by.id}>`
				: 'Unknown'

			const claimedBy =
				typeof ticket.claimed_by === 'object' && ticket.claimed_by?.id
					? `<@${ticket.claimed_by.id}>`
					: ticket.claimed_by || 'Not claimed'

			const channel = ticket.thread_id ? `<#${ticket.thread_id}>` : 'Unknown'

			return `**${index + 1}.** Ticket #${ticket.ticket_id || 'Unknown'}\n> **Channel:** ${channel}\n> **Opened by:** ${openedBy}\n> **Claimed by:** ${claimedBy}\n> **Opened:** ${openTime}\n`
		})

		// Send paginated list if needed
		if (ticketList.length <= 10) {
			await interaction.editReply({
				content: `# 🎫 Active Tickets (${ticketList.length})\n\n${ticketList.join('\n')}`,
			})
		} else {
			// Create a simple pagination system for larger lists
			const pages = []
			for (let i = 0; i < ticketList.length; i += 10) {
				pages.push(ticketList.slice(i, i + 10).join('\n'))
			}

			let currentPage = 0
			const row =
				new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					new Discord.ButtonBuilder()
						.setCustomId('prev_page')
						.setLabel('◀️ Previous')
						.setStyle(Discord.ButtonStyle.Secondary)
						.setDisabled(true),
					new Discord.ButtonBuilder()
						.setCustomId('next_page')
						.setLabel('Next ▶️')
						.setStyle(Discord.ButtonStyle.Secondary)
						.setDisabled(pages.length <= 1)
				)

			const initialMessage = await interaction.editReply({
				content: `# 🎫 Active Tickets (${ticketList.length})\nPage ${currentPage + 1}/${pages.length}\n\n${pages[currentPage]}`,
				components: [row],
			})

			// Create collector for pagination buttons
			const collector = initialMessage.createMessageComponentCollector({
				filter: (i) => i.user.id === interaction.user.id,
				time: 300000, // 5 minutes
			})

			collector.on('collect', async (i) => {
				if (i.customId === 'prev_page') {
					currentPage--
				} else if (i.customId === 'next_page') {
					currentPage++
				}

				// Update buttons
				row.components[0].setDisabled(currentPage === 0)
				row.components[1].setDisabled(currentPage === pages.length - 1)

				await i.update({
					content: `# 🎫 Active Tickets (${ticketList.length})\nPage ${currentPage + 1}/${pages.length}\n\n${pages[currentPage]}`,
					components: [row],
				})
			})

			collector.on('end', async () => {
				// Disable all buttons when collector expires
				for (const button of row.components) {
					button.setDisabled(true)
				}
				await initialMessage.edit({ components: [row] }).catch(() => {})
			})
		}
	} catch (error) {
		bunnyLog.error('Error listing tickets:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'Failed to load ticket list.',
			{ code: 'TL003' }
		)
	}
}

/**
 * Sends a ticket panel to a specified channel
 * @param interaction - The interaction to handle
 */
async function sendPanel(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	await ticketUtils.createTicketPanel(interaction)
}

/**
 * Manages ticket operations (close, claim, join, add, remove users)
 * @param interaction - The interaction to handle
 */
async function manage(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	try {
		// Get the action
		const action = interaction.options.getString('action', true)

		// Check if we're in a ticket thread
		const thread = interaction.channel
		if (!thread || !('isThread' in thread) || !thread.isThread()) {
			await utils.handleResponse(
				interaction,
				'error',
				'This command can only be used in a ticket thread.',
				{ code: 'TM001' }
			)
			return
		}

		// Handle based on action
		switch (action) {
			case 'close': {
				// Get optional reason
				const reason = interaction.options.getString('reason')

				if (reason) {
					// If reason provided directly, close the ticket with that reason
					await interaction.deferReply({ ephemeral: true })

					// Get the metadata
					let metadata = thread_metadata_store.get(
						thread.id
					) as ExtendedThreadMetadata
					if (!metadata) {
						metadata = (await api.getTicketMetadata(
							interaction.client.user.id,
							interaction.guild?.id as Discord.Guild['id'],
							thread.id
						)) as ExtendedThreadMetadata
					}

					// Check if the user is a moderator or the ticket opener
					const isTicketOpener = metadata?.opened_by?.id === interaction.user.id
					const hasModerationPermission = interaction.memberPermissions?.has(
						Discord.PermissionFlagsBits.ManageThreads
					)

					if (!isTicketOpener && !hasModerationPermission) {
						await utils.handleResponse(
							interaction,
							'error',
							"You don't have permission to close this ticket. Only moderators or the ticket opener can close tickets.",
							{ code: 'TM002' }
						)
						return
					}

					try {
						// Create a fake modal submission interaction instead of directly using closeThread
						// This avoids the direct dependency on the internal closeThread function
						const mockInteraction =
							createSimulatedButtonInteraction(interaction)

						// Instead of calling closeThread directly, we'll mimic what happens in a ticket close
						// Lock and archive the thread
						await thread.setLocked(true)
						await thread.setArchived(true)

						// Update metadata with closed status
						if (metadata) {
							metadata.closed_by = {
								id: interaction.user.id,
								avatar: interaction.user.displayAvatarURL({
									extension: interaction.user.avatar?.startsWith('a_')
										? 'gif'
										: 'png',
								}),
								username: interaction.user.username,
								displayName:
									(interaction.member as Discord.GuildMember)?.displayName ??
									interaction.user.username,
							}
							metadata.close_time = new Date()
							metadata.reason = reason
							metadata.status = 'closed'

							// Update in-memory metadata
							thread_metadata_store.set(thread.id, metadata)

							// Update in database
							await api.updateTicketMetadata(
								interaction.client.user.id,
								interaction.guild?.id as Discord.Guild['id'],
								thread.id,
								metadata as ThreadMetadata
							)
						}

						// Send a final message to the thread
						await thread.send({
							content: `# 🔒 Ticket Closed\n\nThis ticket has been closed by ${interaction.user.toString()}.\n\n**Reason:** ${reason}`,
						})

						await interaction.editReply({
							content: `The ticket has been closed with reason: ${reason}`,
						})
					} catch (error) {
						bunnyLog.error('Error closing ticket:', error)
						await utils.handleResponse(
							interaction,
							'error',
							'Failed to close the ticket.',
							{ code: 'TM011' }
						)
					}
				} else {
					// If no reason, show the close confirmation dialog
					await ticketUtils.closeTicket(
						createSimulatedButtonInteraction(interaction)
					)
				}
				break
			}

			case 'claim': {
				await interaction.deferReply({ ephemeral: true })

				// Get the metadata
				let metadata = thread_metadata_store.get(
					thread.id
				) as ExtendedThreadMetadata
				if (!metadata) {
					metadata = (await api.getTicketMetadata(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						thread.id
					)) as ExtendedThreadMetadata
				}

				// Check if the user has permission
				const member = await interaction.guild?.members.fetch(
					interaction.user.id
				)
				const config = await api.getPluginConfig(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					'tickets'
				)

				const modRoleIds = config.mods_role_ids || []
				const hasModerationPermission =
					interaction.memberPermissions?.has(
						Discord.PermissionFlagsBits.ManageThreads
					) ||
					(member &&
						modRoleIds.some((roleId) => member.roles.cache.has(roleId)))

				if (!hasModerationPermission) {
					await utils.handleResponse(
						interaction,
						'error',
						"You don't have permission to claim this ticket. Only moderators can claim tickets.",
						{ code: 'TM003' }
					)
					return
				}

				// Check if already claimed
				if (metadata?.claimed_by) {
					const alreadyClaimedByUser =
						typeof metadata.claimed_by === 'object' &&
						metadata.claimed_by.id === interaction.user.id

					if (!alreadyClaimedByUser) {
						await utils.handleResponse(
							interaction,
							'info',
							`This ticket is already claimed by <@${
								typeof metadata.claimed_by === 'object'
									? metadata.claimed_by.id
									: metadata.claimed_by
							}>. Only they can handle this ticket.`,
							{ code: 'TM004' }
						)
						return
					}

					await utils.handleResponse(
						interaction,
						'info',
						'You have already claimed this ticket.',
						{ code: 'TM005' }
					)
					return
				}

				// Get the member with additional info
				const fullMemberInfo = await interaction.guild?.members.fetch({
					user: interaction.user.id,
					force: true,
				})

				// Set claim information
				const claimedByInfo = {
					id: interaction.user.id,
					avatar: interaction.user.displayAvatarURL({
						extension: interaction.user.avatar?.startsWith('a_')
							? 'gif'
							: 'png',
					}),
					username: interaction.user.username,
					displayName: fullMemberInfo?.displayName ?? interaction.user.username,
				}

				// Update the metadata
				metadata = metadata || ({} as ExtendedThreadMetadata)
				metadata.claimed_by = claimedByInfo
				metadata.claimed_time = new Date()

				// Update in memory
				thread_metadata_store.set(thread.id, metadata)

				// Update in database
				await api.updateTicketMetadata(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					thread.id,
					metadata as unknown as ThreadMetadata
				)

				// Send claimed message to thread
				await thread.send({
					content: `# 🛡️ Ticket Claimed\n\n<@${claimedByInfo.id}> has claimed this ticket and will be assisting you.`,
				})

				// Send success message to user
				await interaction.editReply({
					content:
						'Ticket claimed successfully! You will now be the point of contact for this ticket.',
				})
				break
			}

			case 'join': {
				await interaction.deferReply({ ephemeral: true })

				try {
					// Add the user to the thread
					await thread.members.add(interaction.user.id)

					// Send a welcome message to the thread
					await thread.send({
						content: `${interaction.user.toString()} has joined the ticket.`,
					})

					await interaction.editReply({
						content: 'You have joined this ticket thread successfully.',
					})
				} catch (error) {
					bunnyLog.error('Error joining ticket:', error)
					await utils.handleResponse(
						interaction,
						'error',
						'Failed to join the ticket thread.',
						{ code: 'TM006' }
					)
				}
				break
			}

			case 'add': {
				const user = interaction.options.getUser('user')

				if (!user) {
					await utils.handleResponse(
						interaction,
						'error',
						'You must specify a user to add to the ticket.',
						{ code: 'TM012' }
					)
					return
				}

				try {
					await interaction.deferReply({ ephemeral: true })

					// Add member to the thread
					await thread.members.add(user.id)

					// Send notification to the thread
					await thread.send({
						content: `${user.toString()} was added to this ticket by ${interaction.user.toString()}.`,
					})

					await interaction.editReply({
						content: `Added ${user.toString()} to the ticket.`,
					})
				} catch (error) {
					bunnyLog.error('Failed to add user to ticket:', error)
					await utils.handleResponse(
						interaction,
						'error',
						'Failed to add user to the ticket.',
						{ code: 'TM007' }
					)
				}
				break
			}

			case 'remove': {
				const user = interaction.options.getUser('user')

				if (!user) {
					await utils.handleResponse(
						interaction,
						'error',
						'You must specify a user to remove from the ticket.',
						{ code: 'TM013' }
					)
					return
				}

				try {
					await interaction.deferReply({ ephemeral: true })

					// Remove member from the thread
					await thread.members.remove(user.id)

					// Send notification to the thread
					await thread.send({
						content: `${user.toString()} was removed from this ticket by ${interaction.user.toString()}.`,
					})

					await interaction.editReply({
						content: `Removed ${user.toString()} from the ticket.`,
					})
				} catch (error) {
					bunnyLog.error('Failed to remove user from ticket:', error)
					await utils.handleResponse(
						interaction,
						'error',
						'Failed to remove user from the ticket.',
						{ code: 'TM008' }
					)
				}
				break
			}

			default:
				await utils.handleResponse(interaction, 'error', 'Invalid action.', {
					code: 'TM009',
				})
		}
	} catch (error) {
		bunnyLog.error('Error in ticket management:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'An error occurred while managing the ticket.',
			{ code: 'TM010' }
		)
	}
}

/**
 * Helper function to create a simulated ButtonInteraction from a ChatInputCommandInteraction
 */
function createSimulatedButtonInteraction(
	interaction: Discord.ChatInputCommandInteraction
): Discord.ButtonInteraction {
	const thread = interaction.channel as Discord.ThreadChannel

	// Create a type-safe mock with the essential properties needed
	const mockInteraction = {
		client: interaction.client,
		guild: interaction.guild,
		member: interaction.member,
		user: interaction.user,
		channel: thread,
		memberPermissions: interaction.memberPermissions,
		// These methods will just delegate to the original interaction
		deferReply: interaction.deferReply.bind(interaction),
		deferUpdate: () => interaction.deferReply({ ephemeral: true }),
		editReply: interaction.editReply.bind(interaction),
		reply: interaction.reply.bind(interaction),
		followUp: interaction.followUp.bind(interaction),
		// These properties are needed for type compatibility
		deferred: false,
		replied: false,
		customId: `close_ticket_${thread?.id || 'unknown'}_0`,
		message: { id: 'simulated' } as Discord.Message,
		// Add any other required properties to satisfy the type
		componentType: Discord.ComponentType.Button,
		component: { type: Discord.ComponentType.Button } as Discord.Component,
	}

	// Type assertion to ButtonInteraction
	return mockInteraction as unknown as Discord.ButtonInteraction
}

// Export ticket command functions
export {
	config,
	handleConfigSelectMenu,
	list,
	sendPanel,
	manage,
	handleBackToMainConfig,
}

// Re-export ticket utility functions
export const openTicket = ticketUtils.openTicket
export const closeTicket = ticketUtils.closeTicket
export const closeTicketWithReason = ticketUtils.closeTicketWithReason
export const confirmCloseTicket = ticketUtils.confirmCloseTicket
export const joinTicket = ticketUtils.joinTicket
export const claimTicket = ticketUtils.claimTicket
export const modalSubmit = ticketUtils.modalSubmit
export const handleTicketRating = ticketUtils.handleTicketRating

// Export component handlers
export const handleComponentInteraction = async (
	interaction:
		| Discord.ButtonInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ModalSubmitInteraction
) => {
	const customId = interaction.customId

	// Handle back button first for immediate response
	if (customId === 'ticket_config_back' && interaction.isButton()) {
		try {
			await handleBackToMainConfig(interaction)
			return
		} catch (error) {
			bunnyLog.error('Error handling back button:', error)
			// Try to respond if we can, but continue processing in case this was a different interaction
			try {
				if (!interaction.replied && !interaction.deferred) {
					await interaction.deferUpdate().catch(() => {})
					await interaction
						.followUp({
							content: 'Failed to return to main menu. Please try again.',
							ephemeral: true,
						})
						.catch(() => {})
				}
			} catch (e) {
				bunnyLog.error(
					`Failed to send error response for back button: ${e.message}`
				)
			}
			return
		}
	}

	// Handle back to auto-close settings button
	if (customId === 'autoclose_back' && interaction.isButton()) {
		try {
			await interaction.deferUpdate()

			// Get current config
			const config = await api.getPluginConfig(
				interaction.client.user.id,
				interaction.guild?.id as Discord.Guild['id'],
				'tickets'
			)

			// Get current auto-close settings
			const autoClose = config.auto_close?.[0] || {
				enabled: false,
				threshold: 72 * 60 * 60 * 1000, // 72 hours default
				reason: 'Ticket automatically closed due to inactivity.',
			}

			// Format the current threshold for display
			const formattedThreshold = ticketUtils.formatTimeThreshold(
				autoClose.threshold
			)

			// Create toggle buttons for enabled/disabled with Set Reason in the same row
			const toggleRow =
				new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					new Discord.ButtonBuilder()
						.setCustomId('autoclose_enable')
						.setLabel('Enable')
						.setStyle(
							autoClose.enabled
								? Discord.ButtonStyle.Success
								: Discord.ButtonStyle.Secondary
						)
						.setDisabled(autoClose.enabled), // Disable the Enable button if already enabled
					new Discord.ButtonBuilder()
						.setCustomId('autoclose_disable')
						.setLabel('Disable')
						.setStyle(
							!autoClose.enabled
								? Discord.ButtonStyle.Danger
								: Discord.ButtonStyle.Secondary
						)
						.setDisabled(!autoClose.enabled), // Disable the Disable button if already disabled
					new Discord.ButtonBuilder()
						.setCustomId('autoclose_set_reason')
						.setLabel('Set Reason')
						.setStyle(Discord.ButtonStyle.Primary)
				)

			// Create time unit selection menu for threshold
			const timeUnitSelectRow = createTimeUnitSelector(
				'autoclose_time_unit_select'
			)

			// Add back button
			const backRow =
				new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					new Discord.ButtonBuilder()
						.setCustomId('ticket_config_back')
						.setLabel('Back to Main Menu')
						.setStyle(Discord.ButtonStyle.Secondary)
				)

			// Update the message with auto-close configuration panel
			await interaction.editReply({
				content: [
					'# Auto-close Settings',
					'',
					'Configure when inactive tickets should be automatically closed.',
					'',
					'## Current Settings',
					`**Status:** ${autoClose.enabled ? '✅ Enabled' : '❌ Disabled'}`,
					`**Threshold:** ${formattedThreshold}`,
					`**Close Reason:** ${autoClose.reason}`,
					'',
					'Use the controls below to update these settings:',
				].join('\n'),
				components: [toggleRow, timeUnitSelectRow, backRow],
			})
			return
		} catch (error) {
			bunnyLog.error('Error handling auto-close back button:', error)
			await interaction.followUp({
				content: 'Failed to return to auto-close settings. Please try again.',
				ephemeral: true,
			})
			return
		}
	}

	// Handle auto-close settings buttons
	if (customId === 'autoclose_enable' && interaction.isButton()) {
		try {
			await handleAutoCloseToggle(interaction, true) // Enable auto-close
			return
		} catch (error) {
			bunnyLog.error('Error handling auto-close enable button:', error)
		}
	}

	if (customId === 'autoclose_disable' && interaction.isButton()) {
		try {
			await handleAutoCloseToggle(interaction, false) // Disable auto-close
			return
		} catch (error) {
			bunnyLog.error('Error handling auto-close disable button:', error)
		}
	}

	if (customId === 'autoclose_set_reason' && interaction.isButton()) {
		try {
			await handleSetAutoCloseReason(interaction)
			return
		} catch (error) {
			bunnyLog.error('Error handling set auto-close reason button:', error)
		}
	}

	if (
		(customId === 'autoclose_time_select' ||
			customId === 'autoclose_time_unit_select' ||
			customId === 'autoclose_predefined_select' ||
			customId.startsWith('autoclose_value_')) &&
		interaction.isStringSelectMenu()
	) {
		try {
			await handleAutoCloseTimeSelect(interaction)
			return
		} catch (error) {
			bunnyLog.error('Error handling auto-close time selection:', error)
		}
	}

	if (customId === 'autoclose_reason_modal' && interaction.isModalSubmit()) {
		try {
			await handleAutoCloseReasonModal(interaction)
			return
		} catch (error) {
			bunnyLog.error('Error handling auto-close reason modal:', error)
		}
	}

	if (
		customId === 'autoclose_custom_time_modal' &&
		interaction.isModalSubmit()
	) {
		try {
			// Extract custom time value
			const customTime =
				interaction.fields.getTextInputValue('custom_time_input')
			await handleAutoCloseCustomTime(interaction, customTime)
			return
		} catch (error) {
			bunnyLog.error('Error handling auto-close custom time modal:', error)
		}
	}

	// Handle modals
	if (customId === 'ticket_autoclose_modal' && interaction.isModalSubmit()) {
		await handleTicketAutocloseModal(interaction)
		return
	}

	if (customId === ROLE_TIME_LIMIT_ADD_BUTTON_ID && interaction.isButton()) {
		await handleAddRoleTimeLimitComponent(interaction)
		return
	}

	if (customId === ROLE_TIME_LIMIT_REMOVE_BUTTON_ID && interaction.isButton()) {
		await handleRemoveRoleTimeLimit(interaction)
		return
	}

	if (
		customId === ROLE_TIME_LIMIT_REMOVE_SELECT_ID &&
		interaction.isStringSelectMenu()
	) {
		await handleRemoveRoleTimeLimitSelect(interaction)
		return
	}

	// Handle config select menu
	if (customId === 'ticket_config_select' && interaction.isStringSelectMenu()) {
		await handleConfigSelectMenu(interaction)
		return
	}

	if (
		(customId === 'ticket_admin_channel' ||
			customId === 'ticket_transcript_channel') &&
		'values' in interaction &&
		interaction.isChannelSelectMenu()
	) {
		try {
			await interaction.deferUpdate()

			if (interaction.values.length === 0) {
				await interaction.followUp({
					content: 'No channel selected.',
					ephemeral: true,
				})
				return
			}

			const channelId = interaction.values[0]
			const configField =
				customId === 'ticket_admin_channel'
					? 'admin_channel_id'
					: 'transcript_channel_id'

			try {
				// Get current config
				const config = await api.getPluginConfig(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					'tickets'
				)

				// Update the specific field
				config[configField] = channelId

				// Save updated config
				await api.updatePluginConfig(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					'tickets',
					config
				)

				const channelType =
					customId === 'ticket_admin_channel'
						? 'Admin notification'
						: 'Transcript archive'

				await interaction.followUp({
					content: `${channelType} channel set to: <#${channelId}>`,
					ephemeral: true,
				})

				// Return to main config panel instead of leaving the user with just a notification
				await handleBackToMainConfig(
					interaction as unknown as Discord.ButtonInteraction
				)
			} catch (error) {
				bunnyLog.error('Error updating channel:', error)
				await utils.handleResponse(
					interaction,
					'error',
					'Failed to update channel configuration.',
					{ code: 'TCH002' }
				)
			}
		} catch (error) {
			bunnyLog.error('Error handling channel select menu:', error)
			try {
				if (!interaction.replied && !interaction.deferred) {
					await interaction.deferUpdate().catch(() => {})
				}
				await interaction
					.followUp({
						content: 'An error occurred while updating channel configuration.',
						ephemeral: true,
					})
					.catch(() => {})
			} catch (e) {
				bunnyLog.error(`Failed to send error response: ${e.message}`)
			}
		}
		return
	}

	if (
		customId === 'ticket_mod_roles' &&
		'values' in interaction &&
		interaction.isRoleSelectMenu()
	) {
		try {
			await interaction.deferUpdate()

			try {
				// Get current config
				const config = await api.getPluginConfig(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					'tickets'
				)

				// Update moderator roles
				config.mods_role_ids = interaction.values

				// Save updated config
				await api.updatePluginConfig(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					'tickets',
					config
				)

				const rolesText =
					interaction.values.length > 0
						? interaction.values.map((id) => `<@&${id}>`).join(', ')
						: 'None (using server permissions)'

				await interaction.followUp({
					content: `Moderator roles set to: ${rolesText}`,
					ephemeral: true,
				})

				// Return to main config panel after updating roles
				await handleBackToMainConfig(
					interaction as unknown as Discord.ButtonInteraction
				)
			} catch (error) {
				bunnyLog.error('Error updating moderator roles:', error)
				await utils.handleResponse(
					interaction,
					'error',
					'Failed to update moderator roles.',
					{ code: 'TCH003' }
				)
			}
		} catch (error) {
			bunnyLog.error('Error handling role select menu:', error)
			try {
				if (!interaction.replied && !interaction.deferred) {
					await interaction.deferUpdate().catch(() => {})
				}
				await interaction
					.followUp({
						content:
							'An error occurred while updating moderator roles configuration.',
						ephemeral: true,
					})
					.catch(() => {})
			} catch (e) {
				bunnyLog.error(`Failed to send error response: ${e.message}`)
			}
		}
		return
	}

	if (customId.startsWith('confirm_close_ticket_') && interaction.isButton()) {
		// Lock and archive the thread
		try {
			const thread = interaction.channel as Discord.ThreadChannel

			if (thread?.isThread()) {
				// Get the metadata
				let metadata = thread_metadata_store.get(
					thread.id
				) as ExtendedThreadMetadata
				if (!metadata) {
					metadata = (await api.getTicketMetadata(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						thread.id
					)) as ExtendedThreadMetadata
				}

				// Update metadata with closed status
				if (metadata) {
					metadata.closed_by = {
						id: interaction.user.id,
						avatar: interaction.user.displayAvatarURL({
							extension: interaction.user.avatar?.startsWith('a_')
								? 'gif'
								: 'png',
						}),
						username: interaction.user.username,
						displayName:
							(interaction.member as Discord.GuildMember)?.displayName ??
							interaction.user.username,
					}
					metadata.close_time = new Date()
					metadata.reason = 'No reason provided'
					metadata.status = 'closed'

					// Update in-memory metadata
					thread_metadata_store.set(thread.id, metadata)

					// Update in database
					await api.updateTicketMetadata(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						thread.id,
						metadata as ThreadMetadata
					)
				}

				// Send a final message
				await thread.send({
					content: `# 🔒 Ticket Closed\n\nThis ticket has been closed by ${interaction.user.toString()}.\n\n**Reason:** No reason provided`,
				})

				// Lock and archive the thread
				await thread.setLocked(true)
				await thread.setArchived(true)

				await interaction.update({
					content: 'Ticket has been closed.',
					components: [],
				})
			} else {
				await interaction.update({
					content: 'Error: This is not a ticket thread.',
					components: [],
				})
			}
		} catch (error) {
			bunnyLog.error('Error closing ticket:', error)
			await interaction.update({
				content: 'Failed to close the ticket. Please try again.',
				components: [],
			})
		}
		return
	}

	if (customId.startsWith('cancel_close_ticket_') && interaction.isButton()) {
		await interaction.update({
			content: 'Ticket closure canceled.',
			components: [],
		})
		return
	}

	if (customId.startsWith('close_ticket_') && interaction.isButton()) {
		await ticketUtils.closeTicketWithReason(interaction)
		return
	}

	if (customId.startsWith('claim_ticket_') && interaction.isButton()) {
		await ticketUtils.claimTicket(interaction)
		return
	}

	if (customId.startsWith('join_ticket_') && interaction.isButton()) {
		await ticketUtils.joinTicket(interaction)
		return
	}

	// For any other ticket buttons that open tickets
	if (interaction.isButton()) {
		try {
			// Check if this is a back button again (redundant check to be safe)
			if (customId === 'ticket_config_back') {
				bunnyLog.info('Handling back button via fallback path')
				await handleBackToMainConfig(interaction)
				return
			}

			// If not a back button, handle as ticket opening
			await ticketUtils.openTicket(interaction)
		} catch (error) {
			bunnyLog.error(
				`Error handling button interaction: ${error.message}`,
				error
			)
			try {
				await interaction
					.followUp({
						content: 'An error occurred while processing your request.',
						ephemeral: true,
					})
					.catch(() => {})
			} catch (e) {
				// Ignore
			}
		}
	}
}

// Dodaj nową funkcję do obsługi modalu auto-close
async function handleTicketAutocloseModal(
	interaction: Discord.ModalSubmitInteraction
): Promise<void> {
	await interaction.deferReply({ ephemeral: true })

	try {
		// Pobranie wartości z modalu
		const enabledValue =
			interaction.fields.getTextInputValue('autoclose_enabled')
		const thresholdValue = interaction.fields.getTextInputValue(
			'autoclose_threshold'
		)
		const reasonValue = interaction.fields.getTextInputValue('autoclose_reason')

		// Konwersja wartości enabled na boolean
		const isEnabled = enabledValue.toLowerCase() === 'true'

		// Konwersja wartości threshold na milisekundy
		const thresholdMs = ticketUtils.parseTimeLimit(thresholdValue)
		if (thresholdMs === 0 && isEnabled) {
			await interaction.editReply({
				content:
					'Invalid threshold format. Please use a format like 72h, 3d, or 1w.',
			})
			return
		}

		// Pobierz aktualną konfigurację
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Aktualizuj lub utwórz konfigurację auto-close
		if (!config.auto_close) {
			config.auto_close = []
		}

		if (config.auto_close.length === 0) {
			config.auto_close.push({
				enabled: isEnabled,
				threshold: thresholdMs,
				reason: reasonValue,
			})
		} else {
			// Aktualizuj istniejącą konfigurację
			config.auto_close[0] = {
				enabled: isEnabled,
				threshold: thresholdMs,
				reason: reasonValue,
			}
		}

		// Zapisz zaktualizowaną konfigurację
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Sformatuj odpowiedź
		const statusText = isEnabled ? '✅ Enabled' : '❌ Disabled'
		const formattedThreshold = ticketUtils.formatTimeThreshold(thresholdMs)

		await interaction.editReply({
			content: [
				'# Auto-close Configuration Updated',
				'',
				`**Status:** ${statusText}`,
				`**Threshold:** ${formattedThreshold}`,
				`**Reason:** ${reasonValue}`,
				'',
				'Inactive tickets will be automatically closed based on these settings.',
			].join('\n'),
		})
	} catch (error) {
		bunnyLog.error('Error updating auto-close settings:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'Failed to update auto-close settings.',
			{ code: 'TAC001' }
		)
	}
}

// Zmodyfikuj funkcję handleRoleTimeLimitsConfig, aby dodać przycisk powrotu
async function handleRoleTimeLimitsConfig(
	interaction: Discord.StringSelectMenuInteraction,
	config: PluginResponse<DefaultConfigs['tickets']>
): Promise<void> {
	try {
		// Don't deferReply here since the interaction has already been deferred in handleConfigSelectMenu

		// Format current role time limits
		const roleTimeLimits = config.role_time_limits || []

		// Prepare list of limits for display
		let limitsContent = ''
		if (roleTimeLimits.length === 0) {
			limitsContent = '> No role time limits configured yet.'
		} else {
			limitsContent = roleTimeLimits
				.map((limit, index) => {
					return `**${index + 1}.** <@&${limit.role_id}>: ${limit.limit}`
				})
				.join('\n')
		}

		// Create action buttons including Back button
		const actionRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId(ROLE_TIME_LIMIT_ADD_BUTTON_ID)
					.setLabel('Add Limit')
					.setStyle(Discord.ButtonStyle.Primary),
				new Discord.ButtonBuilder()
					.setCustomId(ROLE_TIME_LIMIT_REMOVE_BUTTON_ID)
					.setLabel('Remove Limit')
					.setStyle(Discord.ButtonStyle.Danger)
					.setDisabled(roleTimeLimits.length === 0),
				new Discord.ButtonBuilder()
					.setCustomId('ticket_config_back')
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Update the interaction with the configuration message
		const content = [
			'# Role Time Limits Configuration',
			'',
			'Role time limits allow you to control how frequently users with specific roles can create new tickets.',
			'For example, you can set that users with @Member role can only create a new ticket every 24 hours.',
			'',
			'## Current Limits',
			limitsContent,
			'',
			'## Format',
			'Time limits use the format: `Xm` (minutes), `Xh` (hours), `Xd` (days), or `Xw` (weeks)',
			'Example: `12h` = 12 hours, `3d` = 3 days, `1w` = 1 week',
			'',
			'Use the buttons below to manage role time limits:',
		].join('\n')

		// Send the configuration message
		try {
			// Try to edit the reply since the interaction was deferred in handleConfigSelectMenu
			await interaction
				.editReply({
					content,
					components: [actionRow],
				})
				.catch(async (err) => {
					bunnyLog.error(`Failed to edit reply: ${err.message}`)

					// If edit fails, try to follow up
					await interaction
						.followUp({
							content,
							components: [actionRow],
							ephemeral: true,
						})
						.catch((e) => bunnyLog.error(`Failed to follow up: ${e.message}`))
				})

			// Store the original interaction for later updates
			const cacheKey = `${interaction.guild.id}_role_time_limits`
			original_config_interactions.set(cacheKey, interaction)
		} catch (err) {
			bunnyLog.error(
				`Error updating role time limits config message: ${err.message}`
			)
			throw err // Propagate the error for the outer try/catch to handle
		}
	} catch (error) {
		bunnyLog.error('Error displaying role time limits:', error)
		try {
			if (!interaction.replied) {
				await interaction
					.followUp({
						content: 'Failed to load role time limits configuration.',
						ephemeral: true,
					})
					.catch(() => {})
			}
		} catch (e) {
			bunnyLog.error(`Failed to send error response: ${e.message}`)
		}
	}
}

// Update the handleAddRoleTimeLimitComponent function with a hierarchical time selection menu
async function handleAddRoleTimeLimitComponent(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	try {
		await interaction
			.deferReply({ flags: Discord.MessageFlags.Ephemeral })
			.catch((e) => {
				bunnyLog.error(`Failed to defer reply: ${e.message}`)
				throw new Error('Interaction already responded')
			})

		// Create a message with components to fill in
		const roleSelectRow =
			new Discord.ActionRowBuilder<Discord.RoleSelectMenuBuilder>().addComponents(
				new Discord.RoleSelectMenuBuilder()
					.setCustomId('time_limit_role_select')
					.setPlaceholder('Select a role')
					.setMinValues(1)
					.setMaxValues(1)
			)

		// Create time unit selection menu first
		const timeUnitOptions = [
			{ label: 'Seconds', value: 'seconds' },
			{ label: 'Minutes', value: 'minutes' },
			{ label: 'Hours', value: 'hours' },
			{ label: 'Days', value: 'days' },
			{ label: 'Weeks', value: 'weeks' },
			{ label: 'Predefined Values', value: 'predefined' },
		]

		const timeUnitSelectRow =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				new Discord.StringSelectMenuBuilder()
					.setCustomId('time_limit_unit_select')
					.setPlaceholder('Select time unit')
					.addOptions(timeUnitOptions)
			)

		// Send the initial message with components
		const response = await interaction
			.editReply({
				content: '# Add Role Time Limit\n\nPlease select a role and time unit:',
				components: [roleSelectRow, timeUnitSelectRow],
			})
			.catch((e) => {
				bunnyLog.error(`Failed to send initial components: ${e.message}`)
				throw new Error('Could not send initial components')
			})

		// Store the original message ID for later
		const originalMessageId =
			response instanceof Discord.Message ? response.id : null

		// Create a collector for responses
		const collector = response.createMessageComponentCollector({
			filter: (i) => i.user.id === interaction.user.id,
			time: 180000, // 3 minutes
		})

		// Store selections
		const selections: {
			roleId?: string
			timeUnit?: string
			timeValue?: string
			roleName?: string
		} = {}

		collector.on('collect', async (i) => {
			try {
				await i.deferUpdate().catch((e) => {
					bunnyLog.error(`Failed to defer component update: ${e.message}`)
					return // Continue anyway, since we'll try to handle the core logic
				})

				if (i.isRoleSelectMenu()) {
					// Save selected role
					selections.roleId = i.values[0]

					// Update message with info about selected role
					const guild = interaction.guild
					try {
						const role = await guild.roles.fetch(selections.roleId)
						if (role) {
							selections.roleName = role.name
						}
					} catch (error) {
						bunnyLog.warn('Failed to fetch role name:', error)
						selections.roleName = selections.roleId
					}

					// Update display if time unit is already selected
					if (selections.timeUnit) {
						await displayTimeValueSelector(interaction, selections).catch((e) =>
							bunnyLog.error(
								`Failed to display time value selector: ${e.message}`
							)
						)
						return
					}

					// Just update the message to show selected role
					await interaction
						.editReply({
							content: `# Add Role Time Limit\n\n**Selected Role:** ${selections.roleName}\n\nNow please select a time unit:`,
							components: [timeUnitSelectRow],
						})
						.catch((e) =>
							bunnyLog.error(`Failed to update role message: ${e.message}`)
						)
					return
				}

				if (i.isStringSelectMenu() && i.customId === 'time_limit_unit_select') {
					// Save selected time unit
					selections.timeUnit = i.values[0]

					if (selections.timeUnit === 'predefined') {
						// Show predefined time limit options
						const predefinedOptions = [
							{ label: '30 minutes', value: '30m' },
							{ label: '1 hour', value: '1h' },
							{ label: '12 hours', value: '12h' },
							{ label: '1 day', value: '1d' },
							{ label: '3 days', value: '3d' },
							{ label: '1 week', value: '1w' },
							{ label: '2 weeks', value: '2w' },
						]

						const predefinedSelectRow =
							new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
								new Discord.StringSelectMenuBuilder()
									.setCustomId('time_limit_predefined_select')
									.setPlaceholder('Select a predefined time limit')
									.addOptions(predefinedOptions)
							)

						await interaction
							.editReply({
								content: `# Add Role Time Limit\n\n**Selected Role:** ${selections.roleName || selections.roleId}\n\nPlease select a predefined time limit:`,
								components: [predefinedSelectRow],
							})
							.catch((e) =>
								bunnyLog.error(
									`Failed to show predefined options: ${e.message}`
								)
							)
						return
					}

					// Display appropriate value selector based on time unit
					await displayTimeValueSelector(interaction, selections).catch((e) =>
						bunnyLog.error(`Failed to display time selector: ${e.message}`)
					)
					return
				}

				if (
					i.isStringSelectMenu() &&
					i.customId === 'time_limit_predefined_select'
				) {
					// Process the selected predefined time limit
					selections.timeValue = i.values[0]

					// Process the selected data and save the role time limit
					await processRoleTimeLimit(
						interaction,
						selections.roleId,
						selections.timeValue
					).catch((e) =>
						bunnyLog.error(`Failed to process time limit: ${e.message}`)
					)

					collector.stop('completed')
					return
				}

				if (
					i.isStringSelectMenu() &&
					i.customId.startsWith('time_limit_value_')
				) {
					// Save the selected time value and format it properly
					const selectedValue = i.values[0]
					const unit = selections.timeUnit.charAt(0)
					selections.timeValue = `${selectedValue}${unit}`

					// Process the selected data and save the role time limit
					await processRoleTimeLimit(
						interaction,
						selections.roleId,
						selections.timeValue
					).catch((e) =>
						bunnyLog.error(`Failed to process time limit: ${e.message}`)
					)

					collector.stop('completed')
					return
				}
			} catch (error) {
				bunnyLog.error('Error handling time limit selection:', error)
				try {
					// Just close this select menu interaction with a notification, don't touch the main config
					await i
						.followUp({
							content: 'An error occurred while processing your selection.',
							ephemeral: true,
						})
						.catch(() => {}) // Ignore any errors here
				} catch (e) {
					bunnyLog.error(`Failed to send error message: ${e.message}`)
				}
				collector.stop('error')
			}
		})

		collector.on('end', async (collected, reason) => {
			if (reason === 'completed') {
				// When completed successfully, close this interaction but the main panel is already updated
				try {
					await interaction
						.editReply({
							content:
								'Role time limit configuration completed. The main configuration panel has been updated.',
							components: [],
						})
						.catch(() => {}) // Ignore errors here
				} catch (e) {
					bunnyLog.error(`Failed to update completion message: ${e.message}`)
				}
				return
			}

			if (reason === 'time') {
				// Timed out - just close this interaction, don't touch the main config
				try {
					await interaction
						.editReply({
							content:
								'Role time limit configuration timed out. Please try again.',
							components: [],
						})
						.catch(() => {}) // Ignore errors here
				} catch (e) {
					bunnyLog.error(`Failed to update timeout message: ${e.message}`)
				}
			} else if (reason !== 'error') {
				// Incomplete data - just close this interaction, don't touch the main config
				try {
					await interaction
						.editReply({
							content:
								'Role time limit configuration incomplete. Please try again.',
							components: [],
						})
						.catch(() => {}) // Ignore errors here
				} catch (e) {
					bunnyLog.error(`Failed to update incomplete message: ${e.message}`)
				}
			}
		})
	} catch (error) {
		bunnyLog.error('Error handling add role time limit component:', error)
		try {
			if (!interaction.deferred && !interaction.replied) {
				await interaction
					.reply({
						content: 'Failed to show role time limit form.',
						flags: Discord.MessageFlags.Ephemeral,
					})
					.catch(() => {}) // Ignore any errors here
			} else if (!interaction.replied) {
				await interaction
					.editReply({
						content: 'An error occurred while processing your request.',
						components: [],
					})
					.catch(() => {}) // Ignore any errors here
			}
		} catch (e) {
			bunnyLog.error(`Failed to send error message: ${e.message}`)
		}
	}
}

/**
 * Helper function to display the appropriate time value selector based on the selected time unit
 */
async function displayTimeValueSelector(
	interaction: Discord.ButtonInteraction | Discord.MessageComponentInteraction,
	selections: {
		roleId?: string
		timeUnit?: string
		timeValue?: string
		roleName?: string
	}
): Promise<void> {
	try {
		// Use the shared helper function to generate options
		const options = generateTimeValueOptions(selections.timeUnit)
		const customId = `time_limit_value_${selections.timeUnit}`

		// Create the select menu with the options
		const valueSelectRow =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				new Discord.StringSelectMenuBuilder()
					.setCustomId(customId)
					.setPlaceholder(`Select number of ${selections.timeUnit}`)
					.addOptions(options)
			)

		// Update the message with the new select menu
		await interaction
			.editReply({
				content: `# Add Role Time Limit\n\n**Selected Role:** ${selections.roleName || selections.roleId}\n**Time Unit:** ${selections.timeUnit}\n\nPlease select a value:`,
				components: [valueSelectRow],
			})
			.catch((err) => {
				bunnyLog.error(`Failed to update time value selector: ${err.message}`)
				throw new Error('Failed to display time value selector')
			})
	} catch (error) {
		bunnyLog.error('Error displaying time value selector:', error)
		throw error // Re-throw so the calling function can handle it
	}
}

/**
 * Handle removing a role time limit
 * @param interaction - The button interaction for role time limit removal
 */
async function handleRemoveRoleTimeLimit(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	try {
		await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Check if there are any role time limits
		if (!config.role_time_limits || config.role_time_limits.length === 0) {
			await interaction.editReply({
				content: 'There are no role time limits configured to remove.',
			})
			return
		}

		// Create select menu with role time limits
		const options = await Promise.all(
			config.role_time_limits.map(async (limit, index) => {
				const roleName = await getRoleNameById(interaction.guild, limit.role_id)
				return {
					label: `${roleName} (${limit.limit})`,
					description: `Role ID: ${limit.role_id}`,
					value: index.toString(),
				}
			})
		)

		const selectMenu = new Discord.StringSelectMenuBuilder()
			.setCustomId(ROLE_TIME_LIMIT_REMOVE_SELECT_ID)
			.setPlaceholder('Select a role time limit to remove')
			.addOptions(options)

		const row =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				selectMenu
			)

		await interaction.editReply({
			content:
				'# Remove Role Time Limit\n\nSelect a role time limit to remove:',
			components: [row],
		})
	} catch (error) {
		bunnyLog.error('Error showing remove role time limit menu:', error)
		await interaction.editReply({
			content: 'Failed to load role time limits.',
			components: [],
		})
	}
}

/**
 * Handle the selection of a role time limit to remove
 * @param interaction - The select menu interaction for removing a time limit
 */
async function handleRemoveRoleTimeLimitSelect(
	interaction: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate().catch((e) => {
			bunnyLog.error(
				`Failed to defer update in removeRoleTimeLimitSelect: ${e.message}`
			)
			// Don't throw an error, attempt to continue processing
		})

		// Get the selected index
		const selectedIndex = Number.parseInt(interaction.values[0], 10)

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Check if the index is valid
		if (
			!config.role_time_limits ||
			selectedIndex < 0 ||
			selectedIndex >= config.role_time_limits.length
		) {
			await interaction
				.followUp({
					content: 'Invalid selection. Please try again.',
					ephemeral: true,
				})
				.catch((e) =>
					bunnyLog.error(
						`Failed to send invalid selection message: ${e.message}`
					)
				)
			return
		}

		// Store the removed limit info for confirmation message
		const removedLimit = config.role_time_limits[selectedIndex]
		const roleName = await getRoleNameById(
			interaction.guild,
			removedLimit.role_id
		)

		// Remove the selected time limit
		config.role_time_limits.splice(selectedIndex, 1)

		// Update the config
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Send a notification about the successful removal as a follow-up
		await interaction
			.followUp({
				content: `# Role Time Limit Removed\n\nSuccessfully removed time limit for role: **${roleName}** (${removedLimit.limit})`,
				ephemeral: true,
			})
			.catch((e) =>
				bunnyLog.error(`Failed to send removal notification: ${e.message}`)
			)

		// Immediately update the main configuration message
		try {
			const cacheKey = `${interaction.guild.id}_role_time_limits`
			const originalInteraction = original_config_interactions.get(cacheKey)

			if (originalInteraction) {
				// Update the original configuration message directly
				await updateRoleTimeLimitsMessage(originalInteraction, config).catch(
					(err) => {
						bunnyLog.error(
							`Failed to update role time limits message: ${err.message}`
						)
						// Even if this fails, we've already shown a success message to the user
					}
				)
			} else {
				// If we couldn't find the original interaction, create a new configuration message
				await sendUpdatedRoleTimeLimitsConfig(interaction, config).catch(
					(err) => {
						bunnyLog.error(`Failed to send updated config: ${err.message}`)
						// Even if this fails, we've already shown a success message to the user
					}
				)
			}
		} catch (updateError) {
			bunnyLog.error(
				'Error updating role time limits config after removal:',
				updateError
			)

			// Try to send a simple follow-up as last resort, but only if we haven't already succeeded with the main notification
			await interaction
				.followUp({
					content:
						'Role time limit was removed, but there was an error updating the configuration display. The change was saved successfully.',
					ephemeral: true,
				})
				.catch(() => {}) // Ignore errors here
		}
	} catch (error) {
		bunnyLog.error('Error removing role time limit:', error)
		try {
			// Always attempt to notify the user about the error
			await interaction
				.followUp({
					content: 'Failed to remove role time limit. Please try again.',
					ephemeral: true,
				})
				.catch(() => {}) // Ignore any errors
		} catch (e) {
			bunnyLog.error(`Failed to send error response: ${e.message}`)
		}
	}
}

/**
 * Helper function to get role name by ID
 * @param guild - The Discord guild
 * @param roleId - The ID of the role
 * @returns The name of the role, or the ID if the role cannot be fetched
 */
async function getRoleNameById(
	guild: Discord.Guild,
	roleId: string
): Promise<string> {
	if (!roleId) return 'Unknown Role'

	try {
		const role = await guild.roles.fetch(roleId)
		return role ? role.name : roleId
	} catch (error) {
		bunnyLog.warn('Failed to fetch role name:', error)
		return roleId
	}
}

/**
 * Process and save a role time limit
 * @param interaction - The interaction that triggered the function
 * @param roleId - The ID of the role to apply the time limit to
 * @param timeLimit - The time limit to apply
 */
async function processRoleTimeLimit(
	interaction: Discord.ButtonInteraction | Discord.MessageComponentInteraction,
	roleId: string,
	timeLimit: string
): Promise<void> {
	try {
		// Check if the time limit format is valid using the shared parsing function
		const timeLimitMs = parseTimeValue(timeLimit)
		if (timeLimitMs === 0) {
			await interaction
				.followUp({
					content:
						'Invalid time limit format. Please use formats like 30m, 12h, 3d, or 1w.',
					ephemeral: true,
				})
				.catch((e) =>
					bunnyLog.error(`Failed to send invalid format message: ${e.message}`)
				)
			return
		}

		// Get the current configuration
		const config = (await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)) as PluginResponse<DefaultConfigs['tickets']>

		// Initialize the time limits array if it doesn't exist
		if (!config.role_time_limits) {
			config.role_time_limits = []
		}

		// Check if a limit for this role already exists
		const existingLimitIndex = config.role_time_limits.findIndex(
			(limit) => limit.role_id === roleId
		)

		if (existingLimitIndex >= 0) {
			// Update existing limit
			config.role_time_limits[existingLimitIndex].limit = timeLimit
		} else {
			// Add new limit
			config.role_time_limits.push({
				role_id: roleId,
				limit: timeLimit,
			})
		}

		// Save the updated configuration
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Get the role name to display
		const roleName = await getRoleNameById(interaction.guild, roleId)

		// Send success message as a follow-up
		await interaction
			.followUp({
				content: [
					'# Role time limit added successfully!',
					'',
					`Role time limit for **${roleName}** set to **${timeLimit}**`,
					`Users with this role will be able to create a new ticket once every ${timeLimit}.`,
				].join('\n'),
				ephemeral: true,
			})
			.catch((e) =>
				bunnyLog.error(`Failed to send success message: ${e.message}`)
			)

		// Immediately update the main config panel
		try {
			const cacheKey = `${interaction.guild.id}_role_time_limits`
			const originalInteraction = original_config_interactions.get(cacheKey)

			if (originalInteraction) {
				// Update the original configuration message directly with the new config
				await updateRoleTimeLimitsMessage(originalInteraction, config).catch(
					(err) => {
						bunnyLog.error(
							`Failed to update time limits message: ${err.message}`
						)
						// Even if this fails, we've already shown a success message, so don't show additional errors to user
					}
				)
			} else {
				// If we couldn't find the original interaction, create a new configuration message
				await sendUpdatedRoleTimeLimitsConfig(interaction, config).catch(
					(err) => {
						bunnyLog.error(`Failed to send updated config: ${err.message}`)
						// Even if this fails, we've already shown a success message, so don't show additional errors to user
					}
				)
			}
		} catch (updateError) {
			bunnyLog.error('Error updating role time limits config:', updateError)

			// Try a simple follow-up only if initial success message failed
			await interaction
				.followUp({
					content:
						'Role time limit was added successfully, but there was an error updating the configuration display. The change was saved.',
					ephemeral: true,
				})
				.catch(() => {}) // Ignore errors
		}
	} catch (error) {
		bunnyLog.error('Error processing role time limit:', error)
		try {
			// Always attempt to show an error message to the user
			await interaction
				.followUp({
					content: 'Failed to add role time limit. Please try again.',
					ephemeral: true,
				})
				.catch(() => {}) // Ignore errors
		} catch (e) {
			bunnyLog.error(`Failed to send error response: ${e.message}`)
		}
	}
}

/**
 * Update the existing role time limits message
 */
async function updateRoleTimeLimitsMessage(
	interaction:
		| Discord.ChatInputCommandInteraction
		| Discord.StringSelectMenuInteraction,
	config: PluginResponse<DefaultConfigs['tickets']>
): Promise<void> {
	try {
		// Format current role time limits
		const roleTimeLimits = config.role_time_limits || []

		// Prepare list of limits for display
		let limitsContent = ''
		if (roleTimeLimits.length === 0) {
			limitsContent = '> No role time limits configured yet.'
		} else {
			const limitsPromises = roleTimeLimits.map(async (limit, index) => {
				// Usuwamy nazwę roli w nawiasach, zostawiamy tylko mention
				return `**${index + 1}.** <@&${limit.role_id}>: ${limit.limit}`
			})

			limitsContent = (await Promise.all(limitsPromises)).join('\n')
		}

		// Create action buttons with Back button
		const actionRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId(ROLE_TIME_LIMIT_ADD_BUTTON_ID)
					.setLabel('Add Limit')
					.setStyle(Discord.ButtonStyle.Primary),
				new Discord.ButtonBuilder()
					.setCustomId(ROLE_TIME_LIMIT_REMOVE_BUTTON_ID)
					.setLabel('Remove Limit')
					.setStyle(Discord.ButtonStyle.Danger)
					.setDisabled(roleTimeLimits.length === 0),
				new Discord.ButtonBuilder()
					.setCustomId('ticket_config_back')
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Update the original configuration message
		if (interaction.replied || interaction.deferred) {
			await interaction
				.editReply({
					content: [
						'# Role Time Limits Configuration',
						'',
						'Role time limits allow you to control how frequently users with specific roles can create new tickets.',
						'For example, you can set that users with @Member role can only create a new ticket every 24 hours.',
						'',
						'## Current Limits',
						limitsContent,
						'',
						'## Format',
						'Time limits use the format: `Xm` (minutes), `Xh` (hours), `Xd` (days), or `Xw` (weeks)',
						'Example: `12h` = 12 hours, `3d` = 3 days, `1w` = 1 week',
						'',
						'Use the buttons below to manage role time limits:',
					].join('\n'),
					components: [actionRow],
				})
				.catch((err) => {
					bunnyLog.error(
						`Failed to update role time limits message: ${err.message}`
					)
					throw err // Re-throw for the caller to handle
				})
		} else {
			// This branch should rarely be taken, but just in case the interaction isn't replied to yet
			await interaction
				.reply({
					content: [
						'# Role Time Limits Configuration',
						'',
						'Role time limits allow you to control how frequently users with specific roles can create new tickets.',
						'For example, you can set that users with @Member role can only create a new ticket every 24 hours.',
						'',
						'## Current Limits',
						limitsContent,
						'',
						'## Format',
						'Time limits use the format: `Xm` (minutes), `Xh` (hours), `Xd` (days), or `Xw` (weeks)',
						'Example: `12h` = 12 hours, `3d` = 3 days, `1w` = 1 week',
						'',
						'Use the buttons below to manage role time limits:',
					].join('\n'),
					components: [actionRow],
					ephemeral: true,
				})
				.catch((err) => {
					bunnyLog.error(
						`Failed to send role time limits message: ${err.message}`
					)
					throw err // Re-throw for the caller to handle
				})
		}
	} catch (error) {
		bunnyLog.error('Error updating role time limits message:', error)
		throw error // Re-throw so the caller can try fallback options
	}
}

/**
 * Send an updated role time limits configuration message
 * This is a fallback when the original interaction is not available
 */
async function sendUpdatedRoleTimeLimitsConfig(
	interaction: Discord.ButtonInteraction | Discord.MessageComponentInteraction,
	config: PluginResponse<DefaultConfigs['tickets']>
): Promise<void> {
	try {
		// Format current role time limits
		const roleTimeLimits = config.role_time_limits || []

		// Prepare list of limits for display
		let limitsContent = ''
		if (roleTimeLimits.length === 0) {
			limitsContent = '> No role time limits configured yet.'
		} else {
			const limitsPromises = roleTimeLimits.map(async (limit, index) => {
				// Usuwamy nazwę roli w nawiasach, zostawiamy tylko mention
				return `**${index + 1}.** <@&${limit.role_id}>: ${limit.limit}`
			})

			limitsContent = (await Promise.all(limitsPromises)).join('\n')
		}

		// Create action buttons with Back button
		const actionRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId(ROLE_TIME_LIMIT_ADD_BUTTON_ID)
					.setLabel('Add Limit')
					.setStyle(Discord.ButtonStyle.Primary),
				new Discord.ButtonBuilder()
					.setCustomId(ROLE_TIME_LIMIT_REMOVE_BUTTON_ID)
					.setLabel('Remove Limit')
					.setStyle(Discord.ButtonStyle.Danger)
					.setDisabled(roleTimeLimits.length === 0),
				new Discord.ButtonBuilder()
					.setCustomId('ticket_config_back')
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Send new configuration message as a fallback
		await interaction.followUp({
			content: [
				'# Role Time Limits Configuration',
				'',
				'Role time limits allow you to control how frequently users with specific roles can create new tickets.',
				'For example, you can set that users with @Member role can only create a new ticket every 24 hours.',
				'',
				'## Current Limits',
				limitsContent,
				'',
				'## Format',
				'Time limits use the format: `Xm` (minutes), `Xh` (hours), `Xd` (days), or `Xw` (weeks)',
				'Example: `12h` = 12 hours, `3d` = 3 days, `1w` = 1 week',
				'',
				'Use the buttons below to manage role time limits:',
			].join('\n'),
			components: [actionRow],
			flags: Discord.MessageFlags.Ephemeral,
		})
	} catch (error) {
		bunnyLog.error('Error sending updated role time limits config:', error)
	}
}

// Dodaj funkcję do obsługi przycisku powrotu
async function handleBackToMainConfig(interaction: Discord.ButtonInteraction) {
	// Defer update aby uniknąć timeout'u
	await interaction.deferUpdate().catch((e) => {
		bunnyLog.error(`Failed to defer update in back button: ${e.message}`)
		return // Continue attempt anyway
	})

	try {
		// Pobierz aktualną konfigurację
		const ticketConfig = (await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)) as PluginResponse<DefaultConfigs['tickets']>

		// Utwórz główne menu konfiguracyjne
		const configOptions = [
			{
				label: 'Admin Channel',
				description: 'Set the channel for admin notifications',
				value: 'admin_channel',
			},
			{
				label: 'Transcript Channel',
				description: 'Set the channel for ticket transcripts',
				value: 'transcript_channel',
			},
			{
				label: 'Moderator Roles',
				description: 'Set roles that can manage tickets',
				value: 'mod_roles',
			},
			{
				label: 'Auto-close Settings',
				description: 'Configure auto-closing inactive tickets',
				value: 'auto_close',
			},
			{
				label: 'Role Time Limits',
				description: 'Set time limits between tickets for specific roles',
				value: 'role_time_limits',
			},
		]

		const selectMenu = new Discord.StringSelectMenuBuilder()
			.setCustomId('ticket_config_select')
			.setPlaceholder('Select a configuration option')
			.addOptions(configOptions)

		const row =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				selectMenu
			)

		// Pobierz aktualne wartości do wyświetlenia
		const adminChannel = ticketConfig.admin_channel_id
			? `<#${ticketConfig.admin_channel_id}>`
			: 'Not set'
		const transcriptChannel = ticketConfig.transcript_channel_id
			? `<#${ticketConfig.transcript_channel_id}>`
			: 'Not set'
		const modRoles = ticketConfig.mods_role_ids?.length
			? ticketConfig.mods_role_ids.map((id) => `<@&${id}>`).join(', ')
			: 'None'
		const autoCloseEnabled = ticketConfig.auto_close?.[0]?.enabled
			? '✅ Enabled'
			: '❌ Disabled'
		const autoCloseThreshold = ticketConfig.auto_close?.[0]?.threshold
			? ticketUtils.formatTimeThreshold(ticketConfig.auto_close[0].threshold)
			: 'Not set'

		// Format role time limits for display
		const roleTimeLimits = ticketConfig.role_time_limits?.length
			? `${ticketConfig.role_time_limits.length} roles configured`
			: 'None'

		const configSummary = [
			'# 🎫 Ticket System Configuration',
			'',
			'## Current Settings',
			`**Status:** ${ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`,
			`**Admin Channel:** ${adminChannel}`,
			`**Transcript Channel:** ${transcriptChannel}`,
			`**Moderator Roles:** ${modRoles}`,
			`**Auto-close:** ${autoCloseEnabled} (${autoCloseThreshold})`,
			`**Role Time Limits:** ${roleTimeLimits}`,
			'',
			'## Select an option below to configure:',
		].join('\n')

		// Zaktualizuj panel konfiguracyjny
		await interaction
			.editReply({
				content: configSummary,
				components: [row],
			})
			.catch((e) => {
				bunnyLog.error(`Failed to update main config panel: ${e.message}`)
				throw e
			})
	} catch (error) {
		bunnyLog.error('Error returning to main config:', error)
		await interaction
			.followUp({
				content:
					'Failed to return to main configuration. Please try using the command again.',
				ephemeral: true,
			})
			.catch(() => {}) // Ignore errors here
	}
}

// Add a function to handle the auto-close toggle buttons
async function handleAutoCloseToggle(
	interaction: Discord.ButtonInteraction,
	enable: boolean
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Initialize auto_close array if doesn't exist
		if (!config.auto_close || !Array.isArray(config.auto_close)) {
			config.auto_close = [
				{
					enabled: enable,
					threshold: 72 * 60 * 60 * 1000, // 72 hours default
					reason: 'Ticket automatically closed due to inactivity.',
				},
			]
		} else {
			// Update the enabled status
			config.auto_close[0].enabled = enable
		}

		// Save config
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Update button styles
		const toggleRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_enable')
					.setLabel('Enable')
					.setStyle(
						enable ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary
					)
					.setDisabled(enable), // Disable the Enable button if already enabled
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_disable')
					.setLabel('Disable')
					.setStyle(
						!enable ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary
					)
					.setDisabled(!enable), // Disable the Disable button if already disabled
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_set_reason')
					.setLabel('Set Reason')
					.setStyle(Discord.ButtonStyle.Primary)
			)

		// Get message content
		const message = interaction.message
		if (!message) {
			await interaction.followUp({
				content:
					'Error updating auto-close settings display. The settings were saved.',
				ephemeral: true,
			})
			return
		}

		const content = message.content
		const contentLines = content.split('\n')
		const statusLineIndex = contentLines.findIndex((line) =>
			line.startsWith('**Status:**')
		)

		if (statusLineIndex !== -1) {
			contentLines[statusLineIndex] =
				`**Status:** ${enable ? '✅ Enabled' : '❌ Disabled'}`
		}

		// Identify the original component structure
		// We need to maintain the same layout but update the toggle row
		if (message.components.length >= 3) {
			// Check for timeSelectRow (dropdown)
			const timeSelectComponent = message
				.components[1] as Discord.TopLevelComponent

			// Check for backRow
			const backRow = message.components[2] as Discord.TopLevelComponent

			// Update message with the updated toggle row and preserving the other components
			await interaction.editReply({
				content: contentLines.join('\n'),
				components: [
					toggleRow as unknown as Discord.TopLevelComponent,
					timeSelectComponent,
					backRow,
				],
			})
		} else {
			// Fallback if the component structure is unexpected
			await interaction.editReply({
				content: contentLines.join('\n'),
				components: [toggleRow as unknown as Discord.TopLevelComponent],
			})
		}

		// Confirm to user
		await interaction.followUp({
			content: `Auto-close has been ${enable ? 'enabled ✅' : 'disabled ❌'}.`,
			ephemeral: true,
		})
	} catch (error) {
		bunnyLog.error(
			`Error handling auto-close toggle (${enable ? 'enable' : 'disable'}):`,
			error
		)
		await interaction.followUp({
			content: `Failed to ${enable ? 'enable' : 'disable'} auto-close. Please try again.`,
			ephemeral: true,
		})
	}
}

// Handle auto-close time selection
async function handleAutoCloseTimeSelect(
	interaction: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Handle unit selection
		if (interaction.customId === 'autoclose_time_unit_select') {
			const selectedUnit = interaction.values[0]

			if (selectedUnit === 'predefined') {
				// Show predefined time limit options
				const predefinedOptions = [
					{ label: '30 minutes', value: '30m' },
					{ label: '1 hour', value: '1h' },
					{ label: '12 hours', value: '12h' },
					{ label: '1 day', value: '1d' },
					{ label: '3 days', value: '3d' },
					{ label: '1 week', value: '1w' },
					{ label: '2 weeks', value: '2w' },
				]

				const predefinedSelectRow =
					new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
						new Discord.StringSelectMenuBuilder()
							.setCustomId('autoclose_predefined_select')
							.setPlaceholder('Select a predefined time limit')
							.addOptions(predefinedOptions)
					)

				// Add back buttons
				const backRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						new Discord.ButtonBuilder()
							.setCustomId('autoclose_back')
							.setLabel('Back to Auto-close Settings')
							.setStyle(Discord.ButtonStyle.Secondary),
						new Discord.ButtonBuilder()
							.setCustomId('ticket_config_back')
							.setLabel('Back to Main Menu')
							.setStyle(Discord.ButtonStyle.Secondary)
					)

				await interaction.editReply({
					content:
						'## Set Auto-close Threshold\n\nSelect a predefined time limit:',
					components: [predefinedSelectRow, backRow],
				})
				return
			}

			// For other units, we need to create a value selection menu
			// We'll use selections object similar to what displayTimeValueSelector expects
			const selections = {
				timeUnit: selectedUnit,
			}

			// Use the existing displayTimeValueSelector but customize the content
			// Create options based on the selected time unit
			const options = generateTimeValueOptions(selectedUnit)
			const customId = `autoclose_value_${selectedUnit}`

			// Create the select menu with the options
			const valueSelectRow =
				new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
					new Discord.StringSelectMenuBuilder()
						.setCustomId(customId)
						.setPlaceholder(`Select number of ${selectedUnit}`)
						.addOptions(options)
				)

			// Add back buttons
			const backRow =
				new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					new Discord.ButtonBuilder()
						.setCustomId('autoclose_back')
						.setLabel('Back to Auto-close Settings')
						.setStyle(Discord.ButtonStyle.Secondary),
					new Discord.ButtonBuilder()
						.setCustomId('ticket_config_back')
						.setLabel('Back to Main Menu')
						.setStyle(Discord.ButtonStyle.Secondary)
				)

			// Update the message with the new select menu
			await interaction.editReply({
				content: `## Set Auto-close Threshold\n\n**Time Unit:** ${selectedUnit}\n\nPlease select a value:`,
				components: [valueSelectRow, backRow],
			})
			return
		}

		// Handle predefined time selection
		if (interaction.customId === 'autoclose_predefined_select') {
			const selectedValue = interaction.values[0]
			await handleAutoCloseCustomTime(interaction, selectedValue)
			return
		}

		// Handle value selection for specific time units
		if (interaction.customId.startsWith('autoclose_value_')) {
			const selectedValue = interaction.values[0]
			const timeUnit = interaction.customId.replace('autoclose_value_', '')

			// Add extensive logging to track the issue
			bunnyLog.info('Auto-close time selection details:', {
				selectedValue,
				timeUnit,
				customId: interaction.customId,
				valueType: typeof selectedValue,
				valueLength: selectedValue.length,
				valueChars: Array.from(String(selectedValue)).map(
					(c) => `${c}(${c.charCodeAt(0)})`
				),
			})

			try {
				// For days, we need extra care since this has been problematic
				let timeNumber = 0
				let timeLimitMs = 0

				// Try to handle the value in multiple ways to ensure robustness
				if (selectedValue && typeof selectedValue === 'string') {
					// First try: direct numeric extraction with unit removal
					if (timeUnit === 'days' && selectedValue.endsWith('d')) {
						// For "1d" format values
						const dayNumber = selectedValue.replace('d', '')
						timeNumber = Number(dayNumber)

						bunnyLog.info('Direct day number extraction:', {
							originalValue: selectedValue,
							extractedNumber: dayNumber,
							parsedNumber: timeNumber,
						})
					} else {
						// For any value: extract first number using regex
						const numericMatch = selectedValue.match(/(\d+)/)
						if (numericMatch?.[1]) {
							timeNumber = Number(numericMatch[1])

							bunnyLog.info('Regex number extraction:', {
								originalValue: selectedValue,
								extractedMatch: numericMatch[1],
								parsedNumber: timeNumber,
							})
						}
					}
				}

				// Verify we have a valid number at this point
				if (Number.isNaN(timeNumber) || timeNumber <= 0) {
					// Try one last approach - just try to convert the entire value
					timeNumber = Number(selectedValue)

					if (Number.isNaN(timeNumber) || timeNumber <= 0) {
						throw new Error(
							`Could not extract a valid number from value: ${selectedValue}`
						)
					}
				}

				// Calculate milliseconds based on time unit
				switch (timeUnit) {
					case 'seconds':
						timeLimitMs = timeNumber * 1000
						break
					case 'minutes':
						timeLimitMs = timeNumber * 60 * 1000
						break
					case 'hours':
						timeLimitMs = timeNumber * 60 * 60 * 1000
						break
					case 'days':
						timeLimitMs = timeNumber * 24 * 60 * 60 * 1000
						break
					case 'weeks':
						timeLimitMs = timeNumber * 7 * 24 * 60 * 60 * 1000
						break
					default:
						throw new Error(`Unknown time unit: ${timeUnit}`)
				}

				bunnyLog.info('Final time calculation:', {
					timeNumber,
					timeUnit,
					timeLimitMs,
					formattedTime: ticketUtils.formatTimeThreshold(timeLimitMs),
				})

				// Get current config
				const config = await api.getPluginConfig(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					'tickets'
				)

				// Initialize auto_close array if needed
				if (!config.auto_close || !Array.isArray(config.auto_close)) {
					config.auto_close = [
						{
							enabled: false,
							threshold: timeLimitMs,
							reason: 'Ticket automatically closed due to inactivity.',
						},
					]
				} else {
					// Update threshold
					config.auto_close[0].threshold = timeLimitMs
				}

				// Save config
				await api.updatePluginConfig(
					interaction.client.user.id,
					interaction.guild?.id as Discord.Guild['id'],
					'tickets',
					config
				)

				// Get the formatted threshold for display
				const formattedThreshold = ticketUtils.formatTimeThreshold(timeLimitMs)

				// Create toggle buttons for enabled/disabled with Set Reason in the same row
				const toggleRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						new Discord.ButtonBuilder()
							.setCustomId('autoclose_enable')
							.setLabel('Enable')
							.setStyle(
								config.auto_close[0].enabled
									? Discord.ButtonStyle.Success
									: Discord.ButtonStyle.Secondary
							)
							.setDisabled(config.auto_close[0].enabled), // Disable the Enable button if already enabled
						new Discord.ButtonBuilder()
							.setCustomId('autoclose_disable')
							.setLabel('Disable')
							.setStyle(
								!config.auto_close[0].enabled
									? Discord.ButtonStyle.Danger
									: Discord.ButtonStyle.Secondary
							)
							.setDisabled(!config.auto_close[0].enabled), // Disable the Disable button if already disabled
						new Discord.ButtonBuilder()
							.setCustomId('autoclose_set_reason')
							.setLabel('Set Reason')
							.setStyle(Discord.ButtonStyle.Primary)
					)

				// Create time unit selection menu for threshold
				const timeUnitOptions = [
					{ label: 'Seconds', value: 'seconds' },
					{ label: 'Minutes', value: 'minutes' },
					{ label: 'Hours', value: 'hours' },
					{ label: 'Days', value: 'days' },
					{ label: 'Weeks', value: 'weeks' },
					{ label: 'Predefined Values', value: 'predefined' },
				]

				const timeUnitSelectRow =
					new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
						new Discord.StringSelectMenuBuilder()
							.setCustomId('autoclose_time_unit_select')
							.setPlaceholder('Select time unit for threshold')
							.addOptions(timeUnitOptions)
					)

				// Add back button
				const backRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						new Discord.ButtonBuilder()
							.setCustomId('ticket_config_back')
							.setLabel('Back to Main Menu')
							.setStyle(Discord.ButtonStyle.Secondary)
					)

				// Update the message with auto-close configuration panel
				await interaction.editReply({
					content: [
						'# Auto-close Settings',
						'',
						'Configure when inactive tickets should be automatically closed.',
						'',
						'## Current Settings',
						`**Status:** ${config.auto_close[0].enabled ? '✅ Enabled' : '❌ Disabled'}`,
						`**Threshold:** ${formattedThreshold}`,
						`**Close Reason:** ${config.auto_close[0].reason}`,
						'',
						'Use the controls below to update these settings:',
					].join('\n'),
					components: [toggleRow, timeUnitSelectRow, backRow],
				})

				await interaction.followUp({
					content: `Auto-close threshold updated to ${formattedThreshold}.`,
					ephemeral: true,
				})

				return
			} catch (error) {
				bunnyLog.error('Error processing auto-close time value:', error)

				try {
					// Use a safer fallback approach with a hard-coded default value
					// This ensures the user can still set a time even if parsing fails
					let fallbackTimeMs = 0

					// Set reasonable default for each unit
					switch (timeUnit) {
						case 'days':
							// Default to 3 days if we're working with days
							fallbackTimeMs = 3 * 24 * 60 * 60 * 1000
							break
						case 'hours':
							// Default to 24 hours
							fallbackTimeMs = 24 * 60 * 60 * 1000
							break
						case 'minutes':
							// Default to 60 minutes
							fallbackTimeMs = 60 * 60 * 1000
							break
						default:
							// Default to 3 days for any other unit
							fallbackTimeMs = 3 * 24 * 60 * 60 * 1000
					}

					// Log that we're using a fallback
					bunnyLog.info('Using fallback time value:', {
						timeUnit,
						fallbackTimeMs,
						formattedFallback: ticketUtils.formatTimeThreshold(fallbackTimeMs),
					})

					// Get current config
					const config = await api.getPluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets'
					)

					// Initialize or update config with fallback value
					if (!config.auto_close || !Array.isArray(config.auto_close)) {
						config.auto_close = [
							{
								enabled: false,
								threshold: fallbackTimeMs,
								reason: 'Ticket automatically closed due to inactivity.',
							},
						]
					} else {
						// Update threshold with fallback
						config.auto_close[0].threshold = fallbackTimeMs
					}

					// Save config
					await api.updatePluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets',
						config
					)

					// Create UI components as before
					const formattedThreshold =
						ticketUtils.formatTimeThreshold(fallbackTimeMs)

					// Create toggle buttons for enabled/disabled with Set Reason in the same row
					const toggleRow =
						new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
							new Discord.ButtonBuilder()
								.setCustomId('autoclose_enable')
								.setLabel('Enable')
								.setStyle(
									config.auto_close[0].enabled
										? Discord.ButtonStyle.Success
										: Discord.ButtonStyle.Secondary
								)
								.setDisabled(config.auto_close[0].enabled),
							new Discord.ButtonBuilder()
								.setCustomId('autoclose_disable')
								.setLabel('Disable')
								.setStyle(
									!config.auto_close[0].enabled
										? Discord.ButtonStyle.Danger
										: Discord.ButtonStyle.Secondary
								)
								.setDisabled(!config.auto_close[0].enabled),
							new Discord.ButtonBuilder()
								.setCustomId('autoclose_set_reason')
								.setLabel('Set Reason')
								.setStyle(Discord.ButtonStyle.Primary)
						)

					// Create time unit selection menu for threshold
					const timeUnitOptions = [
						{ label: 'Seconds', value: 'seconds' },
						{ label: 'Minutes', value: 'minutes' },
						{ label: 'Hours', value: 'hours' },
						{ label: 'Days', value: 'days' },
						{ label: 'Weeks', value: 'weeks' },
						{ label: 'Predefined Values', value: 'predefined' },
					]

					const timeUnitSelectRow =
						new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
							new Discord.StringSelectMenuBuilder()
								.setCustomId('autoclose_time_unit_select')
								.setPlaceholder('Select time unit for threshold')
								.addOptions(timeUnitOptions)
						)

					// Add back button
					const backRow =
						new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
							new Discord.ButtonBuilder()
								.setCustomId('ticket_config_back')
								.setLabel('Back to Main Menu')
								.setStyle(Discord.ButtonStyle.Secondary)
						)

					// Update the message with auto-close configuration panel
					await interaction.editReply({
						content: [
							'# Auto-close Settings',
							'',
							'Configure when inactive tickets should be automatically closed.',
							'',
							'## Current Settings',
							`**Status:** ${config.auto_close[0].enabled ? '✅ Enabled' : '❌ Disabled'}`,
							`**Threshold:** ${formattedThreshold}`,
							`**Close Reason:** ${config.auto_close[0].reason}`,
							'',
							'Use the controls below to update these settings:',
						].join('\n'),
						components: [toggleRow, timeUnitSelectRow, backRow],
					})

					await interaction.followUp({
						content: `Auto-close threshold updated to ${formattedThreshold}. (We used a default value because of an input error)`,
						ephemeral: true,
					})

					return
				} catch (fallbackError) {
					bunnyLog.error('Even fallback handling failed:', fallbackError)
					// Continue to the normal error message
				}

				await interaction.followUp({
					content:
						'Failed to update auto-close time threshold. Please try again with a different value.',
					ephemeral: true,
				})
			}
			return
		}

		// Original implementation for backward compatibility
		const selectedValue = interaction.values[0]

		// If custom is selected, show a modal for input
		if (selectedValue === 'custom') {
			// Show a modal for custom input
			const modal = new Discord.ModalBuilder()
				.setCustomId('autoclose_custom_time_modal')
				.setTitle('Custom Time Threshold')

			const timeInput = new Discord.TextInputBuilder()
				.setCustomId('custom_time_input')
				.setLabel('Enter time (e.g. 36h, 4d, 1.5w)')
				.setStyle(Discord.TextInputStyle.Short)
				.setRequired(true)

			const actionRow =
				new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
					timeInput
				)

			modal.addComponents(actionRow)

			await interaction.showModal(modal)
			return
		}

		// Otherwise, process the selected time directly
		await handleAutoCloseCustomTime(interaction, selectedValue)
	} catch (error) {
		bunnyLog.error('Error handling auto-close time selection:', error)
		await interaction.followUp({
			content: 'Failed to update auto-close time threshold. Please try again.',
			ephemeral: true,
		})
	}
}

// Handle setting auto-close reason button
async function handleSetAutoCloseReason(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	try {
		// Get current config to show existing reason
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		const currentReason =
			config.auto_close?.[0]?.reason ||
			'Ticket automatically closed due to inactivity.'

		// Create the modal
		const modal = new Discord.ModalBuilder()
			.setCustomId('autoclose_reason_modal')
			.setTitle('Auto-close Reason')

		const reasonInput = new Discord.TextInputBuilder()
			.setCustomId('autoclose_reason_input')
			.setLabel('Enter the reason for auto-closing tickets')
			.setStyle(Discord.TextInputStyle.Paragraph)
			.setValue(currentReason)
			.setRequired(true)

		const actionRow =
			new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
				reasonInput
			)

		modal.addComponents(actionRow)

		await interaction.showModal(modal)
	} catch (error) {
		bunnyLog.error('Error showing auto-close reason modal:', error)
		await interaction.followUp({
			content: 'Failed to open reason setting form. Please try again.',
			ephemeral: true,
		})
	}
}

// Handle auto-close custom time value (from both direct selection and modal input)
async function handleAutoCloseCustomTime(
	interaction:
		| Discord.StringSelectMenuInteraction
		| Discord.ModalSubmitInteraction,
	timeValue: string
): Promise<void> {
	try {
		if (interaction.isModalSubmit()) {
			await interaction.deferUpdate()
		}

		// Use the shared parsing function
		const timeLimitMs = parseTimeValue(timeValue)

		// Return error if all parsing methods failed
		if (timeLimitMs === 0) {
			await interaction.followUp({
				content: `Invalid time format: "${timeValue}". Please use formats like 12h, 3d, or 1w.`,
				ephemeral: true,
			})
			return
		}

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Initialize auto_close array if needed
		if (!config.auto_close || !Array.isArray(config.auto_close)) {
			config.auto_close = [
				{
					enabled: false,
					threshold: timeLimitMs,
					reason: 'Ticket automatically closed due to inactivity.',
				},
			]
		} else {
			// Update threshold
			config.auto_close[0].threshold = timeLimitMs
		}

		// Save config
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Get the formatted threshold for display
		const formattedThreshold = ticketUtils.formatTimeThreshold(timeLimitMs)

		// Create toggle buttons for enabled/disabled with Set Reason in the same row
		const toggleRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_enable')
					.setLabel('Enable')
					.setStyle(
						config.auto_close[0].enabled
							? Discord.ButtonStyle.Success
							: Discord.ButtonStyle.Secondary
					)
					.setDisabled(config.auto_close[0].enabled), // Disable the Enable button if already enabled
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_disable')
					.setLabel('Disable')
					.setStyle(
						!config.auto_close[0].enabled
							? Discord.ButtonStyle.Danger
							: Discord.ButtonStyle.Secondary
					)
					.setDisabled(!config.auto_close[0].enabled), // Disable the Disable button if already disabled
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_set_reason')
					.setLabel('Set Reason')
					.setStyle(Discord.ButtonStyle.Primary)
			)

		// Create time unit selection menu for threshold
		const timeUnitOptions = [
			{ label: 'Seconds', value: 'seconds' },
			{ label: 'Minutes', value: 'minutes' },
			{ label: 'Hours', value: 'hours' },
			{ label: 'Days', value: 'days' },
			{ label: 'Weeks', value: 'weeks' },
			{ label: 'Predefined Values', value: 'predefined' },
		]

		const timeUnitSelectRow =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				new Discord.StringSelectMenuBuilder()
					.setCustomId('autoclose_time_unit_select')
					.setPlaceholder('Select time unit for threshold')
					.addOptions(timeUnitOptions)
			)

		// Add back button
		const backRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('ticket_config_back')
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Update the message with auto-close configuration panel
		await interaction.editReply({
			content: [
				'# Auto-close Settings',
				'',
				'Configure when inactive tickets should be automatically closed.',
				'',
				'## Current Settings',
				`**Status:** ${config.auto_close[0].enabled ? '✅ Enabled' : '❌ Disabled'}`,
				`**Threshold:** ${formattedThreshold}`,
				`**Close Reason:** ${config.auto_close[0].reason}`,
				'',
				'Use the controls below to update these settings:',
			].join('\n'),
			components: [toggleRow, timeUnitSelectRow, backRow],
		})

		await interaction.followUp({
			content: `Auto-close threshold updated to ${formattedThreshold}.`,
			ephemeral: true,
		})
	} catch (error) {
		bunnyLog.error('Error updating auto-close time:', error)
		await interaction.followUp({
			content: 'Failed to update auto-close time threshold. Please try again.',
			ephemeral: true,
		})
	}
}

// Handle auto-close reason modal submission
async function handleAutoCloseReasonModal(
	interaction: Discord.ModalSubmitInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Get the submitted reason
		const reason = interaction.fields.getTextInputValue(
			'autoclose_reason_input'
		)

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Initialize auto_close array if needed
		if (!config.auto_close || !Array.isArray(config.auto_close)) {
			config.auto_close = [
				{
					enabled: false,
					threshold: 72 * 60 * 60 * 1000, // 72 hours default
					reason: reason,
				},
			]
		} else {
			// Update reason
			config.auto_close[0].reason = reason
		}

		// Save config
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Get the formatted threshold for display
		const formattedThreshold = ticketUtils.formatTimeThreshold(
			config.auto_close[0].threshold
		)

		// Create toggle buttons for enabled/disabled with Set Reason in the same row
		const toggleRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_enable')
					.setLabel('Enable')
					.setStyle(
						config.auto_close[0].enabled
							? Discord.ButtonStyle.Success
							: Discord.ButtonStyle.Secondary
					)
					.setDisabled(config.auto_close[0].enabled), // Disable the Enable button if already enabled
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_disable')
					.setLabel('Disable')
					.setStyle(
						!config.auto_close[0].enabled
							? Discord.ButtonStyle.Danger
							: Discord.ButtonStyle.Secondary
					)
					.setDisabled(!config.auto_close[0].enabled), // Disable the Disable button if already disabled
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_set_reason')
					.setLabel('Set Reason')
					.setStyle(Discord.ButtonStyle.Primary)
			)

		// Create time unit selection menu for threshold
		const timeUnitOptions = [
			{ label: 'Seconds', value: 'seconds' },
			{ label: 'Minutes', value: 'minutes' },
			{ label: 'Hours', value: 'hours' },
			{ label: 'Days', value: 'days' },
			{ label: 'Weeks', value: 'weeks' },
			{ label: 'Predefined Values', value: 'predefined' },
		]

		const timeUnitSelectRow =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				new Discord.StringSelectMenuBuilder()
					.setCustomId('autoclose_time_unit_select')
					.setPlaceholder('Select time unit for threshold')
					.addOptions(timeUnitOptions)
			)

		// Add back button
		const backRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('ticket_config_back')
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Update the message with auto-close configuration panel
		await interaction.editReply({
			content: [
				'# Auto-close Settings',
				'',
				'Configure when inactive tickets should be automatically closed.',
				'',
				'## Current Settings',
				`**Status:** ${config.auto_close[0].enabled ? '✅ Enabled' : '❌ Disabled'}`,
				`**Threshold:** ${formattedThreshold}`,
				`**Close Reason:** ${reason}`,
				'',
				'Use the controls below to update these settings:',
			].join('\n'),
			components: [toggleRow, timeUnitSelectRow, backRow],
		})

		await interaction.followUp({
			content: 'Auto-close reason updated successfully.',
			ephemeral: true,
		})
	} catch (error) {
		bunnyLog.error('Error updating auto-close reason:', error)
		await interaction.followUp({
			content: 'Failed to update auto-close reason. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Shared helper function to generate time value options for selectors
 * Used by both auto-close and role time limit functionality
 * @param timeUnit - The time unit to generate options for (seconds, minutes, hours, days, weeks)
 * @returns Array of options for select menu
 */
function generateTimeValueOptions(
	timeUnit: string
): Array<{ label: string; value: string }> {
	const options: Array<{ label: string; value: string }> = []

	switch (timeUnit) {
		case 'seconds': {
			// Add options for seconds at 5-second intervals (max 25 options)
			for (let i = 5; i <= 60; i += 5) {
				options.push({
					label: `${i} seconds`,
					value: `${i}s`, // Include the 's' unit directly in the value
				})
			}
			break
		}

		case 'minutes': {
			// Add options for minutes at intervals (max 25 options)
			const minuteValues = [
				1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60,
			]
			for (const i of minuteValues) {
				options.push({
					label: `${i} minutes`,
					value: `${i}m`, // Include the 'm' unit directly in the value
				})
			}
			break
		}

		case 'hours': {
			// Add selected hour options within 25 option limit
			const hourValues = [1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72]
			for (const i of hourValues) {
				options.push({
					label: `${i} hours`,
					value: `${i}h`, // Include the 'h' unit directly in the value
				})
			}
			break
		}

		case 'days': {
			// Add selected day options within 25 option limit
			const dayValues = [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30]
			for (const i of dayValues) {
				// Ensure we use template literals without hidden characters
				const dayValue = `${i}d`
				options.push({
					label: `${i} days`,
					value: dayValue,
				})
			}
			break
		}

		case 'weeks': {
			// Add options 1-4 weeks with proper formatted values
			for (let i = 1; i <= 4; i++) {
				options.push({
					label: `${i} weeks`,
					value: `${i}w`, // Include the 'w' unit directly in the value
				})
			}
			break
		}

		case 'months': {
			// Add options 1-12 months - use simple format to match original code
			for (let i = 1; i <= 12; i++) {
				options.push({
					label: `${i} months`,
					value: `${i}`,
				})
			}
			break
		}

		case 'years': {
			// Add options 1-10 years - use simple format to match original code
			for (let i = 1; i <= 10; i++) {
				options.push({
					label: `${i} years`,
					value: `${i}`,
				})
			}
			break
		}

		case 'never': {
			// Add never option
			options.push({ label: 'Never', value: 'never' })
			break
		}
	}

	return options
}

/**
 * Shared helper function to parse time values from user input
 * Used by both auto-close and role time limit functionality
 * @param timeValue - The time value string to parse
 * @returns The time value in milliseconds
 */
function parseTimeValue(timeValue: string): number {
	// Ensure the time value has a clean format before parsing
	// Extract the numeric part and unit with a more flexible regex
	const cleanTimeRegex = /(\d+)\s*([smhdwy])/i
	const cleanMatch = String(timeValue || '').match(cleanTimeRegex)

	let cleanedTimeValue = timeValue
	if (cleanMatch) {
		const [_, value, unit] = cleanMatch
		cleanedTimeValue = `${value}${unit.toLowerCase()}`
	} else {
		// If no match with standard regex, try handling just a plain number
		// or check if there's a number anywhere in the string
		const justNumberMatch = String(timeValue || '').match(/(\d+)/)
		if (justNumberMatch?.[1]) {
			// If we just got a number without a unit, default to days (most common use case)
			// This helps when dropdown selections don't include the unit in the value
			cleanedTimeValue = `${justNumberMatch[1]}d`
		}
	}

	// Parse the time value with the cleaned format
	let timeLimitMs = ticketUtils.parseTimeLimit(cleanedTimeValue)

	// If parsing failed, try a more direct approach for specific units
	if (timeLimitMs === 0 && timeValue) {
		// Try a direct conversion for days
		const timeValueStr = String(timeValue)
		if (timeValueStr.includes('d')) {
			const dayMatch = timeValueStr.match(/(\d+)\s*d/i)
			if (dayMatch?.[1]) {
				const days = Number(dayMatch[1])
				if (!Number.isNaN(days) && days > 0) {
					timeLimitMs = days * 24 * 60 * 60 * 1000
				}
			}
		}
	}

	return timeLimitMs
}

/**
 * Shared helper function to create a time unit selection dropdown
 * Used by both auto-close and role time limit functionality
 * @param customId - The custom ID for the select menu
 * @param includePredefined - Whether to include predefined values option
 * @returns The select menu row component
 */
function createTimeUnitSelector(
	customId: string,
	includePredefined = true
): Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder> {
	// Create time unit selection options
	const timeUnitOptions = [
		{ label: 'Seconds', value: 'seconds' },
		{ label: 'Minutes', value: 'minutes' },
		{ label: 'Hours', value: 'hours' },
		{ label: 'Days', value: 'days' },
		{ label: 'Weeks', value: 'weeks' },
	]

	// Add predefined option if requested
	if (includePredefined) {
		timeUnitOptions.push({ label: 'Predefined Values', value: 'predefined' })
	}

	// Create and return the select menu
	return new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
		new Discord.StringSelectMenuBuilder()
			.setCustomId(customId)
			.setPlaceholder('Select time unit')
			.addOptions(timeUnitOptions)
	)
}
