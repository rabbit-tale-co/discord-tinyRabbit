import * as Discord from 'discord.js'
import * as api from '@/api/index.js'
import * as utils from '@/utils/index.js'
import { bunnyLog } from 'bunny-log'
import type { ThreadMetadata } from '@/types/tickets.js'
import { handleResponse } from '../../utils/responses.js'

const thread_metadata_store = new Map<string, ThreadMetadata>()

/**
 * Replace placeholders in a string with values from a dictionary
 * @param text - The string to replace placeholders in
 * @param placeholders - The dictionary of placeholders and their values
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
	action_rows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[]
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
	const action_rows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] = []

	// Process buttons
	if (embed_config.buttons_map?.length) {
		// Create the current row
		let current_row = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()

		// Process each button
		embed_config.buttons_map.forEach((button, index) => {
			const button_builder = createButton(button, placeholders, index)

			// Check if the button is valid
			if (button_builder) {
				// Check if the current row has more than 5 buttons
				if (current_row.components.length >= 5) {
					// Add the current row to the action rows
					action_rows.push(current_row)
					current_row = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
				}

				// Add the button to the current row
				current_row.addComponents(button_builder)
			}
		})

		// Add the last row if it has components
		if (current_row.components.length > 0) {
			action_rows.push(current_row)
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
		await handleResponse(
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
		await handleResponse(
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
		await interaction.editReply('Embed sent successfully.')
	} catch (error) {
		// Send an error message
		await handleResponse(
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
			await handleResponse(
				interaction,
				'error',
				'This command can only be used in a server.',
				{
					code: 'OT005',
				}
			)
			return
		}

		// Defer the reply
		await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

		// Get the plugin config
		const config = await api.getPluginConfig(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			'tickets'
		)

		// Check if the config is valid
		if (!config) {
			// Send an error if the config is not valid
			await handleResponse(
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
			await handleResponse(
				interaction,
				'error',
				'The tickets feature is currently disabled on this server.',
				{
					code: 'OT002',
				}
			)
			return
		}

		// Get the ticket counter
		const ticket_id = await api.getTicketCounter(
			interaction.client.user.id as Discord.ClientUser['id'],
			interaction.guild?.id as Discord.Guild['id']
		)

		// Check if the ticket counter is valid
		if (!ticket_id) {
			// Send an error if the ticket counter is not valid
			await handleResponse(
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
			await handleResponse(
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

		// Get the ticket type
		const ticket_type = config.embeds?.open_ticket?.buttons_map
			? config.embeds.open_ticket.buttons_map.find(
					(button) => button.unique_id === interaction.customId
				)?.label ?? 'General Support'
			: 'General Support'

		// Get the placeholders
		const placeholders = {
			ticket_id: ticket_id.toString(),
			opened_by: interaction.user.toString(),
			channel_id: `<#${thread.id}>`,
			thread_id: thread.id,
			category: ticket_type,
			claimed_by: 'Not claimed',
		}

		// Create the embed and action rows
		const { embed: ticket_embed, action_rows: ticket_action_row } = createEmbed(
			config.embeds?.opened_ticket as unknown as TicketEmbedConfig,
			placeholders
		)

		// Check if the embed is valid
		if (!config.embeds?.opened_ticket) {
			// Send an error if the embed is not valid
			await handleResponse(
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

		// Send the reply embed
		const { embed: reply_embed } = createEmbed(
			config.embeds.user_ticket as unknown as TicketEmbedConfig,
			placeholders
		)

		// Send the reply embed
		await Promise.all([
			interaction.editReply({ embeds: [reply_embed] }),
			api.incrementTicketCounter(
				interaction.client.user.id,
				interaction.guild.id
			),
		])

		// Create the metadata
		const metadata: ThreadMetadata = {
			ticket_id,
			opened_by: interaction.user,
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
				await handleResponse(
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

		// Save the ticket metadata to the database
		try {
			await api.saveTicketMetadata(
				interaction.client.user.id,
				interaction.guild.id,
				thread.id,
				{
					ticket_id, // already a number/string from getTicketCounter
					opened_by: interaction.user.id, // save only the user id
					open_time: metadata.open_time,
					ticket_type,
					claimed_by: 'Not claimed',
				},
				[] // messages are empty on ticket creation
			)
		} catch (dbError) {
			bunnyLog.error('Failed to save ticket metadata to the database:', dbError)
		}
	} catch (error) {
		const err =
			error instanceof Error
				? error
				: new Error(
						typeof error === 'object'
							? JSON.stringify(error, null, 2)
							: String(error)
					)

		await handleResponse(
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
		await handleResponse(
			interaction,
			'error',
			'This command can only be used in a server.',
			{
				code: 'CT005',
			}
		)
		return
	}

	const permissions = interaction.member?.permissions

	// Check if the user has the necessary permissions
	if (
		!(permissions instanceof Discord.PermissionsBitField) ||
		!permissions?.has(Discord.PermissionsBitField.Flags.ManageChannels)
	) {
		// Send an error if the user does not have the necessary permissions
		await handleResponse(
			interaction,
			'error',
			'You do not have permission to close this ticket.',
			{
				code: 'CT002',
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
		await handleResponse(
			interaction,
			'error',
			'This command can only be used in a server.',
			{
				code: 'CT005',
			}
		)
		return
	}

	// Check if the user has the necessary permissions
	const permissions = interaction.member?.permissions

	// Defer the reply
	await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })

	// Check if the user has the necessary permissions
	if (
		!(permissions instanceof Discord.PermissionsBitField) ||
		!permissions?.has(Discord.PermissionsBitField.Flags.ManageChannels)
	) {
		// Send an error if the user does not have the necessary permissions
		await handleResponse(
			interaction,
			'error',
			'You do not have permission to close this ticket.',
			{
				code: 'CT003',
			}
		)
		return
	}

	// Get the plugin config
	const config = await api.getPluginConfig(
		interaction.client.user.id,
		interaction.guild.id,
		'tickets'
	)

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
		await handleResponse(
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
		await handleResponse(
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
		await handleResponse(
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
				await handleResponse(
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

		// Get the placeholders
		const placeholders = {
			ticket_id: metadata?.ticket_id || 'Unknown',
			opened_by: metadata?.opened_by?.toString() || 'Unknown',
			closed_by: interaction.user.toString(),
			open_time: metadata?.open_time
				? new Date(metadata.open_time * 1000).toLocaleString()
				: 'Unknown',
			claimed_by: metadata?.claimed_by?.toString() || 'Not claimed',
			reason: reason,
			close_time: new Date().toLocaleString(),
			category: metadata?.ticket_type || 'Unknown',
		}

		// Create the embed
		const { embed: closeEmbed } = createEmbed(
			config.embeds?.closed_ticket as unknown as TicketEmbedConfig,
			placeholders
		)

		await Promise.all([
			thread.send({ embeds: [closeEmbed] }),
			sendTranscript(interaction, reason),

			// Set the thread to locked and archived
			thread.setLocked(true),
			thread.setArchived(true),
		])

		// Check if the admin channel is set
		if (metadata?.join_ticket_message_id && metadata.admin_channel_id) {
			const adminChannel = (await interaction.guild.channels.fetch(
				metadata.admin_channel_id
			)) as Discord.TextChannel

			// Check if the admin channel is valid
			if (adminChannel?.isTextBased()) {
				// Fetch the join ticket message
				const joinTicketMessage = await adminChannel.messages.fetch(
					metadata.join_ticket_message_id
				)

				// Delete the join ticket message
				await joinTicketMessage?.delete()
			}

			// Delete the metadata
			thread_metadata_store.delete(thread.id)
		}
	} catch (error) {
		// Send an error if an error occurs
		await handleResponse(
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
		await handleResponse(
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
		await handleResponse(
			interaction,
			'warning',
			'The found channel is not a thread.',
			{
				code: 'CT009',
			}
		)
		return
	}

	// Get the metadata
	const metadata = thread_metadata_store.get(channel.id)

	// Get the ticket id
	const ticket_id = metadata?.ticket_id || 'Unknown'

	// Get the opened by
	const claimed_by = metadata?.claimed_by || 'Not assigned'

	// Get the closed by
	const opened_by = metadata?.opened_by || interaction.user
	const closed_by = interaction.user
	const open_time = metadata?.open_time || Math.floor(Date.now() / 1000)
	const closeTime = new Date()
	const ticket_type = metadata?.ticket_type || 'Unknown'

	// Fetch the ticket messages
	const messages = await api.fetchTicketMessages(channel)

	// Format the transcript
	const formattedTranscript = api.formatTranscript(messages)

	// Create the transcript metadata
	const transcriptMetadata = {
		ticket_id: ticket_id,
		opened_by: opened_by.id,
		closed_by: closed_by.id,
		open_time: new Date(open_time * 1000),
		close_time: closeTime,
		reason: reason,
		ticket_type: ticket_type,
		claimed_by: claimed_by instanceof Discord.User ? claimed_by.id : claimed_by,
	}

	// Save the transcript to the database
	try {
		// Save the transcript to the database
		await api.saveTranscriptToSupabase(
			interaction.client.user.id,
			interaction.guild?.id as Discord.Guild['id'],
			channel.id,
			formattedTranscript,
			transcriptMetadata
		)
	} catch (error) {
		// Send an error if an error occurs
		bunnyLog.error('Error saving transcript to database:', error)
	}

	// Get the placeholders
	const placeholders = {
		ticket_id: metadata?.ticket_id || 'Unknown',
		opened_by: opened_by.toString(),
		closed_by: closed_by.toString(),
		open_time: `<t:${open_time}:f>`,
		claimed_by:
			claimed_by instanceof Discord.User ? claimed_by.toString() : claimed_by,
		reason: reason,
		close_time: closeTime.toLocaleString(),
		category: ticket_type,
		guild_id: interaction.guild?.id as Discord.Guild['id'],
		thread_id: channel.id,
	}

	// Create the embed and action rows
	const { embed: transcript_embed, action_rows: transcript_buttons } =
		createEmbed(
			config.embeds?.transcript as unknown as TicketEmbedConfig,
			placeholders
		)

	// Check if the embed is valid
	if (!config.embeds?.transcript) {
		// Send an error if the embed is not valid
		await handleResponse(
			interaction,
			'warning',
			'No transcript embed found in the configuration.',
			{
				code: 'CT010',
			}
		)
		return
	}

	// Send the embed
	await transcriptChannel.send({
		embeds: [transcript_embed],
		components: transcript_buttons ? transcript_buttons : [],
	})
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
		await handleResponse(interaction, 'error', 'Unable to find thread ID.', {
			code: 'JT002',
		})
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
		await handleResponse(
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
		await handleResponse(
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
		await handleResponse(
			interaction,
			'error',
			'An error occurred while trying to join the thread. Check if you have the appropriate permissions.',
			{
				code: 'JT004',
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
		await handleResponse(interaction, 'error', 'Invalid thread ID.', {
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
		await handleResponse(
			interaction,
			'error',
			'An error occurred while trying to find the thread.',
			{
				code: 'CT005',
			}
		)
		return
	}

	// Check if the thread is a thread
	if (!thread?.isThread()) {
		// Send an error if the thread is not a thread
		await handleResponse(
			interaction,
			'error',
			'The found channel is not a thread.',
			{
				code: 'CT006',
			}
		)
		return
	}

	// Get the metadata
	const metadata = thread_metadata_store.get(thread.id)

	// Check if the metadata is valid
	if (!metadata) {
		// Send an error if the metadata is not valid
		await handleResponse(
			interaction,
			'error',
			'No metadata found for the thread.',
			{
				code: 'CT007',
			}
		)
		return
	}

	// Set the claimed by
	metadata.claimed_by = interaction.user

	// Set the metadata
	thread_metadata_store.set(thread.id, metadata)

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

export {
	sendEmbed,
	openTicket,
	closeTicket,
	closeTicketWithReason,
	confirmCloseTicket,
	claimTicket,
	joinTicket,
	modalSubmit,
}
