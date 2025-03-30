import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import * as utils from '@/utils/index.js'
import { bunnyLog } from 'bunny-log'
import type { ThreadMetadata } from '@/types/tickets.js'
import type { PluginResponse, DefaultConfigs } from '@/types/plugins.js'

const thread_metadata_store = new Map<string, ThreadMetadata>()

/**
 * Parse a time string in format like "15m", "1h", "7d" to milliseconds
 * @param timeStr - The time string to parse (e.g. "15m", "1h", "7d", "1y")
 * @returns The time in milliseconds
 */
function parseTimeLimit(timeStr: string): number {
	// Default to 0 if invalid
	if (!timeStr || typeof timeStr !== 'string') return 0

	const regex = /^(\d+)([smhdy])$/
	const match = timeStr.match(regex)

	if (!match) return 0

	const value = Number.parseInt(match[1], 10)
	const unit = match[2]

	// Convert to milliseconds based on unit
	let result = 0
	switch (unit) {
		case 's':
			result = value * 1000 // seconds
			break
		case 'm':
			result = value * 60 * 1000 // minutes
			break
		case 'h':
			result = value * 60 * 60 * 1000 // hours
			break
		case 'd':
			result = value * 24 * 60 * 60 * 1000 // days
			break
		case 'y':
			result = value * 365 * 24 * 60 * 60 * 1000 // years (approximate)
			break
		default:
			result = 0
	}

	// console.log(
	// 	`Parsed time limit: "${timeStr}" => ${result}ms (${value} ${unit})`,
	// );
	return result
}

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
	// If no role time limits are set, allow by default
	if (!config.role_time_limits || config.role_time_limits.length === 0) {
		return { canOpen: true }
	}

	// Get the member's roles
	const member = interaction.member as Discord.GuildMember
	if (!member) return { canOpen: true } // If no member, allow by default

	// Check if user has admin permissions - bypass time limits for admins
	const hasAdminPermission =
		member.permissions.has(Discord.PermissionFlagsBits.Administrator) ||
		member.permissions.has(Discord.PermissionFlagsBits.ManageGuild)

	// Admins can always open tickets regardless of time limits
	if (hasAdminPermission) {
		return { canOpen: true }
	}

	// Get the user's existing tickets
	const tickets = await api.getUserTickets(
		interaction.client.user.id,
		interaction.guild?.id as Discord.Guild['id'],
		interaction.user.id
	)

	if (!tickets || tickets.length === 0) return { canOpen: true } // No previous tickets

	// Get the latest ticket's open time
	const latestTicket = tickets.reduce((latest, current) => {
		return !latest || current.open_time > latest.open_time ? current : latest
	}, null)

	if (!latestTicket || !latestTicket.open_time) return { canOpen: true } // No previous tickets with open_time or invalid open_time

	// Find the most restrictive role limit that applies to this user
	let strictestLimit: { limit: string; milliseconds: number } | null = null

	for (const roleLimit of config.role_time_limits) {
		if (member.roles.cache.has(roleLimit.role_id)) {
			const limitMs = parseTimeLimit(roleLimit.limit)
			if (!strictestLimit || limitMs < strictestLimit.milliseconds) {
				strictestLimit = {
					limit: roleLimit.limit,
					milliseconds: limitMs,
				}
			}
		}
	}

	// Debug logging for roles
	// console.log("User roles check:", {
	// 	user_id: interaction.user.id,
	// 	user_roles: Array.from(member.roles.cache.keys()),
	// 	time_limit_roles: config.role_time_limits?.map((r) => r.role_id) || [],
	// 	matched_roles:
	// 		config.role_time_limits
	// 			?.filter((r) => member.roles.cache.has(r.role_id))
	// 			.map((r) => r.role_id) || [],
	// 	strictest_limit: strictestLimit,
	// });

	// If no applicable role limit found, allow opening
	if (!strictestLimit) return { canOpen: true }

	// Calculate when the user can open a new ticket
	const nextAllowedTime =
		latestTicket.open_time * 1000 + strictestLimit.milliseconds
	const currentTime = Date.now()

	// Debug logging
	bunnyLog.info('Ticket time limit check', {
		user_id: interaction.user.id,
		has_roles: Array.from(member.roles.cache.keys()),
		time_limit_role: {
			role_id: config.role_time_limits.find((r) =>
				member.roles.cache.has(r.role_id)
			)?.role_id,
			limit: strictestLimit.limit,
		},
		latest_ticket_time: new Date(latestTicket.open_time * 1000).toISOString(),
		next_allowed_time: new Date(nextAllowedTime).toISOString(),
		current_time: new Date(currentTime).toISOString(),
		can_open: currentTime >= nextAllowedTime,
	})

	// Return whether they can open and when they'll be allowed to if not
	return {
		canOpen: currentTime >= nextAllowedTime,
		nextAllowedTime: nextAllowedTime,
		timeLimit: strictestLimit.limit,
	}
}

/**
 * Replace placeholders in a string with values from a dictionary
 * @param text - The string to replace placeholders in
 * @param placeholders - The dictionary of placeholders and theicanr values
 * @returns The string with placeholders replaced
 */
const replacePlaceholders = (
	text: string,
	placeholders: Record<string, string | number>
): string => {
	return text.replace(/\{(\w+)\}/g, (_, key) =>
		key in placeholders ? String(placeholders[key]) : `{${key}}`
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
 * Sends an embed to a specified channel
 * @param interaction - The interaction to send the embed to
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

	// Get the placeholders
	const placeholders = {
		user: interaction.user.toString(),
	}

	// Create the embed and action rows
	const { embed, action_rows } = createEmbed(
		config.embeds?.open_ticket as unknown as TicketEmbedConfig,
		placeholders
	)

	try {
		// Send the embed to the target channel
		await target_channel.send({
			embeds: [embed],
			components: action_rows.length > 0 ? action_rows : [],
		})

		// Send a success message
		await utils.handleResponse(
			interaction,
			'success',
			'Embed sent successfully.',
			{
				code: 'SE001',
			}
		)
	} catch (error) {
		// Send an error message
		await utils.handleResponse(
			interaction,
			'error',
			"Failed to send the embed. Please check the bot's permissions in the target channel and try again.",
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
						const limitMs = parseTimeLimit(roleLimit.limit)
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
				null as ThreadMetadata | null
			)

			if (mostRecentTicket?.open_time) {
				// Get the member's roles
				const member = interaction.member as Discord.GuildMember
				let strictestLimit: { limit: string; milliseconds: number } | null =
					null

				// Find applicable time limit
				for (const roleLimit of config.role_time_limits) {
					if (member.roles.cache.has(roleLimit.role_id)) {
						const limitMs = parseTimeLimit(roleLimit.limit)
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

		// Get the opened_ticket embed config and ensure it has a close ticket button for the opener
		const opened_ticket_config = {
			...(config.embeds?.opened_ticket as unknown as TicketEmbedConfig),
		}

		// If the buttons_map doesn't exist or doesn't have a close button, add one
		if (!opened_ticket_config.buttons_map) {
			opened_ticket_config.buttons_map = []
		}

		// Check if there's already a close ticket button
		const hasCloseButton = opened_ticket_config.buttons_map.some(
			(button) =>
				button.unique_id === 'close_ticket' ||
				button.label.toLowerCase().includes('close')
		)

		// Add a close button if it doesn't exist
		if (!hasCloseButton) {
			opened_ticket_config.buttons_map.push({
				unique_id: 'close_ticket',
				label: 'Close Ticket',
				style: Discord.ButtonStyle.Danger,
			})
		}

		// Create the embed and action rows with the updated config
		const { embed: ticket_embed, action_rows: ticket_action_row } = createEmbed(
			opened_ticket_config,
			placeholders
		)

		// Check if the embed is valid
		if (!config.embeds?.opened_ticket) {
			// Send an error if the embed is not valid
			await utils.handleResponse(
				interaction,
				'error',
				'No opened ticket embed found in the configuration.',
				{
					code: 'OT006',
				}
			)
			return
		}

		// Send the embed to the thread
		await thread.send({
			embeds: [ticket_embed],
			components: ticket_action_row ? ticket_action_row : [],
		})

		// Send a new ephemeral follow-up message notifying that the ticket was created.
		const { embed: reply_embed } = createEmbed(
			config.embeds.user_ticket as unknown as TicketEmbedConfig,
			placeholders
		)

		await interaction.followUp({ embeds: [reply_embed], ephemeral: true })
		await api.incrementTicketCounter(
			interaction.client.user.id,
			interaction.guild.id
		)

		// Create the metadata (store opened_by as message author info)
		const metadata: ThreadMetadata = {
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

				// Create the embed and action rows
				const { embed: admin_embed, action_rows: admin_action_row } =
					createEmbed(
						config.embeds.admin_ticket as unknown as TicketEmbedConfig,
						placeholders
					)

				// Send the embed to the admin channel
				const admin_message = await admin_channel.send({
					content: config.mods_role_ids
						? config.mods_role_ids.map((id) => `<@&${id}>`).join(', ')
						: null,
					embeds: [admin_embed],
					components: admin_action_row ? admin_action_row : [],
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

	// Get the metadata to check if the user is the ticket opener
	let metadata = thread_metadata_store.get(thread.id) as ThreadMetadata
	// Fallback: if not found in memory, try to fetch it from the database
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild.id,
			thread.id
		)) as ThreadMetadata

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

	// Create the modal
	const reasonInput = new Discord.TextInputBuilder()
		.setCustomId('close_reason')
		.setLabel('Reason for closing the ticket')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setRequired(true)

	// Create the modal
	const modal = new Discord.ModalBuilder()
		.setCustomId('close_ticket_modal')
		.setTitle('Close Ticket with Reason')
		.addComponents(
			new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
				reasonInput
			)
		)

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
	let metadata = thread_metadata_store.get(thread.id) as ThreadMetadata
	// Fallback: if not found in memory, try to fetch it from the database
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild.id,
			thread.id
		)) as ThreadMetadata

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
	}

	// Create the embed and action rows
	const { embed: close_confirm, action_rows } = createEmbed(
		config.embeds?.confirm_close_ticket as unknown as TicketEmbedConfig,
		placeholders
	)

	// Check if the embed is valid
	if (!config.embeds?.confirm_close_ticket) {
		await utils.handleResponse(
			interaction,
			'error',
			'No confirm close ticket embed found in the configuration.',
			{
				code: 'CT006',
			}
		)
		return
	}

	// Send the embed
	await interaction.editReply({
		embeds: [close_confirm],
		components: action_rows ? action_rows : [],
	})
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
		// Create the rating buttons
		const components = [
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
			),
		]

		// Create the embed
		const embed = new Discord.EmbedBuilder()
			.setTitle('Support Ticket Feedback')
			.setDescription(
				`Thanks for using our support system! Your ticket #${ticketId} has been closed. Please rate your experience:`
			)
			.setColor(Discord.Colors.Blurple)
			.setFooter({ text: 'Your feedback helps us improve our support' })

		// Send the survey to the user
		await user.send({ embeds: [embed], components })
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
		let metadata = thread_metadata_store.get(thread.id) as ThreadMetadata
		// Fallback: if not found in memory, try to fetch it from the database
		if (!metadata) {
			metadata = (await api.getTicketMetadata(
				interaction.client.user.id,
				interaction.guild.id,
				thread.id
			)) as ThreadMetadata

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
		}

		// Create the embed
		const { embed: closeEmbed } = createEmbed(
			config.embeds?.closed_ticket as unknown as TicketEmbedConfig,
			placeholders
		)

		await thread.send({ embeds: [closeEmbed] })
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
		// Send an error if the transcript channel is not set
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
		// Send an error if the thread is not a thread
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
		| ThreadMetadata
		| undefined
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			channel.id
		)) as ThreadMetadata | null
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
	const ticket_id = metadata.ticket_id

	// Get the opened by
	const claimed_by =
		typeof metadata?.claimed_by === 'object'
			? `<@${metadata.claimed_by.id}>`
			: metadata?.claimed_by || 'Not claimed'

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

	// Get the open time
	const open_time = metadata?.open_time || Math.floor(Date.now() / 1000)
	const closeTime = new Date()
	const ticket_type = metadata?.ticket_type || 'Unknown'

	// Fetch the ticket messages
	const messages = await api.fetchTicketMessages(channel)

	// Format the transcript
	const formattedTranscript = api.formatTranscript(messages)

	// Create the transcript metadata by merging stored metadata with new transcript details.
	const transcriptMetadata = {
		...metadata,
		closed_by: closedByInfo,
		close_time: closeTime,
		reason: reason,
		rating: metadata.rating,
	}

	// Get the placeholders
	const placeholders = {
		ticket_id: metadata?.ticket_id || 'Unknown',
		opened_by: `<@${metadata?.opened_by?.id}>`,
		closed_by: `<@${closedByInfo.id}>`,
		open_time: `<t:${open_time}:f>`,
		claimed_by: claimed_by,
		reason: reason,
		close_time: closeTime.toLocaleString(),
		category: ticket_type,
		guild_id: interaction.guild?.id as Discord.Guild['id'],
		thread_id: channel.id,
		rating: metadata?.rating?.value
			? '⭐'.repeat(metadata.rating.value)
			: 'No rating',
	}

	// Create the embed and action rows
	const { embed: transcript_embed, action_rows: transcript_buttons } =
		createEmbed(
			config.embeds?.transcript as unknown as TicketEmbedConfig,
			placeholders
		)

	// Check if the embed is valid
	if (!config.embeds?.transcript) {
		await utils.handleResponse(
			interaction,
			'warning',
			'No transcript embed found in the configuration.',
			{
				code: 'CT010',
			}
		)
		return
	}

	try {
		// Send the transcript
		const transcriptMessage = await transcriptChannel.send({
			embeds: [transcript_embed],
			components: transcript_buttons || [],
		})

		// Update metadata with transcript message ID and channel ID
		transcriptMetadata.transcript_message_id = transcriptMessage.id
		transcriptMetadata.transcript_channel_id = transcriptChannel.id

		// Save the transcript to the database with updated metadata
		await api.saveTranscriptToSupabase(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			channel.id,
			formattedTranscript,
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
	// Defer the reply
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

	// Get the metadata to check if the user is the ticket opener
	let metadata = thread_metadata_store.get(thread.id) as ThreadMetadata
	// Fallback: if not found in memory, try to fetch it from the database
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			thread.id
		)) as ThreadMetadata

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

	// Close the thread
	await closeThread(interaction)
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
	} catch (error) {
		// Send an error if an error occurs
		await utils.handleResponse(
			interaction,
			'error',
			'An error occurred while trying to join the thread. Check if you have the appropriate permissions.',
			{
				code: 'JT004',
				error: error,
			}
		)
		return
	}
}

/**
 * Claims a ticket
 * @param interaction - The interaction to claim the ticket
 */
async function claimTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	// Defer the reply
	await interaction.deferUpdate()

	// Get the thread id
	const parts = interaction.customId.split('_')
	const threadChannelId = parts[parts.length - 2]

	// Check if the thread id is valid
	if (!threadChannelId || Number.isNaN(Number(threadChannelId))) {
		await utils.handleResponse(interaction, 'error', 'Invalid thread ID.', {
			code: 'CT004',
		})
		return
	}

	// Get the thread
	let thread: Discord.ThreadChannel | null = null

	// Try to get the thread
	try {
		// Fetch the thread
		thread = (await interaction.guild?.channels.fetch(
			threadChannelId
		)) as Discord.ThreadChannel
	} catch (error) {
		// Send an error if an error occurs
		await utils.handleResponse(
			interaction,
			'error',
			'An error occurred while trying to find the thread.',
			{
				code: 'CT005',
				error: error,
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
				code: 'CT006',
			}
		)
		return
	}

	// Get the metadata from the in-memory store or fallback to the database
	let metadata = thread_metadata_store.get(thread.id) as
		| ThreadMetadata
		| undefined
	if (!metadata) {
		metadata = (await api.getTicketMetadata(
			interaction.client.user.id,
			interaction.guild.id,
			thread.id
		)) as ThreadMetadata | null
		if (!metadata) {
			await utils.handleResponse(
				interaction,
				'error',
				'No metadata found for the thread.',
				{
					code: 'CT007',
				}
			)
			return
		}
		thread_metadata_store.set(thread.id, metadata)
	}

	// Set the claimed by as message author info
	metadata.claimed_by = {
		id: interaction.user.id,
		avatar: interaction.user.displayAvatarURL({
			extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png',
		}),
		username: interaction.user.username,
		displayName:
			interaction.member && 'displayName' in interaction.member
				? (interaction.member as Discord.GuildMember).displayName
				: interaction.user.username,
	}

	// Set the metadata in memory and update the database
	thread_metadata_store.set(thread.id, metadata)
	await api.updateTicketMetadata(
		interaction.client.user.id,
		interaction.guild.id,
		thread.id,
		metadata
	)

	// Get the message
	const message = await interaction.message.fetch()

	// Update the embed
	const updatedEmbed = Discord.EmbedBuilder.from(message.embeds[0]).setFields(
		message.embeds[0].fields.map((field) =>
			field.name === 'Claimed by'
				? {
						name: 'Claimed by',
						value: interaction.user.toString(),
						inline: true,
					}
				: field
		)
	)

	// Update the components
	const updatedComponents = message.components.map((row) =>
		new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
			row.components.map((button) =>
				Discord.ButtonBuilder.from(
					button as Discord.APIButtonComponent
				).setDisabled(button.customId === interaction.customId)
			)
		)
	)

	// Update the message
	await interaction.message.edit({
		embeds: [updatedEmbed],
		components: updatedComponents,
	})
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
		const surveyEmbed = new Discord.EmbedBuilder()
			.setTitle('Thank You For Your Feedback!')
			.setDescription(
				`You rated your support experience: ${ratingText} (${rating}/5)`
			)
			.setColor(2336090) //2336090 is the color of the green

		// Disable all buttons in the survey message
		const surveyComponents = interaction.message.components.map((row) => {
			return new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
				row.components.map((button) => {
					return Discord.ButtonBuilder.from(
						button as Discord.APIButtonComponent
					).setDisabled(true)
				})
			)
		})

		await interaction.message.edit({
			embeds: [surveyEmbed],
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
						// Get the placeholders for the transcript using the updated metadata
						const placeholders = {
							ticket_id: metadata.ticket_id || 'Unknown',
							opened_by: metadata?.opened_by?.id
								? `<@${metadata.opened_by.id}>`
								: 'Unknown',
							closed_by: metadata?.closed_by
								? `<@${metadata.closed_by.id}>`
								: 'Unknown',
							open_time: metadata?.open_time
								? `<t:${metadata.open_time}:f>`
								: 'Unknown',
							claimed_by:
								typeof metadata?.claimed_by === 'object'
									? `<@${metadata.claimed_by.id}>`
									: metadata?.claimed_by || 'Not claimed',
							reason: metadata?.reason || 'No reason provided',
							close_time: metadata?.close_time
								? new Date(metadata.close_time).toLocaleString()
								: 'Unknown',
							category: metadata?.ticket_type || 'Unknown',
							guild_id: guildId,
							thread_id: threadId,
							rating: '⭐'.repeat(rating),
						}

						// Create the updated transcript embed
						const { embed: transcript_embed, action_rows: transcript_buttons } =
							createEmbed(
								config.embeds?.transcript as unknown as TicketEmbedConfig,
								placeholders
							)

						// Update the transcript message
						await transcriptMessage.edit({
							embeds: [transcript_embed],
							components: transcript_buttons || [],
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
	parseTimeLimit,
	canUserOpenTicket,
}
