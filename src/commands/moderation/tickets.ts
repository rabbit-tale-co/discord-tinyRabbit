import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import * as utils from '@/utils/index.js'
import { bunnyLog } from 'bunny-log'
import type { ThreadMetadata, TicketConfig } from '@/types/tickets.js'
import { TicketDisplayMode } from '@/types/plugins.js'
import type { TicketTemplates, ComponentsV2, API } from '@/types/plugins.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'
import * as ticketsUtils from '@/utils/tickets.js'
import {
	UI_BUILDERS,
	CONTENT_BUILDERS,
	formatTimeThreshold,
	createAutoCloseSettingsComponents,
	getDefaultAutoCloseSettings,
	getAutoCloseSettings,
} from '@/utils/tickets.js'

/**
 * TODO:
 * - Refactor the code to be more readable and modular
 */

// Create a reference to the thread metadata store from tickets.ts
// This is a workaround since we can't directly access the variable from the module
const thread_metadata_store = new Map<string, ExtendedThreadMetadata>()
const ACTIVITY_CHECK_INTERVAL = 60 * 1000 // Check every minute (for testing)
const INACTIVITY_THRESHOLD = 72 * 60 * 60 * 1000 // 72 hours (3 days) of inactivity

const COMPONENT_IDS = Object.freeze({
	ROLE_TIME_LIMIT_ADD_BUTTON_ID: 'add_role_time_limit_component',
	ROLE_TIME_LIMIT_REMOVE_BUTTON_ID: 'remove_role_time_limit',
	ROLE_TIME_LIMIT_REMOVE_SELECT_ID: 'remove_role_time_limit_select',
})

/* Preserve the original constant names for external imports */
export const ROLE_TIME_LIMIT_ADD_BUTTON_ID =
	COMPONENT_IDS.ROLE_TIME_LIMIT_ADD_BUTTON_ID
export const ROLE_TIME_LIMIT_REMOVE_BUTTON_ID =
	COMPONENT_IDS.ROLE_TIME_LIMIT_REMOVE_BUTTON_ID
export const ROLE_TIME_LIMIT_REMOVE_SELECT_ID =
	COMPONENT_IDS.ROLE_TIME_LIMIT_REMOVE_SELECT_ID

/**
 * Check if a user can open a ticket based on role time limits
 * @param interaction - The interaction to check
 * @param config - The tickets plugin configuration
 * @returns An object indicating if the user can open a ticket and if not, when they can
 */
async function canUserOpenTicket(
	interaction: Discord.ButtonInteraction,
	config: PluginResponse<DefaultConfigs['tickets']>
): Promise<{ canOpen: boolean; nextAllowedTime?: number; timeLimit?: string }> {
	// Default response when user can open a ticket
	const allowOpenTicket = { canOpen: true }

	// Skip role time limit checks if no limits are configured
	if (!config.role_time_limits?.length) {
		return allowOpenTicket
	}

	// Get the member's roles
	const member = interaction.member as Discord.GuildMember
	if (!member) return allowOpenTicket

	// Admins can always open tickets regardless of time limits
	const hasAdminPermission =
		member.permissions.has(Discord.PermissionFlagsBits.Administrator) ||
		member.permissions.has(Discord.PermissionFlagsBits.ManageGuild)
	if (hasAdminPermission) {
		return allowOpenTicket
	}

	// Get the user's existing tickets
	const tickets = await api.getUserTickets(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		interaction.user.id
	)

	// No previous tickets means no time limit to enforce
	if (!tickets?.length) return allowOpenTicket

	// Find the latest ticket by open_time
	const latestTicket = tickets.reduce(
		(latest, current) =>
			!latest || current.open_time > latest.open_time ? current : latest,
		null
	)

	// No valid latest ticket with open_time
	if (!latestTicket?.open_time) return allowOpenTicket

	// Find the strictest time limit that applies to this user based on roles
	const strictestLimit = findStrictestTimeLimit(member, config.role_time_limits)
	if (!strictestLimit) return allowOpenTicket

	// Calculate when the user can open a new ticket
	const nextAllowedTime =
		latestTicket.open_time * 1000 + strictestLimit.milliseconds
	const currentTime = Date.now()
	const canOpen = currentTime >= nextAllowedTime

	// Log the time limit check results for debugging
	logTimeCheckResults(
		interaction.user.id,
		member,
		config.role_time_limits,
		latestTicket.open_time,
		strictestLimit,
		nextAllowedTime,
		currentTime,
		canOpen
	)

	// Return whether they can open and when they'll be allowed to if not
	return {
		canOpen,
		nextAllowedTime,
		timeLimit: strictestLimit.limit,
	}
}

/**
 * Find the strictest (shortest) time limit that applies to a member
 * @param member - The guild member to check
 * @param roleLimits - The role time limits configuration
 * @returns The strictest limit or null if none apply
 */
function findStrictestTimeLimit(
	member: Discord.GuildMember,
	roleLimits: Array<{ role_id: string; limit: string }>
): { limit: string; milliseconds: number } | null {
	let strictestLimit: { limit: string; milliseconds: number } | null = null

	for (const roleLimit of roleLimits) {
		if (member.roles.cache.has(roleLimit.role_id)) {
			const limitMs = ticketsUtils.parseTimeLimit(roleLimit.limit)
			if (!strictestLimit || limitMs < strictestLimit.milliseconds) {
				strictestLimit = {
					limit: roleLimit.limit,
					milliseconds: limitMs,
				}
			}
		}
	}

	return strictestLimit
}

/**
 * Log the results of a time limit check for debugging
 */
function logTimeCheckResults(
	userId: string,
	member: Discord.GuildMember,
	roleLimits: Array<{ role_id: string; limit: string }>,
	latestTicketTime: number,
	strictestLimit: { limit: string; milliseconds: number },
	nextAllowedTime: number,
	currentTime: number,
	canOpen: boolean
): void {
	bunnyLog.info('Ticket time limit check', {
		user_id: userId,
		has_roles: Array.from(member.roles.cache.keys()),
		time_limit_role: {
			role_id: roleLimits.find((r) => member.roles.cache.has(r.role_id))
				?.role_id,
			limit: strictestLimit.limit,
		},
		latest_ticket_time: new Date(latestTicketTime * 1000).toISOString(),
		next_allowed_time: new Date(nextAllowedTime).toISOString(),
		current_time: new Date(currentTime).toISOString(),
		can_open: canOpen,
	})
}

/**
 * Replace placeholders in a string with values from a dictionary
 * @param text - The string to replace placeholders in
 * @param placeholders - The dictionary of placeholders and their values
 * @returns The string with placeholders replaced
 */
function replacePlaceholders(
	text: string,
	placeholders: Record<string, string | number>
): string {
	if (!text) return text

	return text.replace(/\\?\{(\w+)}/g, (match, key) =>
		// keep escaped tokens and unknown keys intact
		match.startsWith('\\') || !(key in placeholders)
			? match.replace(/^\\/, '') // strip the escape backslash
			: String(placeholders[key])
	)
}

/**
 * The configuration for the ticket embed
 */
interface TicketEmbedConfig extends Discord.EmbedData {
	buttons_map?: Array<{
		unique_id: string
		label: string
		style: Discord.ButtonStyle
		url?: string
	}>
}

/**
 * Creates an embed with placeholders and buttons
 * @param embed_config - The embed configuration
 * @param placeholders - The placeholders to replace in the embed
 * @returns The embed and action rows
 */
const createEmbed = (
	embed_config: TicketEmbedConfig,
	placeholders: Record<string, string | number>
): {
	embed: Discord.EmbedBuilder
	action_rows: Discord.ActionRowBuilder<
		Discord.ButtonBuilder | Discord.StringSelectMenuBuilder
	>[]
} => {
	// Process embed config
	const processed_config = {
		...embed_config,
		title:
			embed_config.title &&
			replacePlaceholders(embed_config.title, placeholders),
		description:
			embed_config.description &&
			replacePlaceholders(embed_config.description, placeholders),
		fields: embed_config.fields?.map((field) => ({
			name: replacePlaceholders(field.name, placeholders),
			value: replacePlaceholders(field.value, placeholders),
			inline: field.inline,
		})),
		footer:
			embed_config.footer &&
			(typeof embed_config.footer === 'string'
				? { text: replacePlaceholders(embed_config.footer, placeholders) }
				: {
						text: replacePlaceholders(embed_config.footer.text, placeholders),
						iconURL: embed_config.footer.iconURL,
					}),
	}

	// Create the embed
	const embed = new Discord.EmbedBuilder(processed_config)

	// Create the action rows
	const action_rows: Discord.ActionRowBuilder<
		Discord.ButtonBuilder | Discord.StringSelectMenuBuilder
	>[] = []

	// Process buttons or select menu based on the number of buttons available
	if (embed_config.buttons_map?.length) {
		if (embed_config.buttons_map.length > 3) {
			// Create a dropdown (select menu) for more than 3 buttons
			const selectMenu = new Discord.StringSelectMenuBuilder()
				.setCustomId(
					`${embed_config.buttons_map[0].unique_id}_${placeholders.thread_id || 'main'}`
				)
				.setPlaceholder('Select an option')
				.setMinValues(1)
				.setMaxValues(1)
			// Convert each button into a select menu option
			const options = embed_config.buttons_map.map((button, index) => ({
				label: button.label,
				value: `${button.unique_id}_${placeholders.thread_id || 'main'}_${index}`,
			}))
			selectMenu.setOptions(options)

			// Add the select menu to a new action row
			const selectRow =
				new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
					selectMenu
				)
			action_rows.push(selectRow)
		} else {
			// Use individual buttons for 3 or fewer options
			let current_row = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
			embed_config.buttons_map.forEach((button, index) => {
				const button_builder = createButton(button, placeholders, index)
				if (button_builder) {
					if (current_row.components.length >= 3) {
						action_rows.push(current_row)
						current_row = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
					}
					current_row.addComponents(button_builder)
				}
			})
			if (current_row.components.length > 0) {
				action_rows.push(current_row)
			}
		}
	}

	// Return the embed and action rows
	return { embed, action_rows }
}

/**
 * Creates a button with placeholders
 * @param button - The button configuration
 * @param placeholders - The placeholders to replace in the button
 * @param index - The index of the button
 * @returns The button builder or null if the button is not valid
 */
const createButton = (
	button: NonNullable<TicketEmbedConfig['buttons_map']>[number],
	placeholders: Record<string, string | number>,
	index: number
): Discord.ButtonBuilder | null => {
	// Check if the button is a link button
	if (button.style === Discord.ButtonStyle.Link) {
		// Check if the button has a URL
		if (!button.url) return null

		// Create a button with the URL
		return new Discord.ButtonBuilder()
			.setLabel(button.label)
			.setStyle(button.style)
			.setURL(replacePlaceholders(button.url, placeholders))
	}

	// Create a button with the custom ID
	return new Discord.ButtonBuilder()
		.setCustomId(
			`${button.unique_id}_${placeholders.thread_id || 'main'}_${index}`
		)
		.setLabel(button.label)
		.setStyle(button.style)
}

/**
 * Sends a ticket message to a specified channel
 * @param interaction - The interaction to respond to
 */
async function sendEmbed(interaction: Discord.ChatInputCommandInteraction) {
	// Defer the reply
	await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	// Get the target channel
	const target_channel = interaction.options.getChannel(
		'channel'
	) as Discord.TextChannel

	// Check if the channel is a valid text channel
	if (!target_channel?.isTextBased()) {
		// If the channel is not a valid text channel, send an error
		await utils.handleResponse(
			interaction,
			'error',
			'The specified channel is not a valid text channel. Please select a text channel where messages can be sent.',
			{
				code: 'SE002',
			}
		)
		return
	}

	// Get the plugin config
	const config = await api.getPluginConfig(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		'tickets'
	)

	// Check if the config is valid
	if (!config) {
		await utils.handleResponse(
			interaction,
			'warning',
			'No configuration found for the tickets plugin.',
			{
				code: 'SE003',
			}
		)
		return
	}

	// Get the type option from the command
	const specifiedType = interaction.options.getString(
		'type'
	) as TicketDisplayMode

	// If type is specified in the command, update the component configuration
	if (
		specifiedType &&
		(specifiedType === TicketDisplayMode.Text ||
			specifiedType === TicketDisplayMode.Embed)
	) {
		// Make sure components and open_ticket exist
		if (!config.components) {
			config.components = {}
		}

		if (!config.components.open_ticket) {
			config.components.open_ticket = {
				type: specifiedType,
				components: [],
			}
		} else {
			// Update the type in the existing component
			config.components.open_ticket.type = specifiedType
		}

		// If type is embed but no embed is defined, try to use legacy embed
		if (
			specifiedType === TicketDisplayMode.Embed &&
			!config.components.open_ticket.embed &&
			config.embeds?.open_ticket
		) {
			config.components.open_ticket.embed = config.embeds.open_ticket
		}
	}

	// Get the placeholders
	const placeholders = {
		user: interaction.user.toString(),
		guild_name: interaction.guild?.name || 'Server',
		guild_id: interaction.guild?.id || '',
	}

	try {
		// Get the actual type that will be used
		const usedType = config.components?.open_ticket?.type || 'default'

		// Log what we're about to send
		bunnyLog.info('Sending ticket message', {
			type: usedType,
			has_embed: !!config.components?.open_ticket?.embed,
			has_components: !!config.components?.open_ticket?.components,
		})

		// Create message options based on component-based or embed-based format
		const messageOptions = await createTicketMessage(
			config,
			'open_ticket',
			placeholders
		)

		// Send the message to the target channel
		const sentMessage = await target_channel.send(messageOptions)

		// Send a success message with details
		await utils.handleResponse(
			interaction,
			'success',
			`Ticket message sent successfully using ${usedType} template. [Jump to message](${sentMessage.url})`,
			{
				code: 'SE001',
			}
		)
	} catch (error) {
		// Log the error
		bunnyLog.error('Error sending ticket message:', error)

		// Send an error message
		await utils.handleResponse(
			interaction,
			'error',
			"Failed to send the message. Please check the bot's permissions in the target channel and try again.",
			{
				code: 'SE001',
			}
		)
	}
}

/**
 * Opens a ticket
 * @param interaction - The interaction to open the ticket
 */
async function openTicket(interaction: Discord.ButtonInteraction) {
	try {
		// Check if the interaction is in a guild
		if (!interaction.guild) {
			// Send an error if the interaction is not in a guild
			await utils.handleResponse(
				interaction,
				'error',
				'This command can only be used in a server.',
				{
					code: 'OT005',
				}
			)

			return
		}

		// Defer the reply if not already deferred
		if (!interaction.deferred && !interaction.replied) {
			await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })
		}

		// Get the plugin config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Check if the config is valid
		if (!config) {
			// Send an error if the config is not valid
			await utils.handleResponse(
				interaction,
				'error',
				'No configuration found for the tickets plugin.',
				{
					code: 'SE003',
				}
			)
			return
		}

		// Check if the feature is enabled
		if (!config.enabled) {
			await utils.handleResponse(
				interaction,
				'error',
				'The tickets feature is currently disabled on this server.',
				{
					code: 'OT002',
				}
			)
			return
		}

		// EARLY CHECK: Get user's existing tickets to check if they've recently created one
		if (config.role_time_limits && config.role_time_limits.length > 0) {
			const member = interaction.member as Discord.GuildMember
			const userTickets = await api.getUserTickets(
				interaction.client.user.id,
				interaction.guild?.id as Discord.Guild['id'],
				interaction.user.id
			)

			// Skip the time limit check if no tickets were found
			if (!userTickets || userTickets.length === 0) {
				// User has no previous tickets, proceed with creating a new one
				console.log('No previous tickets found for user, allowing creation')
			} else {
				// Find applicable time limit for this user
				let strictestLimit: { limit: string; milliseconds: number } | null =
					null
				for (const roleLimit of config.role_time_limits) {
					if (member.roles.cache.has(roleLimit.role_id)) {
						const limitMs = ticketsUtils.parseTimeLimit(roleLimit.limit)
						if (!strictestLimit || limitMs < strictestLimit.milliseconds) {
							strictestLimit = {
								limit: roleLimit.limit,
								milliseconds: limitMs,
							}
						}
					}
				}

				// If user has a time limit role and previous tickets
				if (strictestLimit && userTickets.length > 0) {
					// Get the most recent ticket
					const latestTicket = userTickets.reduce((latest, current) => {
						return !latest || current.open_time > latest.open_time
							? current
							: latest
					}, userTickets[0])

					// Only apply time limit if the ticket has a valid open_time
					if (latestTicket.open_time && latestTicket.open_time > 0) {
						// Calculate when they can create a new ticket
						const nextAllowedTime =
							latestTicket.open_time * 1000 + strictestLimit.milliseconds
						const currentTime = Date.now()

						// If they can't create a ticket yet, block them
						if (currentTime < nextAllowedTime) {
							await utils.handleResponse(
								interaction,
								'warning',
								`You cannot open a new ticket yet. Based on your roles, you need to wait ${strictestLimit.limit} between tickets. You can open a new ticket <t:${Math.floor(nextAllowedTime / 1000)}:R>.`,
								{
									code: 'OT013',
								}
							)
							return
						}
					}
				}
			}
		}

		// Additional check for recently created tickets in memory
		// Find recent tickets for this user in the local cache
		const oneHourAgo = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago in seconds
		const recentTickets = Array.from(thread_metadata_store.entries()).filter(
			([_, metadata]) =>
				metadata.opened_by?.id === interaction.user.id &&
				metadata.open_time > oneHourAgo
		)

		if (
			recentTickets.length > 0 &&
			config.role_time_limits &&
			config.role_time_limits.length > 0
		) {
			// Get the most recent ticket
			const mostRecentTicket = recentTickets.reduce(
				(latest, [_, metadata]) =>
					!latest || metadata.open_time > latest.open_time ? metadata : latest,
				null as ExtendedThreadMetadata | null
			)

			if (mostRecentTicket?.open_time) {
				// Get the member's roles
				const member = interaction.member as Discord.GuildMember
				let strictestLimit: { limit: string; milliseconds: number } | null =
					null

				// Find applicable time limit
				for (const roleLimit of config.role_time_limits) {
					if (member.roles.cache.has(roleLimit.role_id)) {
						const limitMs = ticketsUtils.parseTimeLimit(roleLimit.limit)
						if (!strictestLimit || limitMs < strictestLimit.milliseconds) {
							strictestLimit = {
								limit: roleLimit.limit,
								milliseconds: limitMs,
							}
						}
					}
				}

				if (strictestLimit) {
					const nextAllowedTime =
						mostRecentTicket.open_time * 1000 + strictestLimit.milliseconds
					if (Date.now() < nextAllowedTime) {
						await utils.handleResponse(
							interaction,
							'warning',
							`You cannot open a new ticket yet. Based on your roles, you need to wait ${strictestLimit.limit} between tickets. You can open a new ticket <t:${Math.floor(nextAllowedTime / 1000)}:R>.`,
							{
								code: 'OT013',
							}
						)
						return
					}
				}
			}
		}

		// Get the ticket counter
		const ticket_id = await api.getTicketCounter(
			interaction.client.user.id as Discord.ClientUser['id'],
			interaction.guild?.id as Discord.Guild['id']
		)

		// Check if the ticket counter is valid
		if (!ticket_id) {
			// Send an error if the ticket counter is not valid
			await utils.handleResponse(
				interaction,
				'error',
				'An error occurred while getting the ticket counter.',
				{
					code: 'OT004',
				}
			)
			return
		}

		// Create the thread name
		const thread_name = `ticket-${ticket_id}`

		// Check if the interaction is in a text channel
		if (!(interaction.channel instanceof Discord.TextChannel)) {
			// Send an error if the interaction is not in a text channel
			await utils.handleResponse(
				interaction,
				'error',
				'This command can only be used in a text channel.',
				{
					code: 'OT003',
				}
			)
			return
		}

		// Create the thread
		const thread = await interaction.channel.threads.create({
			name: thread_name,
			autoArchiveDuration: Discord.ThreadAutoArchiveDuration.OneDay,
			type: Discord.ChannelType.PrivateThread,
			reason: 'Support ticket',
		})

		// Add the user to the thread
		await thread.members.add(interaction.user.id)

		// Get the ticket type by matching if the interaction customId starts with the button's unique_id
		const ticket_type = config.embeds?.open_ticket?.buttons_map
			? config.embeds.open_ticket.buttons_map.find((button) =>
					interaction.customId.startsWith(button.unique_id)
				)?.label ?? 'General Support'
			: 'General Support'

		// Get the closed by as full message author info
		const closedByInfo = {
			id: interaction.user.id,
			avatar: interaction.user.displayAvatarURL({
				extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
			}),
			username: interaction.user.username,
			displayName:
				(interaction.member as Discord.GuildMember)?.displayName ??
				interaction.user.username,
		}

		// Get the placeholders
		const placeholders = {
			ticket_id: ticket_id.toString(),
			opened_by: interaction.user.toString(),
			channel_id: `<#${thread.id}>`,
			thread_id: thread.id,
			category: ticket_type,
			claimed_by: 'Not claimed',
			closed_by: `<@${closedByInfo.id}>`,
			open_time: Math.floor(Date.now() / 1000),
		}

		// Get the opened_ticket message options using the new function
		const threadMessageOptions = await createTicketMessage(
			config,
			'opened_ticket',
			placeholders
		)

		// If no message options were returned, create a default welcome message
		if (!threadMessageOptions.content && !threadMessageOptions.embeds?.length) {
			// Create a formatted welcome message with markdown formatting
			const welcomeContent = [
				`# 🎫 Ticket #${ticket_id} - ${ticket_type}`,
				'',
				`## 👋 Welcome ${interaction.user.toString()}!`,
				'',
				'Thank you for reaching out! A support representative will be with you shortly.',
				'',
				'Please provide as much detail as possible to help us assist you better.',
				'',
				'---',
				'*You can close this ticket using the button below when your issue is resolved.*',
			].join('\n')

			threadMessageOptions.content = welcomeContent

			// Create a close button if no components exist
			if (
				!threadMessageOptions.components ||
				threadMessageOptions.components.length === 0
			) {
				const closeButton = new Discord.ButtonBuilder()
					.setCustomId(`close_ticket_${thread.id}_0`)
					.setLabel('Close Ticket')
					.setStyle(Discord.ButtonStyle.Danger)

				const actionRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						closeButton
					)

				threadMessageOptions.components = [actionRow]
			}
		}

		// Send the welcome message to the thread
		await thread.send(threadMessageOptions)

		// Create a confirmation message for the user using the user_ticket template or fallback to default
		const userMessageOptions = await createTicketMessage(
			config,
			'user_ticket',
			placeholders
		)

		// If no message options were returned, create a default confirmation message
		if (!userMessageOptions.content && !userMessageOptions.embeds?.length) {
			// Create a confirmation message for the user with markdown formatting
			const confirmationContent = [
				'# 🎫 Ticket Created Successfully!',
				'',
				`Your ticket #${ticket_id} has been created.`,
				'',
				`Please click here to view: <#${thread.id}>`,
			].join('\n')

			userMessageOptions.content = confirmationContent
		}

		// Send a new ephemeral follow-up message notifying that the ticket was created
		await interaction.followUp({
			...userMessageOptions,
			flags: Discord.MessageFlags.Ephemeral,
		})

		await api.incrementTicketCounter(
			interaction.client.user.id,
			interaction.guild.id
		)

		// Create the metadata (store opened_by as message author info)
		const metadata: ExtendedThreadMetadata = {
			ticket_id,
			opened_by: {
				id: interaction.user.id,
				avatar: interaction.user.displayAvatarURL({
					extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
				}),
				username: interaction.user.username,
				displayName:
					interaction.member && 'displayName' in interaction.member
						? (interaction.member as Discord.GuildMember).displayName
						: interaction.user.username,
			},
			open_time: Math.floor(Date.now() / 1000),
			ticket_type,
			guild_id: interaction.guild.id, // Add guild_id to metadata
		}

		// Check if the admin channel is set
		if (config.admin_channel_id) {
			try {
				// Fetch the admin channel
				const admin_channel = await interaction.guild.channels.fetch(
					config.admin_channel_id
				)

				// Check if the admin channel is valid
				if (!admin_channel?.isTextBased()) {
					bunnyLog.warn('Admin channel is not a text channel', {
						channelId: config.admin_channel_id,
						guildId: interaction.guild.id,
					})
					throw new Error('Admin channel is not a valid text channel')
				}

				// Create formatted admin message with markdown
				const adminContent = [
					`# 📬 New Ticket - #${ticket_id}`,
					'',
					'## Ticket Information',
					`**Opened by:** ${interaction.user.toString()}`,
					`**Category:** ${ticket_type}`,
					'**Claimed by:** Not claimed',
					'',
					'*Click the buttons below to manage this ticket*',
				].join('\n')

				// Create action row with buttons
				const claimButton = new Discord.ButtonBuilder()
					.setCustomId(`claim_ticket_${thread.id}_0`)
					.setLabel('Claim Ticket')
					.setStyle(Discord.ButtonStyle.Primary)

				const joinButton = new Discord.ButtonBuilder()
					.setCustomId(`join_ticket_${thread.id}_1`)
					.setLabel('Join Ticket')
					.setStyle(Discord.ButtonStyle.Secondary)

				const actionRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						claimButton,
						joinButton
					)

				// Ping moderator roles if configured
				const pingContent =
					config.mods_role_ids?.length > 0
						? config.mods_role_ids.map((id) => `<@&${id}>`).join(' ')
						: null

				// Send the admin message
				const admin_message = await admin_channel.send({
					content: pingContent
						? `${pingContent}\n${adminContent}`
						: adminContent,
					components: [actionRow],
				})

				// Set the metadata
				metadata.join_ticket_message_id = admin_message.id
				metadata.admin_channel_id = config.admin_channel_id
			} catch (channelError) {
				await utils.handleResponse(
					interaction,
					'warning',
					'Failed to notify admin channel but ticket was created',
					{
						code: 'OT008',
						error:
							channelError instanceof Error
								? channelError
								: new Error(String(channelError)),
						includeSupport: false,
					}
				)
			}
		}

		// Set the metadata
		thread_metadata_store.set(thread.id, metadata)

		// Save the ticket metadata to the database (include admin message info if set)
		await api.saveTicketMetadata(
			interaction.client.user.id,
			interaction.guild.id,
			thread.id,
			{
				ticket_id, // already a number/string from getTicketCounter
				opened_by: {
					id: interaction.user.id,
					avatar: interaction.user.displayAvatarURL({
						extension: interaction.user.avatar?.startsWith('a_')
							? 'gif'
							: 'png',
					}),
					username: interaction.user.username,
					displayName:
						interaction.member && 'displayName' in interaction.member
							? (interaction.member as Discord.GuildMember).displayName
							: interaction.user.username,
				},
				open_time: metadata.open_time,
				ticket_type,
				claimed_by: 'Not claimed',
				join_ticket_message_id: metadata.join_ticket_message_id, // if set
				admin_channel_id: config.admin_channel_id, // if set
				guild_id: interaction.guild.id, // Add guild_id to database metadata
			},
			[] // messages are empty on ticket creation
		)
	} catch (error) {
		const err =
			error instanceof Error
				? error
				: new Error(
						typeof error === 'object'
							? JSON.stringify(error, null, 2)
							: String(error)
					)

		await utils.handleResponse(
			interaction,
			'error',
			`Ticket creation failed: ${err.message}`,
			{
				code: 'OT001',
				error: err,
				includeSupport: true,
			}
		)
	}
}

/**
 * Closes a ticket with a reason
 * @param interaction - The interaction to close the ticket
 */
async function closeTicketWithReason(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	// Check if the interaction is in a guild
	if (!interaction.guild) {
		// Send an error if the interaction is not in a guild
		await utils.handleResponse(
			interaction,
			'error',
			'This command can only be used in a server.',
			{
				code: 'CT005',
			}
		)
		return
	}

	// Get the thread
	const thread = interaction.channel as Discord.ThreadChannel

	// Check if the thread is a thread
	if (!thread?.isThread()) {
		// Send an error if the thread is not a thread
		await utils.handleResponse(
			interaction,
			'error',
			'The found channel is not a thread.',
			{
				code: 'CT007',
			}
		)
		return
	}

	// Get the metadata
	let metadata = thread_metadata_store.get(thread.id) as ExtendedThreadMetadata
	// Fallback: if not found in memory, try to fetch it from the database
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild.id,
			thread.id
		)) as ExtendedThreadMetadata

		// If still not found, handle accordingly
		if (!metadata) {
			await utils.handleResponse(
				interaction,
				'error',
				'No metadata found for the ticket.',
				{
					code: 'CT007',
				}
			)
			return
		}
	}

	// Check if the user is a moderator or the ticket opener
	const isTicketOpener = metadata.opened_by?.id === interaction.user.id
	const hasModerationPermission = interaction.memberPermissions?.has(
		Discord.PermissionFlagsBits.ManageThreads
	)

	if (!isTicketOpener && !hasModerationPermission) {
		await utils.handleResponse(
			interaction,
			'error',
			"You don't have permission to close this ticket. Only moderators or the ticket opener can close tickets.",
			{
				code: 'CT012',
			}
		)
		return
	}

	// Get the plugin config for customized modal title/label
	const config = await api.getPluginConfig(
		interaction.client.user.id,
		interaction.guild.id,
		'tickets'
	)

	// Create placeholders
	const placeholders = {
		user: interaction.user.username,
		user_id: interaction.user.id,
		user_mention: `<@${interaction.user.id}>`,
		ticket_id: metadata.ticket_id || 'Unknown',
		channel_name: thread.name,
	}

	// Try to get custom modal text from template
	const closeReasonTemplate = await createTicketMessage(
		config,
		'close_reason_modal',
		placeholders
	)

	// Modal title (from template or default)
	const modalTitle =
		closeReasonTemplate.content?.split('\n')[0]?.replace('# ', '') ||
		'Close Reason'

	// Create a modal
	const modal = new Discord.ModalBuilder()
		.setCustomId('close_ticket_modal')
		.setTitle(modalTitle)

	// Create the text input for the reason
	const reasonInput = new Discord.TextInputBuilder()
		.setCustomId('close_reason')
		.setLabel('Why are you closing this ticket?')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setRequired(true)
		.setMinLength(3)
		.setMaxLength(1000)
		.setPlaceholder('Please enter your reason...')

	// Create the action row
	const firstActionRow =
		new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
			reasonInput
		)

	// Add the action row to the modal
	modal.addComponents(firstActionRow)

	// Show the modal
	await interaction.showModal(modal)
}

/**
 * Closes a ticket
 * @param interaction - The interaction to close the ticket
 */
async function closeTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	// Check if the interaction is in a guild
	if (!interaction.guild) {
		// Send an error if the interaction is not in a guild
		await utils.handleResponse(
			interaction,
			'error',
			'This command can only be used in a server.',
			{
				code: 'CT005',
			}
		)
		return
	}

	// Defer the reply
	await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	// Get the plugin config
	const config = await api.getPluginConfig(
		interaction.client.user.id,
		interaction.guild.id,
		'tickets'
	)

	// Get the thread
	const thread = interaction.channel as Discord.ThreadChannel

	// Check if the thread is a thread
	if (!thread?.isThread()) {
		// Send an error if the thread is not a thread
		await utils.handleResponse(
			interaction,
			'error',
			'The found channel is not a thread.',
			{
				code: 'CT007',
			}
		)
		return
	}

	// Get the metadata to check if the user is the ticket opener
	let metadata = thread_metadata_store.get(thread.id) as ExtendedThreadMetadata
	// Fallback: if not found in memory, try to fetch it from the database
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild.id,
			thread.id
		)) as ExtendedThreadMetadata

		// If still not found, handle accordingly
		if (!metadata) {
			await utils.handleResponse(
				interaction,
				'error',
				'No metadata found for the ticket.',
				{
					code: 'CT007',
				}
			)
			return
		}
	}

	// Check if the user is a moderator or the ticket opener
	const isTicketOpener = metadata.opened_by?.id === interaction.user.id
	const hasModerationPermission = interaction.memberPermissions?.has(
		Discord.PermissionFlagsBits.ManageThreads
	)

	if (!isTicketOpener && !hasModerationPermission) {
		await utils.handleResponse(
			interaction,
			'error',
			"You don't have permission to close this ticket. Only moderators or the ticket opener can close tickets.",
			{
				code: 'CT012',
			}
		)
		return
	}

	// Get the placeholders
	const placeholders = {
		user: interaction.user.toString(),
		thread_id: thread.id,
		ticket_id: metadata?.ticket_id || 'Unknown',
	}

	// Use the component-based message if available
	const messageOptions = await createTicketMessage(
		config,
		'confirm_close_ticket',
		placeholders
	)

	// If no message options were generated, use a default message
	if (!messageOptions.content && !messageOptions.embeds?.length) {
		// Create confirmation message with markdown formatting
		const confirmCloseContent = [
			'# ❓ Close Confirmation',
			'',
			'Please confirm that you want to close this ticket.',
			'',
			'*This action will lock the thread and save a transcript.*',
		].join('\n')

		// Create buttons
		const confirmButton = new Discord.ButtonBuilder()
			.setCustomId(`confirm_close_ticket_${thread.id}_0`)
			.setLabel('Confirm Close')
			.setStyle(Discord.ButtonStyle.Success)

		const cancelButton = new Discord.ButtonBuilder()
			.setCustomId(`cancel_close_ticket_${thread.id}_1`)
			.setLabel('Cancel')
			.setStyle(Discord.ButtonStyle.Secondary)

		const actionRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				confirmButton,
				cancelButton
			)

		messageOptions.content = confirmCloseContent
		messageOptions.components = [actionRow]
	}

	// Send the confirmation message
	await interaction.editReply(messageOptions)
}

/**
 * Sends a rating survey to the user
 * @param user - The user to send the survey to
 * @param ticketId - The ID of the ticket
 * @param threadId - The ID of the thread
 */
async function sendRatingSurvey(
	user: Discord.User,
	ticketId: number | string,
	threadId: string
): Promise<void> {
	try {
		// Try to get the guild from the thread ID through cache
		const thread = user.client.channels.cache.get(
			threadId
		) as Discord.ThreadChannel
		const guildId = thread?.guildId

		// Create rating buttons
		const ratingButtons =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId(`rating_1_${threadId}`)
					.setLabel('⭐ 1')
					.setStyle(Discord.ButtonStyle.Danger),
				new Discord.ButtonBuilder()
					.setCustomId(`rating_2_${threadId}`)
					.setLabel('⭐ 2')
					.setStyle(Discord.ButtonStyle.Danger),
				new Discord.ButtonBuilder()
					.setCustomId(`rating_3_${threadId}`)
					.setLabel('⭐ 3')
					.setStyle(Discord.ButtonStyle.Secondary),
				new Discord.ButtonBuilder()
					.setCustomId(`rating_4_${threadId}`)
					.setLabel('⭐ 4')
					.setStyle(Discord.ButtonStyle.Success),
				new Discord.ButtonBuilder()
					.setCustomId(`rating_5_${threadId}`)
					.setLabel('⭐ 5')
					.setStyle(Discord.ButtonStyle.Success)
			)

		// If we can find the guild, try to use the template from config
		if (guildId) {
			// Get the plugin config
			const config = await api.getPluginConfig(
				user.client.user.id,
				guildId,
				'tickets'
			)

			// Use the rating_survey template from components if available
			const ratingMessage = await createTicketMessage(config, 'rating_survey', {
				ticket_id: ticketId,
				thread_id: threadId,
			})

			// If template is not empty, use it
			if (
				ratingMessage.content ||
				ratingMessage.embeds?.length ||
				ratingMessage.components?.length
			) {
				// Add the rating buttons to the message
				if (ratingMessage.components) {
					ratingMessage.components = [
						...ratingMessage.components,
						ratingButtons,
					]
				} else {
					ratingMessage.components = [ratingButtons]
				}

				// Send the survey
				await user.send(ratingMessage)
				return
			}
		}

		// Fallback to default content if no template or guild found
		const content = [
			'# 📊 Support Ticket Feedback',
			'',
			`Thanks for using our support system! Your ticket #${ticketId} has been closed.`,
			'',
			'## Please rate your experience:',
			'',
			'_Your feedback helps us improve our support services._',
		].join('\n')

		// Send the survey to the user
		await user.send({ content, components: [ratingButtons] })
	} catch (error) {
		bunnyLog.error('Failed to send rating survey:', error)
	}
}

/**
 * Closes a thread
 * @param interaction - The interaction to close the thread
 * @param reason - The reason for closing the thread
 */
async function closeThread(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	reason = 'No reason provided'
): Promise<void> {
	// Check if the interaction is in a guild
	if (!interaction.guild) {
		// Send an error if the interaction is not in a guild
		await utils.handleResponse(
			interaction,
			'error',
			'This command can only be used in a server.',
			{
				code: 'CT005',
			}
		)
		return
	}

	// Get the thread
	const thread = interaction.channel as Discord.ThreadChannel

	// Check if the thread is a thread
	if (!thread?.isThread()) {
		// Send an error if the thread is not a thread
		await utils.handleResponse(
			interaction,
			'error',
			'The found channel is not a thread.',
			{
				code: 'CT007',
			}
		)
		return
	}

	try {
		// Get the plugin config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild.id,
			'tickets'
		)

		// Get the metadata
		let metadata = thread_metadata_store.get(
			thread.id
		) as ExtendedThreadMetadata
		// Fallback: if not found in memory, try to fetch it from the database
		if (!metadata) {
			metadata = (await api.getTicketMetadata(
				interaction.client.user.id,
				interaction.guild.id,
				thread.id
			)) as ExtendedThreadMetadata

			// If still not found, handle accordingly
			if (!metadata) {
				await utils.handleResponse(
					interaction,
					'error',
					'No metadata found for the ticket.',
					{
						code: 'CT007',
					}
				)
				return
			}
		}

		// Check if the user is a moderator or the ticket opener
		const isTicketOpener = metadata.opened_by?.id === interaction.user.id
		const hasModerationPermission =
			'memberPermissions' in interaction &&
			interaction.memberPermissions?.has(
				Discord.PermissionFlagsBits.ManageThreads
			)

		if (!isTicketOpener && !hasModerationPermission) {
			await utils.handleResponse(
				interaction,
				'error',
				"You don't have permission to close this ticket. Only moderators or the ticket opener can close tickets.",
				{
					code: 'CT012',
				}
			)
			return
		}

		// Get the closed by as full message author info
		const closedByInfo = {
			id: interaction.user.id,
			avatar: interaction.user.displayAvatarURL({
				extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
			}),
			username: interaction.user.username,
			displayName:
				(interaction.member as Discord.GuildMember)?.displayName ??
				interaction.user.username,
		}

		// Get the placeholders
		const placeholders = {
			ticket_id: metadata?.ticket_id || 'Unknown',
			opened_by: metadata?.opened_by
				? `<@${metadata.opened_by.id}>`
				: 'Unknown',
			closed_by: `<@${closedByInfo.id}>`,
			open_time: metadata?.open_time
				? new Date(metadata.open_time * 1000).toLocaleString()
				: 'Unknown',
			claimed_by:
				typeof metadata?.claimed_by === 'object'
					? `<@${metadata.claimed_by.id}>`
					: metadata?.claimed_by || 'Not claimed',
			reason: reason,
			close_time: new Date().toLocaleString(),
			category: metadata?.ticket_type || 'Unknown',
			thread_id: thread.id,
		}

		// Create and send the closed ticket message
		const closeMessageOptions = await createTicketMessage(
			config,
			'closed_ticket',
			placeholders
		)

		await thread.send(closeMessageOptions)

		// Update metadata with closed status
		if (metadata) {
			metadata.closed_by = closedByInfo
			metadata.close_time = new Date()
			metadata.reason = reason
			metadata.status = 'closed'

			// Update in-memory metadata
			thread_metadata_store.set(thread.id, metadata)

			// Update in database
			await api.updateTicketMetadata(
				interaction.client.user.id,
				interaction.guild.id,
				thread.id,
				metadata as ThreadMetadata
			)
		}

		await sendTranscript(interaction, reason)

		// Set the thread to locked and archived
		await thread.setLocked(true)
		await thread.setArchived(true)

		// Send rating survey to the user if opened_by user info exists
		if (metadata?.opened_by) {
			try {
				const user = await interaction.client.users.fetch(metadata.opened_by.id)
				if (user) {
					await sendRatingSurvey(user, metadata.ticket_id, thread.id)
				}
			} catch (e) {
				bunnyLog.error('Failed to send rating survey:', e)
			}
		}

		// Check if the admin channel is set
		if (metadata?.join_ticket_message_id && metadata.admin_channel_id) {
			try {
				const adminChannel = (await interaction.guild.channels.fetch(
					metadata.admin_channel_id
				)) as Discord.TextChannel
				if (adminChannel?.isTextBased()) {
					const joinTicketMessage = await adminChannel.messages.fetch(
						metadata.join_ticket_message_id
					)
					if (joinTicketMessage) await joinTicketMessage.delete()
				}
			} catch (fetchError) {
				bunnyLog.error('Error fetching or deleting admin message:', fetchError)
			}
			// Delete the in-memory metadata (you may also want to update the DB record accordingly)
			thread_metadata_store.delete(thread.id)
		}
	} catch (error) {
		// Send an error if an error occurs
		await utils.handleResponse(
			interaction,
			'error',
			'An error occurred while closing the ticket.',
			{
				code: 'CT001',
			}
		)
	}
}

/**
 * Sends a transcript
 * @param interaction - The interaction to send the transcript
 * @param reason - The reason for sending the transcript
 */
async function sendTranscript(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	reason: string
): Promise<void> {
	// Get the plugin config
	const config = await api.getPluginConfig(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		'tickets'
	)

	// Check if the transcript channel is set
	if (!config?.transcript_channel_id) {
		await utils.handleResponse(
			interaction,
			'warning',
			'No transcript channel found in the configuration.',
			{
				code: 'CT008',
			}
		)
		return
	}

	// Fetch the transcript channel
	const transcriptChannel = (await interaction.guild?.channels.fetch(
		config.transcript_channel_id
	)) as Discord.TextChannel

	// Check if the transcript channel is valid
	if (!transcriptChannel?.isTextBased()) return

	// Get the thread
	const channel = interaction.channel as Discord.ThreadChannel

	// Check if the thread is a thread
	if (
		!channel?.isThread() ||
		channel.type !== Discord.ChannelType.PrivateThread
	) {
		await utils.handleResponse(
			interaction,
			'warning',
			'The found channel is not a thread.',
			{
				code: 'CT009',
			}
		)
		return
	}

	// Get the metadata with fallback to the database if missing
	let metadata = thread_metadata_store.get(channel.id) as
		| ExtendedThreadMetadata
		| undefined
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			channel.id
		)) as ExtendedThreadMetadata | null
		if (!metadata) {
			await utils.handleResponse(
				interaction,
				'warning',
				'Ticket metadata not found in memory or database. Transcript cannot include ticket id.',
				{ code: 'CT011' }
			)
			return
		}
	}

	// Create the transcript metadata
	const transcriptMetadata = {
		...metadata,
		closed_by: {
			id: interaction.user.id,
			avatar: interaction.user.displayAvatarURL({
				extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
			}),
			username: interaction.user.username,
			displayName:
				(interaction.member as Discord.GuildMember)?.displayName ??
				interaction.user.username,
		},
		close_time: new Date(),
		reason: reason,
		rating: metadata.rating,
		thread_id: channel.id,
		guild_id: interaction.guild?.id,
	}

	// Create the transcript message using the component-based format
	const messageOptions = await createTicketMessage(config, 'transcript', {
		ticket_id: metadata.ticket_id?.toString() || 'Unknown',
		opened_by: metadata?.opened_by ? `<@${metadata.opened_by.id}>` : 'Unknown',
		closed_by: `<@${interaction.user.id}>`,
		open_time: metadata?.open_time
			? Math.floor(metadata.open_time).toString()
			: 'Unknown',
		claimed_by:
			typeof metadata?.claimed_by === 'object'
				? `<@${metadata.claimed_by.id}>`
				: metadata?.claimed_by || 'Not claimed',
		reason: reason,
		close_time: Math.floor(Date.now() / 1000).toString(),
		category: metadata?.ticket_type || 'Unknown',
		rating: metadata.rating?.value
			? '⭐'.repeat(metadata.rating.value)
			: 'No rating yet',
		thread_id: channel.id,
		guild_id: interaction.guild?.id,
	})

	// If no message options were generated, use a default transcript format
	if (!messageOptions.content && !messageOptions.embeds?.length) {
		// Create the content with markdown formatting
		const content = [
			`# 🎫 Ticket #${metadata.ticket_id} - ${metadata.ticket_type || 'Support'}`,
			'',
			'## 📋 Ticket Information',
			`> **Opened by:** <@${metadata.opened_by?.id}>`,
			`> **Opened at:** <t:${metadata.open_time}:F>`,
			'',
			'## 👥 Handling',
			`> **Claimed by:** ${typeof metadata.claimed_by === 'object' ? `<@${metadata.claimed_by.id}>` : metadata.claimed_by || 'Not claimed'}`,
			`> **Closed by:** <@${interaction.user.id}>`,
			`> **Closed at:** <t:${Math.floor(Date.now() / 1000)}:F>`,
			'',
			'## 📝 Resolution',
			`> **Reason:** ${reason}`,
			`> **Rating:** ${metadata.rating?.value ? '⭐'.repeat(metadata.rating.value) : 'No rating yet'}`,
			'',
			'---',
			'*Click the button below to view the full ticket conversation:*',
		].join('\n')

		// Create buttons
		const viewButton = new Discord.ButtonBuilder()
			.setLabel('View Ticket')
			.setStyle(Discord.ButtonStyle.Link)
			.setURL(channel.url)

		const actionRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				viewButton
			)

		messageOptions.content = content
		messageOptions.components = [actionRow]
	}

	try {
		// Send the transcript message
		const transcriptMessage = await transcriptChannel.send(messageOptions)

		// Update metadata with transcript message ID and channel ID
		transcriptMetadata.transcript_message_id = transcriptMessage.id
		transcriptMetadata.transcript_channel_id = transcriptChannel.id

		// Save the transcript to the database with updated metadata
		await api.saveTranscriptToSupabase(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			channel.id,
			[], // Empty transcript since we're not storing the content
			transcriptMetadata
		)

		// Update the in-memory metadata store
		thread_metadata_store.set(channel.id, transcriptMetadata)
	} catch (error) {
		bunnyLog.error('Error saving transcript:', error)
		await utils.handleResponse(
			interaction,
			'warning',
			'Failed to save transcript.',
			{
				code: 'CT012',
			}
		)
	}
}

/**
 * Confirms the close ticket
 * @param interaction - The interaction to confirm the close ticket
 */
async function confirmCloseTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	try {
		// Check if the interaction is in a guild channel
		if (!interaction.inGuild()) {
			await utils.handleResponse(
				interaction,
				'error',
				'This command can only be used in a server channel.'
			)
			return
		}

		// Check if the channel is a thread
		if (
			!interaction.channel ||
			!('isThread' in interaction.channel) ||
			!interaction.channel.isThread()
		) {
			await utils.handleResponse(
				interaction,
				'error',
				'This command can only be used in a ticket thread.'
			)
			return
		}

		// Get the plugin config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild.id,
			'tickets'
		)

		// Create placeholders for the message
		const placeholders = {
			user: interaction.user.username,
			user_id: interaction.user.id,
			user_mention: `<@${interaction.user.id}>`,
			thread_name: interaction.channel.name,
			thread_id: interaction.channel.id,
		}

		// Use the confirm_close_ticket template from components
		const confirmMessage = await createTicketMessage(
			config,
			'confirm_close_ticket',
			placeholders
		)

		// Check if template is available
		if (
			!confirmMessage.content &&
			!confirmMessage.embeds?.length &&
			!confirmMessage.components?.length
		) {
			// Create confirm and close buttons as fallback
			const row =
				new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
					new Discord.ButtonBuilder()
						.setCustomId('confirm_close_ticket')
						.setLabel('Confirm Close')
						.setStyle(Discord.ButtonStyle.Success),
					new Discord.ButtonBuilder()
						.setCustomId('cancel_close_ticket')
						.setLabel('Cancel')
						.setStyle(Discord.ButtonStyle.Secondary)
				)

			// Send confirmation message
			await interaction.reply({
				content:
					'# ❓ Close Confirmation\n\nPlease confirm that you want to close this ticket.\n\n*This action will lock the thread and save a transcript.*',
				components: [row],
				flags: Discord.MessageFlags.Ephemeral,
			})
		} else {
			// Make sure the message is ephemeral
			await interaction.reply({
				...confirmMessage,
				flags: Discord.MessageFlags.Ephemeral,
			})
		}
	} catch (error) {
		// Handle errors
		bunnyLog.error('Error confirming ticket close:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'Failed to create close confirmation.',
			{ code: 'CT028' }
		)
	}
}

/**
 * Joins a ticket
 * @param interaction - The interaction to join the ticket
 */
async function joinTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	// Defer the reply
	await interaction.deferUpdate()

	// Get the thread id
	const parts = interaction.customId.split('_')
	const threadId = parts[parts.length - 2]

	// Check if the thread id is valid
	if (!threadId) {
		await utils.handleResponse(
			interaction,
			'error',
			'Unable to find thread ID.',
			{
				code: 'JT002',
			}
		)
		return
	}

	// Get the thread
	let thread: Discord.ThreadChannel | null = null
	try {
		// Fetch the thread
		thread = (await interaction.guild?.channels.fetch(
			threadId
		)) as Discord.ThreadChannel
	} catch (error) {
		// Send an error if an error occurs
		await utils.handleResponse(
			interaction,
			'error',
			"Unable to find thread. It may have been deleted or you don't have access.",
			{
				code: 'JT001',
			}
		)
		return
	}

	// Check if the thread is a thread
	if (!thread?.isThread()) {
		// Send an error if the thread is not a thread
		await utils.handleResponse(
			interaction,
			'error',
			'The found channel is not a thread.',
			{
				code: 'JT003',
			}
		)
		return
	}

	// Add the user to the thread
	try {
		// Add the user to the thread
		await thread.members.add(interaction.user.id)

		// Send a welcome message to the thread
		await thread.send({
			content: `# 🛡️ Ticket Claimed\n\n${interaction.user.toString()} has claimed this ticket and will be assisting you.`,
		})
	} catch (error) {
		// Log error but continue with the claim process
		bunnyLog.error('Error adding user to thread while claiming:', error)
	}
}

/**
 * Claims a ticket
 * @param interaction - The interaction to claim the ticket
 */
async function claimTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	// Defer the reply until we have processed the data
	await interaction.deferUpdate()

	// Get the thread
	const thread = interaction.channel as Discord.ThreadChannel

	// Check if the thread is a thread
	if (!thread?.isThread()) {
		// Send an error if the thread is not a thread
		await utils.handleResponse(
			interaction,
			'error',
			'The found channel is not a thread.',
			{
				code: 'CT007',
			}
		)
		return
	}

	// Get the config
	const config = await api.getPluginConfig(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		'tickets'
	)

	// Get mods role IDs
	const modRoleIds = config.mods_role_ids || []

	// Check if the user has a mod role or has ManageThreads permission
	const member = await interaction.guild?.members.fetch(interaction.user.id)
	const hasModerationPermission =
		interaction.memberPermissions?.has(
			Discord.PermissionFlagsBits.ManageThreads
		) ||
		(member && modRoleIds.some((roleId) => member.roles.cache.has(roleId)))

	// Get the metadata
	let metadata = thread_metadata_store.get(thread.id) as ExtendedThreadMetadata
	// Fallback: if not found in memory, try to fetch it from the database
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			thread.id
		)) as ExtendedThreadMetadata

		// If still not found, handle accordingly
		if (!metadata) {
			await utils.handleResponse(
				interaction,
				'error',
				'No metadata found for the ticket.',
				{
					code: 'CT007',
				}
			)
			return
		}
	}

	// Only allow moderators to claim tickets
	if (!hasModerationPermission) {
		// Use the no_permission template for permission errors
		const noPermissionMessage = await createTicketMessage(
			config,
			'no_permission',
			{
				action: 'claim this ticket',
				user: interaction.user.username,
				user_id: interaction.user.id,
			}
		)

		// If template is not found, use fallback message
		if (
			!noPermissionMessage.content &&
			!noPermissionMessage.embeds?.length &&
			!noPermissionMessage.components?.length
		) {
			await utils.handleResponse(
				interaction,
				'error',
				"You don't have permission to claim this ticket. Only moderators can claim tickets.",
				{
					code: 'CT012',
				}
			)
		} else {
			// Send the custom no permission message as an ephemeral reply
			await interaction.followUp({
				...noPermissionMessage,
				flags: Discord.MessageFlags.Ephemeral,
			})
		}
		return
	}

	// Check if the ticket is already claimed
	if (metadata.claimed_by) {
		// Don't allow re-claiming if already claimed by someone else
		// Check if the claimer is the current user
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
				{
					code: 'CT014',
				}
			)
			return
		}
		await utils.handleResponse(
			interaction,
			'info',
			'You have already claimed this ticket.',
			{
				code: 'CT015',
			}
		)
		return
	}

	// Get the member as a GuildMember with additional info
	const fullMemberInfo = await interaction.guild?.members.fetch({
		user: interaction.user.id,
		force: true,
	})

	// Get the claimed by as full message author info
	const claimedByInfo = {
		id: interaction.user.id,
		avatar: interaction.user.displayAvatarURL({
			extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
		}),
		username: interaction.user.username,
		displayName: fullMemberInfo?.displayName ?? interaction.user.username,
	}

	// Create placeholders for ticket claimed message
	const placeholders = {
		claimed_by: `<@${claimedByInfo.id}>`,
		user: claimedByInfo.username,
		display_name: claimedByInfo.displayName,
	}

	// Get ticket claimed message template
	const ticketClaimedMessage = await createTicketMessage(
		config,
		'ticket_claimed',
		placeholders
	)

	// Update the metadata
	metadata.claimed_by = claimedByInfo
	metadata.claimed_time = new Date()

	// Update in memory
	thread_metadata_store.set(thread.id, metadata)
	// Update in database
	await api.updateTicketMetadata(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		thread.id,
		metadata as ThreadMetadata
	)

	// Send claimed message to thread
	if (
		!ticketClaimedMessage.content &&
		!ticketClaimedMessage.embeds?.length &&
		!ticketClaimedMessage.components?.length
	) {
		// Fallback message
		await thread.send({
			content: `# 🛡️ Ticket Claimed\n\n<@${claimedByInfo.id}> has claimed this ticket and will be assisting you.`,
		})
	} else {
		await thread.send(ticketClaimedMessage)
	}

	// Send success message to user
	await utils.handleResponse(
		interaction,
		'success',
		'Ticket claimed successfully! You will now be the point of contact for this ticket.',
		{
			code: 'CT016',
		}
	)
}

/**
 * Handles the modal submit
 * @param interaction - The interaction to handle the modal submit
 */
async function modalSubmit(
	interaction: Discord.ModalSubmitInteraction
): Promise<void> {
	// Check if the modal is the close ticket modal
	if (interaction.customId === 'close_ticket_modal') {
		// Get the reason
		const reason = interaction.fields.getTextInputValue('close_reason')

		// Defer the reply
		await interaction.deferUpdate()

		// Close the thread
		await closeThread(interaction, reason)
	}
}

/**
 * Handles ticket rating button interactions
 * @param interaction - The interaction containing the rating
 */
async function handleTicketRating(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	await interaction.deferUpdate()

	// Parse rating and thread ID from the custom ID
	const [_, ratingStr, threadId] = interaction.customId.split('_')
	const rating = Number.parseInt(ratingStr, 10)

	// Debug logging
	// bunnyLog.info('Processing ticket rating', {
	// 	threadId,
	// 	rating,
	// 	customId: interaction.customId,
	// 	guildId: interaction.guild?.id,
	// 	userId: interaction.user.id,
	// })

	if (Number.isNaN(rating) || rating < 1 || rating > 5) {
		await utils.handleResponse(
			interaction,
			'error',
			'Invalid rating. Please try again.',
			{
				code: 'TR001',
			}
		)
		return
	}

	try {
		// Get metadata from memory first
		let metadata = thread_metadata_store.get(threadId)
		let guildId: string | undefined

		// If not in memory, try to get from database
		if (!metadata) {
			try {
				// Try to get the thread to find its guild
				const thread = (await interaction.client.channels.fetch(
					threadId
				)) as Discord.ThreadChannel
				if (thread?.guildId) {
					guildId = thread.guildId
					metadata = await api.getTicketMetadata(
						interaction.client.user.id,
						guildId,
						threadId
					)
				}
			} catch (error) {
				bunnyLog.error('Failed to fetch thread or metadata:', error)
			}
		} else {
			guildId = metadata.guild_id
		}

		// If we still don't have a guild ID, try to get it from the thread name
		if (!guildId) {
			try {
				const thread = (await interaction.client.channels.fetch(
					threadId
				)) as Discord.ThreadChannel
				if (thread?.guildId) {
					guildId = thread.guildId
				}
			} catch (error) {
				bunnyLog.error('Failed to fetch thread for guild ID:', error)
			}
		}

		// If we still don't have a guild ID, we can't proceed
		if (!guildId) {
			bunnyLog.error('Unable to find guild ID for ticket rating', {
				threadId,
				rating,
				userId: interaction.user.id,
			})
			await utils.handleResponse(
				interaction,
				'error',
				'Unable to process rating. Please try again later.',
				{
					code: 'TR003',
				}
			)
			return
		}

		// If we don't have metadata yet, try one more time with the guild ID
		if (!metadata) {
			metadata = await api.getTicketMetadata(
				interaction.client.user.id,
				guildId,
				threadId
			)
		}

		if (!metadata) {
			// Try to get the ticket ID from the thread name
			let ticketId: string | null = null
			try {
				const thread = (await interaction.client.channels.fetch(
					threadId
				)) as Discord.ThreadChannel
				if (thread?.name) {
					const ticketIdMatch = thread.name.match(/ticket-(\d+)/)
					if (ticketIdMatch) {
						ticketId = ticketIdMatch[1]
					}
				}
			} catch (error) {
				bunnyLog.error('Failed to fetch thread:', error)
			}

			// If we have the ticket ID from thread name, use it in error message
			if (ticketId) {
				await utils.handleResponse(
					interaction,
					'error',
					`Unable to find ticket #${ticketId} information. The ticket may have been deleted or expired.`,
					{
						code: 'TR002',
					}
				)
			} else {
				await utils.handleResponse(
					interaction,
					'error',
					'Unable to find ticket information. The ticket may have been deleted or expired.',
					{
						code: 'TR002',
					}
				)
			}
			return
		}

		// Update the rating
		const ratingData = {
			value: rating,
			submitted_at: new Date().toISOString(),
			review_message_id: interaction.message.id, // Store the review message ID
		}

		// Try to update database first
		try {
			await api.updateTicketRating(
				interaction.client.user.id,
				threadId,
				rating,
				interaction.message.id
			)
		} catch (updateError) {
			// Only log as error if it's not a "no rows" case
			if (
				updateError instanceof Error &&
				!updateError.message.includes('Ticket not found')
			) {
				bunnyLog.error(
					'Failed to update ticket rating in database:',
					updateError
				)
			}
			// If database update fails, at least update memory
			metadata.rating = ratingData
			thread_metadata_store.set(threadId, metadata)
		}

		// Get the plugin config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			guildId,
			'tickets'
		)

		// Update the rating survey message
		const ratingText = '⭐'.repeat(rating)

		// Create thank you message with markdown formatting
		const content = [
			'# Thank You For Your Feedback!',
			'',
			`You rated your support experience: ${ratingText} (${rating}/5)`,
			'',
			'_Your feedback helps us improve our support services._',
		].join('\n')

		// Disable all buttons in the survey message - Fix for component type errors
		const surveyComponents = interaction.message.components.map((actionRow) => {
			// Cast to the appropriate ActionRow type first
			const row = actionRow as Discord.ActionRow<Discord.ButtonComponent>
			return new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				row.components.map((button) => {
					const btn = button as Discord.ButtonComponent
					return Discord.ButtonBuilder.from(btn).setDisabled(true)
				})
			)
		})

		await interaction.message.edit({
			content,
			embeds: [], // Remove any embeds
			components: surveyComponents,
		})

		// If we have the transcript message ID and channel ID, update the transcript directly
		if (metadata.transcript_message_id && metadata.transcript_channel_id) {
			try {
				const transcriptChannel = (await interaction.client.channels.fetch(
					metadata.transcript_channel_id
				)) as Discord.TextChannel

				if (transcriptChannel?.isTextBased()) {
					const transcriptMessage = await transcriptChannel.messages.fetch(
						metadata.transcript_message_id
					)

					if (transcriptMessage) {
						// Create content for updated transcript message
						const updatedContent = transcriptMessage.content.replace(
							/\*\*Rating:\*\* .*$/m,
							`**Rating:** ${ratingText} (${rating}/5)`
						)

						// Update the transcript message with content only
						await transcriptMessage.edit({
							content: updatedContent,
						})
					}
				}
			} catch (error) {
				bunnyLog.error('Failed to update transcript message:', error)
			}
		}
	} catch (error) {
		bunnyLog.error('Failed to update ticket rating:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'Failed to save your rating. Please try again later.',
			{
				code: 'TR002',
			}
		)
	}
}

/**
 * Gets all active tickets across all guilds
 * @param client - The Discord client
 * @returns Promise with map of active tickets with metadata
 */
async function getAllActiveTickets(
	client: Discord.Client
): Promise<Map<string, ExtendedThreadMetadata>> {
	const activeTicketsMap = new Map<string, ExtendedThreadMetadata>()

	try {
		// Get all active tickets from the API
		const allTickets = await api.getAllActiveTickets(client.user.id)

		if (!allTickets || !Array.isArray(allTickets) || allTickets.length === 0) {
			return activeTicketsMap // Empty map if no tickets
		}

		// Process each ticket from the API
		for (const ticket of allTickets) {
			try {
				// Skip if no thread ID or metadata
				if (!ticket.thread_id || !ticket.metadata) continue

				const guild = client.guilds.cache.get(ticket.guild_id)
				if (!guild) continue // Skip if guild not found

				// Try to fetch the thread to see if it still exists and is not archived
				try {
					const thread = (await guild.channels.fetch(
						ticket.thread_id
					)) as Discord.ThreadChannel
					if (!thread || !thread.isThread() || thread.archived) continue

					// Convert to ExtendedThreadMetadata and ensure required fields
					const metadata = ticket.metadata as ExtendedThreadMetadata

					// Add thread_id and guild_id to metadata for easier access
					metadata.thread_id = ticket.thread_id
					metadata.guild_id = ticket.guild_id

					// Add to active tickets map
					activeTicketsMap.set(ticket.thread_id, metadata)
				} catch (e) {
					// Thread likely doesn't exist anymore, skip it
				}
			} catch (ticketError) {
				bunnyLog.error(
					`Error processing ticket ${ticket.thread_id}:`,
					ticketError
				)
			}
		}

		return activeTicketsMap
	} catch (error) {
		bunnyLog.error('Error getting active tickets:', error)
		return activeTicketsMap
	}
}

/**
 * Initializes the inactivity checker for tickets
 * @param client - The Discord client
 */
async function initTicketInactivityChecker(client: Discord.Client) {
	// Load all active tickets when bot starts
	try {
		// Pobierz aktywne tickety
		const activeTicketsMap = await getAllActiveTickets(client)

		// Sprawdź czy activeTickets jest poprawną mapą
		if (activeTicketsMap instanceof Map && activeTicketsMap.size > 0) {
			// Dodaj aktywne tickety do pamięci
			activeTicketsMap.forEach((metadata, threadId) => {
				thread_metadata_store.set(threadId, metadata)
			})
		}
	} catch (error) {
		bunnyLog.error('Error loading active tickets:', error)
	}

	// Run an immediate check for all guilds when bot starts
	try {
		// Get all guilds the bot is in
		const guilds = client.guilds.cache.values()

		for (const guild of guilds) {
			// Get the plugin config for each guild
			const config = (await api.getPluginConfig(
				client.user.id,
				guild.id,
				'tickets'
			)) as PluginResponse<TicketConfig>

			// Check if the plugin is enabled and auto-close is configured
			const autoCloseEnabled =
				config?.enabled &&
				Array.isArray(config.auto_close) &&
				config.auto_close.length > 0 &&
				config.auto_close[0].enabled === true

			// Skip if tickets plugin is disabled or auto-close is disabled
			if (!autoCloseEnabled) {
				continue
			}

			// Get the inactivity threshold from config
			let inactivityThreshold = INACTIVITY_THRESHOLD // Default fallback

			// Get threshold from auto_close array
			if (
				Array.isArray(config.auto_close) &&
				config.auto_close.length > 0 &&
				config.auto_close[0].threshold
			) {
				inactivityThreshold = config.auto_close[0].threshold
			}

			// Find and close inactive tickets
			await checkInactiveTickets(client, guild, inactivityThreshold)
		}
	} catch (error) {
		bunnyLog.error('Error in initial ticket inactivity check:', error)
	}

	// Set up regular interval to check for inactive tickets
	setInterval(async () => {
		try {
			// Get all guilds the bot is in
			const guilds = client.guilds.cache.values()

			for (const guild of guilds) {
				// Get the plugin config for each guild
				const config = (await api.getPluginConfig(
					client.user.id,
					guild.id,
					'tickets'
				)) as PluginResponse<TicketConfig>

				// Check if the plugin is enabled and auto-close is configured
				const autoCloseEnabled =
					config?.enabled &&
					Array.isArray(config.auto_close) &&
					config.auto_close.length > 0 &&
					config.auto_close[0].enabled === true

				// Skip if tickets plugin is disabled or auto-close is disabled
				if (!autoCloseEnabled) {
					continue
				}

				// Get the inactivity threshold from config
				let inactivityThreshold = INACTIVITY_THRESHOLD // Default fallback

				// Get threshold from auto_close array
				if (
					Array.isArray(config.auto_close) &&
					config.auto_close.length > 0 &&
					config.auto_close[0].threshold
				) {
					inactivityThreshold = config.auto_close[0].threshold
				}

				// Find and close inactive tickets
				await checkInactiveTickets(client, guild, inactivityThreshold)
			}
		} catch (error) {
			bunnyLog.error('Error in ticket inactivity checker:', error)
		}
	}, ACTIVITY_CHECK_INTERVAL)

	bunnyLog.info('Ticket inactivity checker initialized')
}

/**
 * Checks for inactive tickets in a guild and closes them
 * @param client - The Discord client
 * @param guild - The guild to check
 * @param inactivityThreshold - The threshold in milliseconds
 */
async function checkInactiveTickets(
	client: Discord.Client,
	guild: Discord.Guild,
	inactivityThreshold: number
): Promise<void> {
	try {
		// Get all active tickets for this guild from database
		// Note: This function needs to be implemented in the API
		// Here we're just using the thread_metadata_store as a fallback
		const activeTickets: ExtendedThreadMetadata[] = []

		// First try to get from API (if implemented)
		try {
			// This would be the ideal API call - needs to be implemented
			// const apiTickets = await api.getActiveTickets(client.user.id, guild.id);
			// if (apiTickets && apiTickets.length > 0) {
			//     activeTickets.push(...apiTickets);
			// }
		} catch (e) {
			// API not implemented yet, use fallback
		}

		// Fallback: Check thread_metadata_store for active tickets in this guild
		for (const [threadId, metadata] of thread_metadata_store.entries()) {
			try {
				// Only include threads from this guild that aren't marked as closed
				// Store the thread ID as metadata.thread_id for easier access
				metadata.thread_id = threadId

				const channel = (await guild.channels.fetch(
					threadId
				)) as Discord.ThreadChannel
				if (channel && !channel.archived && metadata.guild_id === guild.id) {
					activeTickets.push(metadata)
				}
			} catch (e) {
				// Thread no longer exists, skip it
			}
		}

		if (activeTickets.length === 0) return

		const now = Date.now()

		// Process each active ticket
		for (const ticketData of activeTickets) {
			// Skip if there's no thread ID
			if (!ticketData.thread_id) continue

			// Get the thread channel
			try {
				const threadChannel = (await guild.channels.fetch(
					ticketData.thread_id
				)) as Discord.ThreadChannel

				if (
					!threadChannel ||
					!threadChannel.isThread() ||
					threadChannel.archived
				) {
					continue // Skip if thread doesn't exist or is already archived
				}

				// Get the last message timestamp
				const messages = await threadChannel.messages.fetch({ limit: 1 })
				const lastMessage = messages.first()

				if (!lastMessage) {
					continue // No messages, skip
				}

				const lastActivityTime = lastMessage.createdTimestamp
				const timeSinceLastActivity = now - lastActivityTime

				// Check if thread is inactive
				if (timeSinceLastActivity > inactivityThreshold) {
					await closeInactiveTicket(client, threadChannel, ticketData)
				}
			} catch (error) {
				// Handle error for individual ticket processing
				bunnyLog.error(
					`Error processing inactive ticket ${ticketData.ticket_id}:`,
					error
				)
			}
		}
	} catch (error) {
		bunnyLog.error(
			`Error checking inactive tickets for guild ${guild.id}:`,
			error
		)
	}
}

/**
 * Closes an inactive ticket
 * @param client - The Discord client
 * @param thread - The thread channel
 * @param ticketData - The ticket metadata
 */
async function closeInactiveTicket(
	client: Discord.Client,
	thread: Discord.ThreadChannel,
	ticketData: ExtendedThreadMetadata
): Promise<void> {
	try {
		// Get the plugin config to read settings
		const config = (await api.getPluginConfig(
			client.user.id,
			thread.guild.id,
			'tickets'
		)) as PluginResponse<DefaultConfigs['tickets']>

		// Get the threshold from config or use default
		const inactivityThreshold =
			config.auto_close &&
			Array.isArray(config.auto_close) &&
			config.auto_close.length > 0 &&
			config.auto_close[0].threshold
				? config.auto_close[0].threshold
				: INACTIVITY_THRESHOLD

		// Format the threshold into human-readable format
		const formattedThreshold =
			ticketsUtils.formatTimeThreshold(inactivityThreshold)

		// Create a reason for inactivity using format from config
		let reason = 'Ticket automatically closed due to inactivity.'

		// Try to get custom reason format from config
		if (
			config.auto_close &&
			Array.isArray(config.auto_close) &&
			config.auto_close.length > 0 &&
			config.auto_close[0].reason
		) {
			reason = config.auto_close[0].reason.replace(
				'{threshold}',
				formattedThreshold
			)
		}

		// Use the inactivity_notice template from components
		const inactivityMessage = await createTicketMessage(
			config,
			'inactivity_notice',
			{
				reason,
				threshold: formattedThreshold,
				ticket_id: ticketData.ticket_id || 'Unknown',
			}
		)

		// If no template was found or it's empty, use a fallback message
		if (
			!inactivityMessage.content &&
			!inactivityMessage.embeds?.length &&
			!inactivityMessage.components?.length
		) {
			// Fallback to default content
			const fallbackContent = [
				'# ⏰ Ticket Auto-Closed',
				'',
				'This ticket has been automatically closed due to inactivity.',
				'',
				'If you still need assistance, please open a new ticket.',
				'',
				'---',
				`*${reason}*`,
			].join('\n')

			await thread.send({ content: fallbackContent })
		} else {
			// Send the formatted template as BaseMessageOptions
			await thread.send(inactivityMessage)
		}

		// Get bot user as the interaction user for the close process
		const botUser = await client.users.fetch(client.user.id)

		// Create a mock interaction object with the minimum required properties
		// We use unknown to avoid type errors and then cast to ButtonInteraction
		const mockInteraction: unknown = {
			client,
			guild: thread.guild,
			channel: thread,
			user: botUser,
			memberPermissions: new Discord.PermissionsBitField([
				Discord.PermissionFlagsBits.ManageThreads,
			]),
			deferUpdate: async () => {}, // Empty function for the mock
			// Add minimal required properties to make it work with our functions
			deferred: true,
			replied: false,
			customId: 'mock_close_ticket',
			message: { id: 'mock_message_id' },
		}

		// Cast to ButtonInteraction
		const fakeInteraction = mockInteraction as Discord.ButtonInteraction

		// Get the metadata from database or memory
		let metadata = thread_metadata_store.get(thread.id)
		if (!metadata) {
			metadata = (await api.getTicketMetadata(
				client.user.id,
				thread.guild.id,
				thread.id
			)) as ExtendedThreadMetadata
			if (metadata) {
				thread_metadata_store.set(thread.id, metadata)
			}
		}

		// Update the metadata with system as the closer
		if (metadata) {
			metadata.closed_by = {
				id: client.user.id,
				username: client.user.username,
				displayName: client.user.username,
				avatar: client.user.displayAvatarURL({
					extension: client.user.avatar?.startsWith('a_') ? 'gif' : 'png',
				}),
			}

			// Update status fields
			metadata.status = 'closed'
			metadata.close_reason = reason
			metadata.close_time = new Date()
			thread_metadata_store.set(thread.id, metadata)

			// Update the database with the new metadata
			await api.updateTicketMetadata(
				client.user.id,
				thread.guild.id,
				thread.id,
				metadata as ThreadMetadata
			)

			// Delete admin channel message if exists
			if (metadata.join_ticket_message_id && metadata.admin_channel_id) {
				try {
					const adminChannel = (await thread.guild.channels.fetch(
						metadata.admin_channel_id
					)) as Discord.TextChannel

					if (adminChannel?.isTextBased()) {
						const joinTicketMessage = await adminChannel.messages
							.fetch(metadata.join_ticket_message_id)
							.catch(() => null)

						if (joinTicketMessage) {
							await joinTicketMessage.delete().catch((err) => {
								bunnyLog.error(
									`Error deleting admin message for ticket #${metadata.ticket_id}:`,
									err
								)
							})
						}
					}
				} catch (adminError) {
					bunnyLog.error(
						`Error handling admin message for ticket #${metadata.ticket_id}:`,
						adminError
					)
				}
			}
		}

		// Lock and archive the thread
		await thread.setLocked(true)
		await thread.setArchived(true)

		// Send transcript with inactivity reason
		await sendTranscript(fakeInteraction, reason)

		// Send rating survey to the user if opened_by user info exists
		if (metadata?.opened_by) {
			try {
				// Try to fetch the user who opened the ticket
				const user = await client.users.fetch(metadata.opened_by.id)
				if (user) {
					await sendRatingSurvey(user, metadata.ticket_id, thread.id)
				}
			} catch (surveyError) {
				bunnyLog.error(
					`Failed to send rating survey for ticket #${metadata.ticket_id}:`,
					surveyError
				)
			}
		}
	} catch (error) {
		bunnyLog.error('Error closing inactive ticket:', error)
	}
}

/**
 * Processes message components by replacing placeholders and building action rows
 * @param components - The components to process
 * @param placeholders - The placeholders to replace
 * @returns The processed action rows and any text content
 */
function processMessageComponents(
	components: ComponentsV2[],
	placeholders: Record<string, string | number>
): {
	actionRows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[]
	content: string
} {
	// Build content from text display components
	const contentParts: string[] = []

	// Process action rows and buttons to Discord.js components
	const actionRows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] = []

	for (const component of components) {
		if (component.type === Discord.ComponentType.ActionRow) {
			// ActionRow
			// For action rows, we need to process its components
			const actionRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()

			if (Array.isArray(component.components)) {
				for (const subComponent of component.components) {
					if (
						subComponent.type === Discord.ComponentType.Button ||
						subComponent.type === Discord.ComponentType.TextDisplay
					) {
						// Could be Button or TextDisplay
						if ('text' in subComponent) {
							// This is a TextDisplay component
							contentParts.push(
								replacePlaceholders(subComponent.text as string, placeholders)
							)
						} else {
							// This is a Button component
							const buttonBuilder = createButtonFromComponent(
								subComponent as unknown as API.Button,
								placeholders,
								actionRow.components.length
							)
							if (buttonBuilder) {
								actionRow.addComponents(buttonBuilder)
							}
						}
					}
				}
			}

			// Add the action row if it has any buttons
			if (actionRow.components.length > 0) {
				actionRows.push(actionRow)
			}
		}
	}

	// Join content parts with newlines to form a single content string
	const content = contentParts.join('\n')

	return { actionRows, content }
}

/**
 * Creates a button from a component definition
 * @param button - The button component
 * @param placeholders - The placeholders to replace in the button
 * @param index - The index of the button
 * @returns The button builder or null if the button is not valid
 */
function createButtonFromComponent(
	button: API.Button | API.TextDisplay,
	placeholders: Record<string, string | number>,
	index: number
): Discord.ButtonBuilder | null {
	try {
		// Make sure it's a button (type 2)
		if (!button || button.type !== Discord.ComponentType.Button) return null

		// Different component types have different properties
		// TextDisplay has 'text', Button has 'label' and 'style'
		if ('text' in button) {
			// This is a TextDisplay component, not a button
			return null
		}

		// Now we know it's a Button component
		const buttonComponent = button as API.Button

		if (!buttonComponent.label) return null
		if (!buttonComponent.style) return null

		// Parse values and replace placeholders
		const customId = buttonComponent.customId
			? replacePlaceholders(buttonComponent.customId, placeholders)
			: `button_${index}_${Date.now()}`
		const label = replacePlaceholders(buttonComponent.label, placeholders)

		// Create button using the correct style
		const buttonBuilder = new Discord.ButtonBuilder()
			.setLabel(label)
			.setStyle(buttonComponent.style as Discord.ButtonStyle)

		// Set custom ID or URL based on button style
		if (buttonComponent.style === Discord.ButtonStyle.Link) {
			if (!buttonComponent.url) return null
			const url = replacePlaceholders(buttonComponent.url, placeholders)
			buttonBuilder.setURL(url)
		} else {
			// For non-link buttons, we MUST set a customId
			buttonBuilder.setCustomId(customId)
		}

		return buttonBuilder
	} catch (error) {
		bunnyLog.error('Failed to create button from component:', error)
		return null
	}
}

/**
 * Creates a ticket message using either embed or component-based format
 * @param config - The ticket plugin configuration
 * @param templateKey - The key for the message template (e.g., 'open_ticket', 'closed_ticket')
 * @param placeholders - The placeholders to replace in the message
 * @returns The message options with embeds and components
 */
async function createTicketMessage(
	config: PluginResponse<DefaultConfigs['tickets']>,
	templateKey: keyof TicketTemplates,
	placeholders: Record<string, string | number>
): Promise<Discord.BaseMessageOptions> {
	// Default empty message if no templates are found
	const defaultMessageOptions: Discord.BaseMessageOptions = {}

	// Try component-based template first
	const template = config.components?.[templateKey]
	if (template) {
		return createMessageFromTemplate(
			config,
			template,
			templateKey,
			placeholders
		)
	}

	// Fall back to legacy embed format if available
	if (config.embeds?.[templateKey]) {
		bunnyLog.warn('Using deprecated embeds format for ticket messages', {
			guild_id: config.id,
			template_key: templateKey,
			message: 'Consider migrating to the new component-based format',
		})

		const { embed, action_rows } = createEmbed(
			config.embeds[templateKey] as unknown as TicketEmbedConfig,
			placeholders
		)

		return {
			embeds: [embed],
			components: action_rows,
		}
	}

	// No template found
	bunnyLog.warn('No template found for ticket message', {
		guild_id: config.id,
		template_key: templateKey,
	})

	return defaultMessageOptions
}

// Let's add a proper template type definition first
interface TicketTemplate {
	type: TicketDisplayMode | string // Allow either enum or string for compatibility
	embed?: unknown
	components?: ComponentsV2[]
}

/**
 * Creates a message from a template based on its type
 */
function createMessageFromTemplate(
	config: PluginResponse<DefaultConfigs['tickets']>,
	template: TicketTemplate,
	templateKey: keyof TicketTemplates,
	placeholders: Record<string, string | number>
): Discord.BaseMessageOptions {
	// Handle embed template type
	if (template.type === TicketDisplayMode.Embed) {
		return createEmbedMessage(config, template, templateKey, placeholders)
	}

	// Handle text template type
	if (template.type === TicketDisplayMode.Text) {
		return createTextMessage(template, placeholders)
	}

	// Handle any other template type
	return createDefaultComponentMessage(template, placeholders)
}

/**
 * Creates an embed message from a template
 */
function createEmbedMessage(
	config: PluginResponse<DefaultConfigs['tickets']>,
	template: TicketTemplate,
	templateKey: keyof TicketTemplates,
	placeholders: Record<string, string | number>
): Discord.BaseMessageOptions {
	// Check if embed exists in template
	if (template.embed) {
		const { embed, action_rows } = createEmbed(
			template.embed as TicketEmbedConfig,
			placeholders
		)

		return {
			embeds: [embed],
			components: action_rows,
		}
	}

	// Try to fall back to legacy format if available
	if (config.embeds?.[templateKey]) {
		bunnyLog.info('Using legacy embed for template', {
			template_key: templateKey,
			guild_id: config.id,
		})

		const { embed, action_rows } = createEmbed(
			config.embeds[templateKey] as unknown as TicketEmbedConfig,
			placeholders
		)

		return {
			embeds: [embed],
			components: action_rows,
		}
	}

	// No embed available, fall back to text mode
	bunnyLog.warn(
		'Embed type specified but no embed found, falling back to text mode',
		{
			template_key: templateKey,
			guild_id: config.id,
		}
	)

	return createTextMessage(template, placeholders)
}

/**
 * Creates a text message from a template
 */
function createTextMessage(
	template: TicketTemplate,
	placeholders: Record<string, string | number>
): Discord.BaseMessageOptions {
	const { actionRows, content } = processMessageComponents(
		template.components || [],
		placeholders
	)

	return {
		content: content || undefined, // Only set if not empty
		components: actionRows,
	}
}

/**
 * Creates a default component message
 */
function createDefaultComponentMessage(
	template: TicketTemplate,
	placeholders: Record<string, string | number>
): Discord.BaseMessageOptions {
	const { actionRows, content } = processMessageComponents(
		template.components || [],
		placeholders
	)

	return {
		content: content || undefined, // Only set if not empty
		components: actionRows,
	}
}

/**
 * Creates and sends a ticket panel to a specified channel
 * @param interaction - The interaction to respond to
 */
async function createTicketPanel(
	interaction: Discord.ChatInputCommandInteraction
) {
	// Defer the reply
	await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	// Get the target channel
	const target_channel = interaction.options.getChannel(
		'channel'
	) as Discord.TextChannel

	// Check if the channel is a valid text channel
	if (!target_channel?.isTextBased()) {
		// If the channel is not a valid text channel, send an error
		await utils.handleResponse(
			interaction,
			'error',
			'The specified channel is not a valid text channel. Please select a text channel where messages can be sent.',
			{
				code: 'TP001',
			}
		)
		return
	}

	// Get the plugin config
	const config = await api.getPluginConfig(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		'tickets'
	)

	// Check if the config is valid
	if (!config) {
		await utils.handleResponse(
			interaction,
			'warning',
			'No configuration found for the tickets plugin.',
			{
				code: 'TP002',
			}
		)
		return
	}

	// Get type parameter directly from the command (text or embed)
	const specifiedType = interaction.options.getString(
		'type'
	) as TicketDisplayMode

	// If user specified a type, update the template
	if (
		specifiedType &&
		(specifiedType === TicketDisplayMode.Text ||
			specifiedType === TicketDisplayMode.Embed)
	) {
		// Check if open_ticket component exists
		if (!config.components?.open_ticket) {
			// Create an empty open_ticket component if it doesn't exist
			if (!config.components) {
				config.components = {}
			}
			config.components.open_ticket = {
				type: specifiedType,
				components: [],
			}
		} else {
			// Update existing component type
			config.components.open_ticket.type = specifiedType
		}

		// If using embed type but no embed is defined, try to use legacy embed
		if (
			specifiedType === TicketDisplayMode.Embed &&
			!config.components.open_ticket.embed &&
			config.embeds?.open_ticket
		) {
			config.components.open_ticket.embed = config.embeds.open_ticket
		}
	}

	// Get the placeholders
	const placeholders = {
		user: interaction.user.toString(),
		guild_name: interaction.guild?.name || 'Server',
		guild_id: interaction.guild?.id || '',
	}

	try {
		// Log the configuration we're using
		bunnyLog.info('Creating ticket panel', {
			type: config.components?.open_ticket?.type || 'default',
			has_embed: !!config.components?.open_ticket?.embed,
			has_components: !!config.components?.open_ticket?.components,
		})

		// Create message options based on component-based or embed-based format
		const messageOptions = await createTicketMessage(
			config,
			'open_ticket',
			placeholders
		)

		// Send the message to the target channel
		const sentMessage = await target_channel.send(messageOptions)

		// Get the actual type that was used
		const usedType = config.components?.open_ticket?.type || 'default'

		// Send a success message with details
		await utils.handleResponse(
			interaction,
			'success',
			`Ticket panel sent successfully using ${usedType} template. [Jump to message](${sentMessage.url})`,
			{
				code: 'TP003',
			}
		)
	} catch (error) {
		// Log the error
		bunnyLog.error('Error sending ticket panel:', error)

		// Send an error message
		await utils.handleResponse(
			interaction,
			'error',
			"Failed to send the ticket panel. Please check the bot's permissions in the target channel and try again.",
			{
				code: 'TP004',
			}
		)
	}
}

export {
	sendEmbed,
	openTicket,
	closeTicket,
	closeTicketWithReason,
	confirmCloseTicket,
	claimTicket,
	joinTicket,
	modalSubmit,
	handleTicketRating,
	canUserOpenTicket,
	initTicketInactivityChecker,
	createTicketMessage,
	createButtonFromComponent,
	processMessageComponents,
	createTicketPanel,
}

// Store original configuration message and interaction for each guild
const original_config_interactions = new Map<
	string,
	| Discord.ChatInputCommandInteraction
	| Discord.StringSelectMenuInteraction
	| Discord.ButtonInteraction
>()
const original_config_messages = new Map<string, Discord.Message>()

/**
 * Handles the selected configuration option
 * @param interaction - The select menu interaction
 */
export async function handleConfigSelectMenu(
	interaction: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		const selectedOption = interaction.values[0]
		const ticketConfig = (await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)) as PluginResponse<DefaultConfigs['tickets']>

		// Defer update first to avoid timeout
		await interaction.deferUpdate().catch((err) => {
			bunnyLog.error(`Failed to defer update: ${err.message}`)
			// If deferred fails, we'll try to continue anyway
		})

		// For auto-close settings, use regular components instead of modal
		if (selectedOption === 'auto_close') {
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
			const formattedThreshold = ticketsUtils.formatTimeThreshold(
				autoClose.threshold
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

		// For role time limits option
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

				// Add clear roles button and back button
				const backRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						new Discord.ButtonBuilder()
							.setCustomId('ticket_clear_mod_roles')
							.setLabel('Clear All Roles')
							.setStyle(Discord.ButtonStyle.Danger),
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

export const handleComponentInteraction = async (
	interaction:
		| Discord.ButtonInteraction
		| Discord.StringSelectMenuInteraction
		| Discord.ChannelSelectMenuInteraction
		| Discord.RoleSelectMenuInteraction
		| Discord.ModalSubmitInteraction
) => {
	const customId = interaction.customId

	try {
		// Basic ticket operation button handlers
		if (interaction.isButton()) {
			// Handle pagination buttons from ticket list
			if (customId === 'prev_page' || customId === 'next_page') {
				// These are handled by the collector in the list function
				// We need to return here to prevent the default handler from executing
				return
			}

			if (customId.startsWith('close_ticket_')) {
				await closeTicketWithReason(interaction)
				return
			}
			if (customId.startsWith('claim_ticket_')) {
				await claimTicket(interaction)
				return
			}
			if (customId.startsWith('join_ticket_')) {
				await joinTicket(interaction)
				return
			}
			if (customId.startsWith('confirm_close_ticket_')) {
				await confirmCloseTicket(interaction)
				return
			}

			// Handle ticket config back button
			if (customId === 'ticket_config_back') {
				await handleBackToMainConfig(interaction)
				return
			}

			// Handle auto-close related buttons
			if (customId === 'autoclose_enable' || customId === 'autoclose_disable') {
				await handleAutoCloseToggle(
					interaction,
					customId === 'autoclose_enable'
				)
				return
			}

			if (customId === 'autoclose_set_reason') {
				await handleSetAutoCloseReason(interaction)
				return
			}

			if (customId === 'autoclose_back') {
				await handleAutoCloseBack(interaction)
				return
			}

			// Handle role time limit buttons
			if (customId === ROLE_TIME_LIMIT_ADD_BUTTON_ID) {
				await handleAddRoleTimeLimitComponent(interaction)
				return
			}

			if (customId === ROLE_TIME_LIMIT_REMOVE_BUTTON_ID) {
				await handleRemoveRoleTimeLimit(interaction)
				return
			}

			// Handle Clear All Mod Roles button
			if (customId === 'ticket_clear_mod_roles') {
				try {
					await interaction.deferUpdate()

					// Get current config
					const config = await api.getPluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets'
					)

					// Clear the mod roles
					config.mods_role_ids = []

					// Save the updated config
					await api.updatePluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets',
						config
					)

					// Return to the main config panel first
					await handleBackToMainConfig(interaction)

					// Show confirmation
					await utils.handleResponse(
						interaction,
						'success',
						'All moderator roles have been cleared.',
						{
							renderAsText: true,
							ephemeral: true,
						}
					)
				} catch (error) {
					bunnyLog.error('Failed to clear moderator roles:', error)
					await utils.handleResponse(
						interaction,
						'error',
						'Failed to clear moderator roles. Please try again.',
						{ code: 'TCH004' }
					)
				}
				return
			}

			// Default to opening a ticket for other buttons
			await openTicket(interaction)
			return
		}

		// Handle ticket config select menu
		if (
			interaction.isStringSelectMenu() &&
			customId === 'ticket_config_select'
		) {
			await handleConfigSelectMenu(interaction)
			return
		}

		// Handle auto-close time selection menus
		if (
			interaction.isStringSelectMenu() &&
			(customId === 'autoclose_time_unit_select' ||
				customId === 'autoclose_predefined_select' ||
				customId.startsWith('autoclose_value_'))
		) {
			await handleAutoCloseTimeSelect(interaction)
			return
		}

		// Handle role time limit selection
		if (
			interaction.isStringSelectMenu() &&
			customId === ROLE_TIME_LIMIT_REMOVE_SELECT_ID
		) {
			await handleRemoveRoleTimeLimitSelect(interaction)
			return
		}

		// Handle time limit selection for role time limits
		if (
			interaction.isStringSelectMenu() &&
			(customId === 'time_limit_unit_select' ||
				customId === 'time_limit_predefined_select' ||
				customId.startsWith('time_limit_value_'))
		) {
			// These are handled by collectors in their respective functions
			return
		}

		// Modal submit handlers
		if (interaction.isModalSubmit()) {
			if (customId === 'close_ticket_modal') {
				await modalSubmit(interaction)
				return
			}

			if (customId === 'autoclose_reason_modal') {
				await handleAutoCloseReasonModal(interaction)
				return
			}

			if (customId === 'autoclose_custom_time_modal') {
				const customTime =
					interaction.fields.getTextInputValue('custom_time_input')
				await handleAutoCloseCustomTime(interaction, customTime)
				return
			}

			if (customId === 'ticket_autoclose_modal') {
				await handleTicketAutocloseModal(interaction)
				return
			}
		}

		// Channel select handlers for ticket configuration
		if (interaction.isChannelSelectMenu()) {
			if (
				customId === 'ticket_admin_channel' ||
				customId === 'ticket_transcript_channel'
			) {
				try {
					await interaction.deferUpdate()

					bunnyLog.info(
						`Channel selected for ${customId}:`,
						interaction.values[0]
					)

					// Get current config
					const config = await api.getPluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets'
					)

					// Update the appropriate channel ID
					if (customId === 'ticket_admin_channel') {
						config.admin_channel_id = interaction.values[0]
					} else if (customId === 'ticket_transcript_channel') {
						config.transcript_channel_id = interaction.values[0]
					}

					// Save the updated config
					await api.updatePluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets',
						config
					)

					// Return to the main config panel first
					await handleBackToMainConfig(
						interaction as unknown as Discord.ButtonInteraction
					)

					// Create friendly name for the channel
					const channel = await interaction.guild?.channels.fetch(
						interaction.values[0]
					)
					const channelName = channel
						? `#${channel.name}`
						: interaction.values[0]

					// Show success message
					await utils.handleResponse(
						interaction,
						'success',
						`${customId === 'ticket_admin_channel' ? 'Admin' : 'Transcript'} channel updated to ${channelName}.`,
						{ ephemeral: true }
					)
				} catch (error) {
					bunnyLog.error(`Failed to update ${customId}:`, error)
					await utils.handleResponse(
						interaction,
						'error',
						`Failed to update ${customId === 'ticket_admin_channel' ? 'admin' : 'transcript'} channel. Please try again.`,
						{ code: 'CT005' }
					)
				}
				return
			}
		}

		// Role select handlers for ticket configuration
		if (interaction.isRoleSelectMenu()) {
			if (customId === 'ticket_mod_roles') {
				try {
					await interaction.deferUpdate()
					// bunnyLog.info('Mod roles selected:', interaction.values)

					// Get current config
					const config = await api.getPluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets'
					)

					// Update the mod roles
					config.mods_role_ids = interaction.values

					// Save the updated config
					await api.updatePluginConfig(
						interaction.client.user.id,
						interaction.guild?.id as Discord.Guild['id'],
						'tickets',
						config
					)

					// Return to the main config panel first
					await handleBackToMainConfig(
						interaction as unknown as Discord.ButtonInteraction
					)

					const rolesText =
						interaction.values.length > 0
							? interaction.values.map((id) => `<@&${id}>`).join(', ')
							: 'None (using server permissions)'

					// Show confirmation AFTER returning to main menu to avoid race conditions
					await utils.handleResponse(
						interaction,
						'success',
						`Moderator roles set to: ${rolesText}`,
						{ ephemeral: true }
					)
				} catch (error) {
					bunnyLog.error('Failed to update moderator roles:', error)
					await utils.handleResponse(
						interaction,
						'error',
						'Failed to update moderator roles.',
						{ code: 'TCH003' }
					)
				}
				return
			}

			if (customId === 'time_limit_role_select') {
				// This is handled by the collector in handleAddRoleTimeLimitComponent
				return
			}
		}

		// Log any unhandled interactions
		bunnyLog.info(`Unhandled interaction with customId: ${customId}`)
	} catch (error) {
		bunnyLog.error(
			`Error in component interaction handler: ${error.message}`,
			error
		)

		// Try to respond with an error if possible
		try {
			if (!interaction.replied && !interaction.deferred) {
				// For button interactions and similar, just defer
				if ('deferUpdate' in interaction) {
					await interaction.deferUpdate().catch(() => {})
				}

				// Try to send an ephemeral message
				if ('followUp' in interaction) {
					await interaction
						.followUp({
							content: 'An error occurred processing your request.',
							ephemeral: true,
						})
						.catch(() => {})
				}
			}
		} catch (e) {
			// Silently fail if we can't respond
			bunnyLog.error(`Failed to send error response: ${e.message}`)
		}
	}
}

/**
 * Handles role time limits configuration
 * @param interaction - The select menu interaction
 * @param config - The ticket configuration
 */
export async function handleRoleTimeLimitsConfig(
	interaction: Discord.ButtonInteraction | Discord.StringSelectMenuInteraction,
	config: PluginResponse<DefaultConfigs['tickets']>
): Promise<void> {
	try {
		await interaction.deferUpdate().catch(() => {
			// Ignore if already deferred
		})

		// Format current role time limits
		const roleTimeLimits = config.role_time_limits || []

		// Create buttons for add/remove role limits
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

		// Prepare list of limits for display
		let limitsText = '> No role time limits configured yet.'
		if (roleTimeLimits.length > 0) {
			// Fetch role information for each time limit
			const guildRoles = await interaction.guild?.roles.fetch()
			const limitsInfo = roleTimeLimits.map((limit, index) => {
				const role = guildRoles?.get(limit.role_id)
				return {
					roleName: role ? `<@&${role.id}>` : `Role ID: ${limit.role_id}`,
					limit: limit.limit,
					index: index + 1,
				}
			})

			// Format the limits info
			const limitLines = limitsInfo.map(
				(info) => `**${info.index}.** ${info.roleName}: ${info.limit}`
			)
			limitsText = limitLines.join('\n')
		}

		// Create content with better formatting and explanations
		const content = [
			'# Role Time Limits Configuration',
			'',
			'Role time limits allow you to control how frequently users with specific roles can create new tickets.',
			'For example, you can set that users with @Member role can only create a new ticket every 24 hours.',
			'',
			'## Current Limits',
			limitsText,
			'',
			'## Format',
			'Time limits use the format: `Xm` (minutes), `Xh` (hours), `Xd` (days), or `Xw` (weeks)',
			'Example: `12h` = 12 hours, `3d` = 3 days, `1w` = 1 week',
			'',
			'Use the buttons below to manage role time limits:',
		].join('\n')

		// Update the message with role time limits configuration panel
		await interaction.editReply({
			content,
			components: [actionRow],
		})

		// Store the original interaction for later updates
		const cacheKey = `${interaction.guild.id}_role_time_limits`
		original_config_interactions.set(cacheKey, interaction)
	} catch (error) {
		bunnyLog.error('Error handling role time limits config:', error)
		await interaction.followUp({
			content:
				'Failed to load role time limits configuration. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Handles the back button to return to the main configuration panel
 * @param interaction - The button interaction
 */
export async function handleBackToMainConfig(
	interaction: Discord.ButtonInteraction
) {
	// Only try to defer if the interaction hasn't already been responded to
	// Use a try-catch to handle the case where the interaction has already been deferred
	try {
		// Check if the interaction has been responded to
		if (!interaction.deferred && !interaction.replied) {
			await interaction.deferUpdate()
		}
	} catch (e) {
		bunnyLog.error(`Failed to defer update in back button: ${e.message}`)
		// Continue attempt anyway - the operation might still work
	}

	try {
		// Get current configuration
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
			? ticketsUtils.formatTimeThreshold(ticketConfig.auto_close[0].threshold)
			: 'Not set'

		// Format role time limits for display
		const roleTimeLimits = ticketConfig.role_time_limits?.length
			? `${ticketConfig.role_time_limits.length} roles configured`
			: 'None'

		// Create the main config content using the content builder
		const configContent = CONTENT_BUILDERS.createMainConfigContent({
			Status: ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled',
			'Admin Channel': adminChannel,
			'Transcript Channel': transcriptChannel,
			'Moderator Roles': modRoles,
			'Auto-close': `${autoCloseEnabled} (${autoCloseThreshold})`,
			'Role Time Limits': roleTimeLimits,
		})

		// Send the config panel
		await interaction.editReply({
			content: configContent,
			components: [row],
		})
	} catch (error) {
		bunnyLog.error('Error returning to main config:', error)
		await interaction
			.followUp({
				content:
					'Failed to return to main configuration. Please try using the command again.',
				flags: Discord.MessageFlags.Ephemeral,
			})
			.catch(() => {}) // Ignore errors here
	}
}

interface TicketData {
	ticket_id: string | number
	status?: string
	thread_id?: string
	opened_by?: {
		id: string
		username?: string
		displayName?: string
	}
	open_time?: number
	ticket_type?: string
	claimed_by?:
		| {
				id: string
				username?: string
				displayName?: string
		  }
		| string
}

/**
 * Handles the ticket configuration command
 * @param interaction - The command interaction
 */
export async function config(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	// Defer reply to give us time to process
	await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	try {
		// Get the plugin config
		const ticketConfig = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

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
			? ticketsUtils.formatTimeThreshold(ticketConfig.auto_close[0].threshold)
			: 'Not set'

		// Format role time limits for display
		const roleTimeLimits = ticketConfig.role_time_limits?.length
			? `${ticketConfig.role_time_limits.length} roles configured`
			: 'None'

		// Create the main config content using the content builder
		const configContent = CONTENT_BUILDERS.createMainConfigContent({
			Status: ticketConfig.enabled ? '✅ Enabled' : '❌ Disabled',
			'Admin Channel': adminChannel,
			'Transcript Channel': transcriptChannel,
			'Moderator Roles': modRoles,
			'Auto-close': `${autoCloseEnabled} (${autoCloseThreshold})`,
			'Role Time Limits': roleTimeLimits,
		})

		// Send the config panel
		await interaction.editReply({
			content: configContent,
			components: [row],
		})
	} catch (error) {
		bunnyLog.error('Error displaying ticket config:', error)
		await utils.handleResponse(
			interaction,
			'error',
			'Failed to load ticket configuration.',
			{ code: 'TKCFG001' }
		)
	}
}

/**
 * Lists all active tickets
 * @param interaction - The interaction to handle
 */
export async function list(
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
 * Handles the auto-close toggle buttons, enabling or disabling auto-close functionality
 * @param interaction - The button interaction
 * @param enable - Whether to enable (true) or disable (false) auto-close
 */
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

		// Create the toggle buttons row
		const toggleRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_enable')
					.setLabel('Enable')
					.setStyle(
						enable ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary
					)
					.setDisabled(enable),
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_disable')
					.setLabel('Disable')
					.setStyle(
						!enable ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Secondary
					)
					.setDisabled(!enable),
				new Discord.ButtonBuilder()
					.setCustomId('autoclose_set_reason')
					.setLabel('Set Reason')
					.setStyle(Discord.ButtonStyle.Primary)
			)

		// Create time select menu with explicit array
		const timeUnitOptions = [
			{ label: 'Minutes', value: 'minutes' },
			{ label: 'Hours', value: 'hours' },
			{ label: 'Days', value: 'days' },
			{ label: 'Weeks', value: 'weeks' },
			{ label: 'Predefined Values', value: 'predefined' },
		]

		const timeUnitSelectRow = UI_BUILDERS.createTimeUnitMenuRow(
			'autoclose_time_unit_select',
			'Select time unit for threshold'
		)

		// Create back button row
		const backRow = UI_BUILDERS.createBackButtonRow()

		// Get auto-close settings
		const autoClose = config.auto_close?.[0] || {
			enabled: false,
			threshold: 72 * 60 * 60 * 1000,
			reason: 'Ticket automatically closed due to inactivity.',
		}

		// Format the threshold
		const formattedThreshold = ticketsUtils.formatTimeThreshold(
			autoClose.threshold
		)

		// Create the content for display
		const content = [
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
		].join('\n')

		// Update the message
		await interaction.editReply({
			content,
			components: [toggleRow, timeUnitSelectRow, backRow],
		})

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

/**
 * Handles auto-close time selection menus
 * @param interaction - The select menu interaction
 */
async function handleAutoCloseTimeSelect(
	interaction: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Handle unit selection first
		if (interaction.customId === 'autoclose_time_unit_select') {
			const selectedUnit = interaction.values[0]

			if (selectedUnit === 'predefined') {
				// Show predefined time limit options
				const predefinedSelectRow =
					new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
						UI_BUILDERS.createPredefinedTimeMenu('autoclose_predefined_select')
					)

				// Add back buttons
				const backRow =
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						UI_BUILDERS.createBackButton(
							'autoclose_back',
							'Back to Auto-close Settings'
						),
						UI_BUILDERS.createBackButton()
					)

				await interaction.editReply({
					content:
						'## Set Auto-close Threshold\n\nSelect a predefined time limit:',
					components: [predefinedSelectRow, backRow],
				})
				return
			}

			// For specific time units, create appropriate options
			const options: { label: string; value: string }[] = []

			// Generate time value options based on the selected unit
			if (selectedUnit === 'minutes') {
				options.push(
					...ticketsUtils.UI_COMPONENTS.TIME_UNIT_OPTIONS.filter(
						(option) => option.value === 'minutes'
					)
				)
			} else if (selectedUnit === 'hours') {
				options.push(
					...ticketsUtils.UI_COMPONENTS.TIME_UNIT_OPTIONS.filter(
						(option) => option.value === 'hours'
					)
				)
			} else if (selectedUnit === 'days') {
				options.push(
					...ticketsUtils.UI_COMPONENTS.TIME_UNIT_OPTIONS.filter(
						(option) => option.value === 'days'
					)
				)
			} else if (selectedUnit === 'weeks') {
				options.push(
					...ticketsUtils.UI_COMPONENTS.TIME_UNIT_OPTIONS.filter(
						(option) => option.value === 'weeks'
					)
				)
			}

			const valueSelectRow =
				new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
					new Discord.StringSelectMenuBuilder()
						.setCustomId(`autoclose_value_${selectedUnit}`)
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

			// Process the value
			await handleAutoCloseCustomTime(interaction, selectedValue)
		}
	} catch (error) {
		bunnyLog.error('Error handling auto-close time selection:', error)
		await interaction.followUp({
			content: 'Failed to update auto-close time threshold. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Handles the submission of a custom time value for auto-close
 * @param interaction - The interaction that triggered this handler
 * @param timeValue - The time value string
 */
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

		// Parse the time value
		const timeLimitMs = ticketsUtils.parseTimeLimit(timeValue)
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

		// Get the components for auto-close settings
		const { toggleRow, timeUnitRow, backRow } =
			createAutoCloseSettingsComponents(config)

		// Get auto-close settings
		const autoClose = config.auto_close[0]

		// Create the content for display
		const content = CONTENT_BUILDERS.createAutoCloseSettingsContent({
			status: autoClose.enabled ? '✅ Enabled' : '❌ Disabled',
			threshold: formatTimeThreshold(autoClose.threshold),
			reason: autoClose.reason,
		})

		// Update the message with auto-close configuration panel
		await interaction.editReply({
			content,
			components: [toggleRow, timeUnitRow, backRow],
		})

		// Get the formatted threshold for display
		const formattedThreshold = formatTimeThreshold(timeLimitMs)

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

/**
 * Handles the submission of the auto-close reason modal
 * @param interaction - The modal submit interaction
 */
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

		// Get auto-close settings
		const autoClose = config.auto_close[0]

		// Get the components for auto-close settings
		const { toggleRow, timeUnitRow, backRow } =
			createAutoCloseSettingsComponents(config)

		// Create the content for display
		const content = CONTENT_BUILDERS.createAutoCloseSettingsContent({
			status: autoClose.enabled ? '✅ Enabled' : '❌ Disabled',
			threshold: formatTimeThreshold(autoClose.threshold),
			reason: autoClose.reason,
		})

		// Update the message with auto-close configuration panel
		await interaction.editReply({
			content,
			components: [toggleRow, timeUnitRow, backRow],
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
 * Handles adding role time limits
 * @param interaction - The button interaction
 */
async function handleAddRoleTimeLimitComponent(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Create role select menu
		const roleSelectRow =
			new Discord.ActionRowBuilder<Discord.RoleSelectMenuBuilder>().addComponents(
				new Discord.RoleSelectMenuBuilder()
					.setCustomId('time_limit_role_select')
					.setPlaceholder('Select a role to add time limit')
			)

		// Add back button
		const backRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('ticket_config_back')
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Update message with role select menu
		await interaction.editReply({
			content:
				'## Add Role Time Limit\n\nSelect a role to add a time limit to:',
			components: [roleSelectRow, backRow],
		})

		// Create collector for role selection
		const message = await interaction.fetchReply()
		const roleCollector = message.createMessageComponentCollector({
			filter: (i) =>
				i.customId === 'time_limit_role_select' &&
				i.user.id === interaction.user.id,
			time: 300000,
			max: 1,
		})

		roleCollector.on('collect', async (roleInteraction) => {
			try {
				await roleInteraction.deferUpdate()

				if (!roleInteraction.isRoleSelectMenu()) return

				const selectedRoleId = roleInteraction.values[0]

				// Create time unit select menu
				const timeUnitSelectRow = UI_BUILDERS.createTimeUnitMenuRow(
					'time_limit_unit_select'
				)

				// Update message with time unit selection
				await roleInteraction.editReply({
					content: `## Add Time Limit for <@&${selectedRoleId}>\n\nSelect a time unit:`,
					components: [timeUnitSelectRow, backRow],
				})

				// Create collector for time unit selection
				const timeUnitCollector = message.createMessageComponentCollector({
					filter: (i) =>
						(i.customId === 'time_limit_unit_select' ||
							i.customId === 'time_limit_predefined_select' ||
							i.customId.startsWith('time_limit_value_')) &&
						i.user.id === interaction.user.id,
					time: 300000,
				})

				timeUnitCollector.on('collect', async (timeInteraction) => {
					if (!timeInteraction.isStringSelectMenu()) return

					await timeInteraction.deferUpdate()

					// Handle time unit selection
					if (timeInteraction.customId === 'time_limit_unit_select') {
						const selectedUnit = timeInteraction.values[0]

						if (selectedUnit === 'predefined') {
							const predefinedSelectRow =
								new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
									UI_BUILDERS.createPredefinedTimeMenu(
										'time_limit_predefined_select'
									)
								)

							// Update message with predefined options
							await timeInteraction.editReply({
								content: `## Add Time Limit for <@&${selectedRoleId}>\n\nSelect a predefined time limit:`,
								components: [predefinedSelectRow, backRow],
							})
						} else {
							// For specific units, create options
							const options: { label: string; value: string }[] = []

							switch (selectedUnit) {
								case 'minutes':
									for (let i = 5; i <= 60; i += 5) {
										options.push({
											label: `${i} minutes`,
											value: i.toString(),
										})
									}
									break
								case 'hours':
									for (let i = 1; i <= 24; i++) {
										options.push({ label: `${i} hours`, value: i.toString() })
									}
									break
								case 'days':
									for (let i = 1; i <= 30; i++) {
										options.push({ label: `${i} days`, value: i.toString() })
									}
									break
								case 'weeks':
									for (let i = 1; i <= 4; i++) {
										options.push({ label: `${i} weeks`, value: i.toString() })
									}
									break
							}

							const valueSelectRow =
								new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
									new Discord.StringSelectMenuBuilder()
										.setCustomId(`time_limit_value_${selectedUnit}`)
										.setPlaceholder(`Select number of ${selectedUnit}`)
										.addOptions(options)
								)

							// Update message with value selection
							await timeInteraction.editReply({
								content: `## Add Time Limit for <@&${selectedRoleId}>\n\nSelect a value:`,
								components: [valueSelectRow, backRow],
							})
						}
					} else if (
						timeInteraction.customId === 'time_limit_predefined_select'
					) {
						// Handle predefined time selection
						const timeValue = timeInteraction.values[0]
						await saveRoleTimeLimit(timeInteraction, selectedRoleId, timeValue)
						timeUnitCollector.stop()
					} else if (timeInteraction.customId.startsWith('time_limit_value_')) {
						// Handle specific value selection
						const selectedValue = timeInteraction.values[0]
						const timeUnit = timeInteraction.customId.replace(
							'time_limit_value_',
							''
						)

						// Map unit to suffix
						const unitSuffix =
							timeUnit === 'minutes'
								? 'm'
								: timeUnit === 'hours'
									? 'h'
									: timeUnit === 'days'
										? 'd'
										: timeUnit === 'weeks'
											? 'w'
											: ''

						// Save with proper format
						await saveRoleTimeLimit(
							timeInteraction,
							selectedRoleId,
							`${selectedValue}${unitSuffix}`
						)
						timeUnitCollector.stop()
					}
				})

				// Handle time unit collector end
				timeUnitCollector.on('end', async (collected, reason) => {
					if (reason === 'time' && collected.size === 0) {
						// Timeout with no selection
						await interaction.followUp({
							content: 'Time limit selection timed out.',
							ephemeral: true,
						})
					}
				})
			} catch (error) {
				bunnyLog.error('Error handling role selection:', error)
				await interaction.followUp({
					content: 'An error occurred while processing role selection.',
					ephemeral: true,
				})
			}
		})

		// Handle role collector end
		roleCollector.on('end', async (collected, reason) => {
			if (reason === 'time' && collected.size === 0) {
				// Timeout with no selection
				await interaction.followUp({
					content: 'Role selection timed out.',
					ephemeral: true,
				})
			}
		})
	} catch (error) {
		bunnyLog.error('Error handling add role time limit:', error)
		await interaction.followUp({
			content: 'Failed to add role time limit. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Saves a role time limit to the configuration
 * @param interaction - The interaction that triggered this save
 * @param roleId - The role ID to add the limit to
 * @param timeLimit - The time limit value
 */
async function saveRoleTimeLimit(
	interaction: Discord.StringSelectMenuInteraction,
	roleId: string,
	timeLimit: string
): Promise<void> {
	try {
		const timeLimitMs = ticketsUtils.parseTimeLimit(timeLimit)
		if (timeLimitMs === 0) {
			await interaction.followUp({
				content: `Invalid time format: "${timeLimit}". Please use formats like 12h, 3d, or 1w.`,
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

		// Initialize role_time_limits array if needed
		if (!config.role_time_limits) {
			config.role_time_limits = []
		}

		// Check if this role already has a limit
		const existingIndex = config.role_time_limits.findIndex(
			(limit) => limit.role_id === roleId
		)

		if (existingIndex !== -1) {
			// Update existing limit
			config.role_time_limits[existingIndex].limit = timeLimit
		} else {
			// Add new limit
			config.role_time_limits.push({
				role_id: roleId,
				limit: timeLimit,
			})
		}

		// Save config
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Get role name for display
		const role = await interaction.guild?.roles.fetch(roleId)
		const roleName = role?.name || 'Unknown role'

		// Show success message
		await interaction.followUp({
			content: `Time limit for @${roleName} set to ${timeLimit} between tickets.`,
			ephemeral: true,
		})

		// Return to time limits config page
		await handleRoleTimeLimitsConfig(interaction, config)
	} catch (error) {
		bunnyLog.error('Error saving role time limit:', error)
		await interaction.followUp({
			content: 'Failed to save role time limit. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Handles removal of role time limits
 * @param interaction - The button interaction
 */
async function handleRemoveRoleTimeLimit(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Check if there are any limits to remove
		if (
			!config.role_time_limits ||
			!Array.isArray(config.role_time_limits) ||
			config.role_time_limits.length === 0
		) {
			await interaction.followUp({
				content: 'There are no role time limits to remove.',
				ephemeral: true,
			})

			// Return to time limits config page
			await handleRoleTimeLimitsConfig(interaction, config)
			return
		}

		// Generate options for select menu from existing limits
		const limitOptions = await Promise.all(
			config.role_time_limits.map(async (limit, index) => {
				const role = await interaction.guild?.roles.fetch(limit.role_id)
				return {
					label: role ? `@${role.name}` : `Role ID: ${limit.role_id}`,
					description: `Current limit: ${limit.limit}`,
					value: index.toString(),
				}
			})
		)

		// Create select menu
		const selectRow =
			new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
				new Discord.StringSelectMenuBuilder()
					.setCustomId(ROLE_TIME_LIMIT_REMOVE_SELECT_ID)
					.setPlaceholder('Select a role limit to remove')
					.addOptions(limitOptions)
			)

		// Add back button
		const backRow =
			new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				new Discord.ButtonBuilder()
					.setCustomId('ticket_config_back')
					.setLabel('Back to Main Menu')
					.setStyle(Discord.ButtonStyle.Secondary)
			)

		// Update message with remove selection
		await interaction.editReply({
			content:
				'## Remove Role Time Limit\n\nSelect a role time limit to remove:',
			components: [selectRow, backRow],
		})
	} catch (error) {
		bunnyLog.error('Error handling remove role time limit:', error)
		await interaction.followUp({
			content: 'Failed to load role time limits. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Handles selection of role time limit to remove
 * @param interaction - The select menu interaction
 */
async function handleRemoveRoleTimeLimitSelect(
	interaction: Discord.StringSelectMenuInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Get the selected limit index
		const selectedIndex = Number.parseInt(interaction.values[0], 10)

		// Check if index is valid
		if (
			!config.role_time_limits ||
			!Array.isArray(config.role_time_limits) ||
			selectedIndex < 0 ||
			selectedIndex >= config.role_time_limits.length
		) {
			await interaction.followUp({
				content: 'Invalid selection. Please try again.',
				ephemeral: true,
			})
			return
		}

		// Get role info for confirmation message
		const roleId = config.role_time_limits[selectedIndex].role_id
		const role = await interaction.guild?.roles.fetch(roleId)
		const roleName = role?.name || 'Unknown role'
		const timeLimit = config.role_time_limits[selectedIndex].limit

		// Remove the selected limit
		config.role_time_limits.splice(selectedIndex, 1)

		// Save config
		await api.updatePluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets',
			config
		)

		// Show confirmation
		await interaction.followUp({
			content: `Time limit for @${roleName} (${timeLimit}) has been removed.`,
			ephemeral: true,
		})

		// Return to time limits config page
		await handleRoleTimeLimitsConfig(interaction, config)
	} catch (error) {
		bunnyLog.error('Error removing role time limit:', error)
		await interaction.followUp({
			content: 'Failed to remove role time limit. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Handles auto-close ticket modal (placeholder handler)
 * @param interaction - The modal submit interaction
 */
async function handleTicketAutocloseModal(
	interaction: Discord.ModalSubmitInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		await interaction.followUp({
			content: 'Auto-close settings updated.',
			ephemeral: true,
		})

		// Return to main config
		await handleBackToMainConfig(
			interaction as unknown as Discord.ButtonInteraction
		)
	} catch (error) {
		bunnyLog.error('Error handling ticket autoclose modal:', error)
		await interaction.followUp({
			content: 'Failed to process autoclose settings. Please try again.',
			ephemeral: true,
		})
	}
}

/**
 * Handles setting the auto-close reason button
 * @param interaction - The button interaction
 */
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

		// Get the current reason or default
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

/**
 * Handles going back to the auto-close settings
 * @param interaction - The button interaction
 */
async function handleAutoCloseBack(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	try {
		await interaction.deferUpdate()

		// Get current config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Get auto-close settings
		const autoClose = config.auto_close?.[0] ?? {
			enabled: false,
			threshold: 72 * 60 * 60 * 1000, // 72 hours default
			reason: 'Ticket automatically closed due to inactivity.',
		}

		// Get the components for auto-close settings
		const { toggleRow, timeUnitRow, backRow } =
			createAutoCloseSettingsComponents(config)

		// Create the content for display
		const content = CONTENT_BUILDERS.createAutoCloseSettingsContent({
			status: autoClose.enabled ? '✅ Enabled' : '❌ Disabled',
			threshold: formatTimeThreshold(autoClose.threshold),
			reason: autoClose.reason,
		})

		// Update the message
		await interaction.editReply({
			content,
			components: [toggleRow, timeUnitRow, backRow],
		})
	} catch (error) {
		bunnyLog.error('Error handling auto-close back button:', error)
		await interaction.followUp({
			content: 'Failed to return to auto-close settings. Please try again.',
			ephemeral: true,
		})
	}
}
