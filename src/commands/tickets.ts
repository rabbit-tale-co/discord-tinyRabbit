import * as Discord from 'discord.js'
import * as Tickets from '../api/tickets'
import { getPluginConfig } from '../api/plugins'
import { bunnyLog } from 'bunny-log'
import type { ThreadMetadata } from '../types/tickets'
import type { UniversalEmbedOptions } from '../types/embed'
import { handleError } from '../utils/errorHandlers'

const thread_metadata_store = new Map<string, ThreadMetadata>()

const replacePlaceholders = (
	text: string,
	placeholders: Record<string, string | number>
): string => {
	return text.replace(/\{(\w+)\}/g, (_, key) =>
		key in placeholders ? String(placeholders[key]) : `{${key}}`
	)
}

interface TicketEmbedConfig extends Discord.EmbedData {
	buttons_map?: Array<{
		unique_id: string
		label: string
		style: Discord.ButtonStyle
		url?: string
	}>
}

/**
 * TODO: replace buttons with dropdown menu
 * Creates an embed with placeholders and buttons
 * @param embedConfig - The embed configuration
 * @param placeholders - The placeholders to replace in the embed
 * @returns The embed and action rows
 */
const createEmbed = (
	embedConfig: TicketEmbedConfig,
	placeholders: Record<string, string | number>
): {
	embed: Discord.EmbedBuilder
	action_rows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[]
} => {
	// Process embed config
	const processedConfig = {
		...embedConfig,
		title:
			embedConfig.title && replacePlaceholders(embedConfig.title, placeholders),
		description:
			embedConfig.description &&
			replacePlaceholders(embedConfig.description, placeholders),
		fields: embedConfig.fields?.map((field) => ({
			name: replacePlaceholders(field.name, placeholders),
			value: replacePlaceholders(field.value, placeholders),
			inline: field.inline,
		})),
		footer:
			embedConfig.footer &&
			(typeof embedConfig.footer === 'string'
				? { text: replacePlaceholders(embedConfig.footer, placeholders) }
				: {
						text: replacePlaceholders(embedConfig.footer.text, placeholders),
						iconURL: embedConfig.footer.iconURL,
					}),
	}

	const embed = new Discord.EmbedBuilder(processedConfig)
	const action_rows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] = []

	// Process buttons
	if (embedConfig.buttons_map?.length) {
		let currentRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()

		embedConfig.buttons_map.forEach((button, index) => {
			const buttonBuilder = createButton(button, placeholders, index)

			if (buttonBuilder) {
				if (currentRow.components.length === 5) {
					action_rows.push(currentRow)
					currentRow = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
				}
				currentRow.addComponents(buttonBuilder)
			}
		})

		if (currentRow.components.length > 0) {
			action_rows.push(currentRow)
		}
	}

	return { embed, action_rows }
}

const createButton = (
	button: TicketEmbedConfig['buttons_map'][number],
	placeholders: Record<string, string | number>,
	index: number
): Discord.ButtonBuilder | null => {
	if (button.style === Discord.ButtonStyle.Link) {
		if (!button.url) return null
		return new Discord.ButtonBuilder()
			.setLabel(button.label)
			.setStyle(button.style)
			.setURL(replacePlaceholders(button.url, placeholders))
	}
	return new Discord.ButtonBuilder()
		.setCustomId(
			`${button.unique_id}_${placeholders.thread_id || 'main'}_${index}`
		)
		.setLabel(button.label)
		.setStyle(button.style)
}

async function sendEmbed(interaction: Discord.ChatInputCommandInteraction) {
	await interaction.deferReply({ ephemeral: true })

	const target_channel = interaction.options.getChannel(
		'channel'
	) as Discord.TextChannel
	if (!target_channel?.isTextBased()) {
		await handleError(
			interaction,
			'SE002',
			'The specified channel is not a valid text channel. Please select a text channel where messages can be sent.'
		)
		return
	}

	const config = await getPluginConfig(
		interaction.client.user.id,
		interaction.guild.id,
		'tickets'
	)
	const placeholders = {
		user: interaction.user.toString(),
	}

	const { embed, action_rows } = createEmbed(
		config.embeds.open_ticket as unknown as UniversalEmbedOptions,
		placeholders
	)

	try {
		await target_channel.send({
			embeds: [embed],
			components: action_rows.length > 0 ? action_rows : [],
		})
		await interaction.editReply('Embed sent successfully.')
	} catch (error) {
		await handleError(
			interaction,
			'SE001',
			"Failed to send the embed. Please check the bot's permissions in the target channel and try again."
		)
	}
}

async function openTicket(interaction: Discord.ButtonInteraction) {
	try {
		await interaction.deferReply({ ephemeral: true })

		const config = await getPluginConfig(
			interaction.client.user.id,
			interaction.guild.id,
			'tickets'
		)
		if (!config.enabled) {
			await handleError(
				interaction,
				'OT002',
				'The tickets feature is currently disabled on this server.'
			)
			return
		}

		const ticket_id = await Tickets.getTicketCounter(
			interaction.client.user.id,
			interaction.guild.id
		)
		const thread_name = `ticket-${ticket_id}`

		if (!(interaction.channel instanceof Discord.TextChannel)) {
			await handleError(
				interaction,
				'OT003',
				'This command can only be used in a text channel.'
			)
			return
		}

		const thread = await interaction.channel.threads.create({
			name: thread_name,
			autoArchiveDuration: Discord.ThreadAutoArchiveDuration.OneDay,
			type: Discord.ChannelType.PrivateThread,
			reason: 'Support ticket',
		})

		await thread.members.add(interaction.user.id)

		const ticket_type =
			config.embeds?.open_ticket?.buttons_map?.find(
				(button) => button.unique_id === interaction.customId
			)?.label || 'Unknown'

		const placeholders = {
			ticket_id: ticket_id.toString(),
			opened_by: interaction.user.toString(),
			channel_id: `<#${thread.id}>`,
			thread_id: thread.id,
			category: ticket_type,
			claimed_by: 'Not claimed',
		}

		const { embed: ticket_embed, action_rows: ticket_action_row } = createEmbed(
			config.embeds.opened_ticket as unknown as UniversalEmbedOptions,
			placeholders
		)
		await thread.send({
			embeds: [ticket_embed],
			components: ticket_action_row ? ticket_action_row : [],
		})

		const { embed: reply_embed } = createEmbed(
			config.embeds.user_ticket as unknown as UniversalEmbedOptions,
			placeholders
		)
		await interaction.editReply({ embeds: [reply_embed] })

		await Tickets.incrementTicketCounter(
			interaction.client.user.id,
			interaction.guild.id
		)

		const metadata: ThreadMetadata = {
			ticket_id,
			opened_by: interaction.user,
			open_time: Math.floor(Date.now() / 1000),
			ticket_type,
		}

		if (config.admin_channel_id) {
			const admin_channel = (await interaction.guild.channels.fetch(
				config.admin_channel_id
			)) as Discord.TextChannel
			if (admin_channel?.isTextBased()) {
				const { embed: admin_embed, action_rows: admin_action_row } =
					createEmbed(
						config.embeds.admin_ticket as unknown as UniversalEmbedOptions,
						placeholders
					)

				const admin_message = await admin_channel.send({
					embeds: [admin_embed],
					components: admin_action_row ? admin_action_row : [],
				})

				metadata.join_ticket_message_id = admin_message.id
				metadata.admin_channel_id = config.admin_channel_id
			}
		}

		thread_metadata_store.set(thread.id, metadata)
	} catch (error) {
		await handleError(
			interaction,
			'OT001',
			'An unexpected error occurred while creating the ticket.'
		)
	}
}

async function closeTicketWithReason(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	const permissions = interaction.member.permissions
	if (
		!(permissions instanceof Discord.PermissionsBitField) ||
		!permissions.has(Discord.PermissionsBitField.Flags.ManageChannels)
	) {
		await handleError(
			interaction,
			'CT002',
			'You do not have permission to close this ticket.'
		)
		return
	}

	const reasonInput = new Discord.TextInputBuilder()
		.setCustomId('close_reason')
		.setLabel('Reason for closing the ticket')
		.setStyle(Discord.TextInputStyle.Paragraph)
		.setRequired(true)

	const modal = new Discord.ModalBuilder()
		.setCustomId('close_ticket_modal')
		.setTitle('Close Ticket with Reason')
		.addComponents(
			new Discord.ActionRowBuilder<Discord.TextInputBuilder>().addComponents(
				reasonInput
			)
		)

	await interaction.showModal(modal)
}

async function closeTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	const permissions = interaction.member.permissions
	await interaction.deferReply({ ephemeral: true })
	if (
		!(permissions instanceof Discord.PermissionsBitField) ||
		!permissions.has(Discord.PermissionsBitField.Flags.ManageChannels)
	) {
		await handleError(
			interaction,
			'CT003',
			'You do not have permission to close this ticket.'
		)
		return
	}

	const config = await getPluginConfig(
		interaction.client.user.id,
		interaction.guild.id,
		'tickets'
	)

	const placeholders = {
		user: interaction.user.toString(),
	}

	const { embed: close_confirm, action_rows } = createEmbed(
		config.embeds.confirm_close_ticket as unknown as UniversalEmbedOptions,
		placeholders
	)

	await interaction.editReply({
		embeds: [close_confirm],
		components: action_rows ? action_rows : [],
	})
}

async function closeThread(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	reason = 'No reason provided'
): Promise<void> {
	const thread = interaction.channel as Discord.ThreadChannel
	if (!thread?.isThread()) return

	try {
		const config = await getPluginConfig(
			interaction.client.user.id,
			interaction.guild.id,
			'tickets'
		)

		const metadata = thread_metadata_store.get(thread.id)

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

		const { embed: closeEmbed } = createEmbed(
			config.embeds.closed_ticket as unknown as UniversalEmbedOptions,
			placeholders
		)

		await thread.send({ embeds: [closeEmbed] })

		await sendTranscript(interaction, reason)

		await thread.setLocked(true)
		await thread.setArchived(true)

		if (metadata?.join_ticket_message_id && metadata.admin_channel_id) {
			const adminChannel = (await interaction.guild.channels.fetch(
				metadata.admin_channel_id
			)) as Discord.TextChannel
			if (adminChannel?.isTextBased()) {
				const joinTicketMessage = await adminChannel.messages.fetch(
					metadata.join_ticket_message_id
				)
				await joinTicketMessage?.delete()
			}
			thread_metadata_store.delete(thread.id)
		}
	} catch (error) {
		await handleError(
			interaction,
			'CT001',
			'An error occurred while closing the ticket.'
		)
	}
}

async function sendTranscript(
	interaction: Discord.ButtonInteraction | Discord.ModalSubmitInteraction,
	reason: string
) {
	const config = await getPluginConfig(
		interaction.client.user.id,
		interaction.guild.id,
		'tickets'
	)
	if (!config?.transcript_channel_id) return

	const transcriptChannel = (await interaction.guild.channels.fetch(
		config.transcript_channel_id
	)) as Discord.TextChannel
	if (!transcriptChannel?.isTextBased()) return

	const channel = interaction.channel as Discord.ThreadChannel
	if (
		!channel?.isThread() ||
		channel.type !== Discord.ChannelType.PrivateThread
	)
		return

	const metadata = thread_metadata_store.get(channel.id)
	const ticket_id = metadata?.ticket_id || 'Unknown'
	const claimed_by = metadata?.claimed_by || 'Not assigned'
	const opened_by = metadata?.opened_by || interaction.user
	const closed_by = interaction.user
	const open_time = metadata?.open_time || Math.floor(Date.now() / 1000)
	const closeTime = new Date()
	const ticket_type = metadata?.ticket_type || 'Unknown'

	const messages = await Tickets.fetchTicketMessages(channel)
	const formattedTranscript = Tickets.formatTranscript(messages)

	const transcriptMetadata = {
		opened_by: opened_by.id,
		closed_by: closed_by.id,
		open_time: new Date(open_time * 1000),
		close_time: closeTime,
		reason: reason,
		ticket_type: ticket_type,
		claimed_by: claimed_by instanceof Discord.User ? claimed_by.id : claimed_by,
	}

	try {
		await Tickets.saveTranscriptToSupabase(
			interaction.client.user.id,
			interaction.guild.id,
			channel.id,
			formattedTranscript,
			transcriptMetadata
		)
	} catch (error) {
		bunnyLog.error(
			'Błąd podczas zapisywania transkryptu do bazy danych:',
			error
		)
	}

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
		guild_id: interaction.guild.id,
		thread_id: channel.id,
	}

	const { embed: transcript_embed, action_rows: transcript_buttons } =
		createEmbed(
			config.embeds.transcript as unknown as UniversalEmbedOptions,
			placeholders
		)

	await transcriptChannel.send({
		embeds: [transcript_embed],
		components: transcript_buttons ? transcript_buttons : [],
	})
}

async function confirmCloseTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	await interaction.deferUpdate()
	await closeThread(interaction)
}

async function joinTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	await interaction.deferUpdate()

	const parts = interaction.customId.split('_')
	const threadId = parts[parts.length - 2] // Assuming thread ID is the second-to-last element

	if (!threadId) {
		await handleError(interaction, 'JT002', 'Unable to find thread ID.')
		return
	}

	let thread: Discord.ThreadChannel | null = null
	try {
		thread = (await interaction.guild.channels.fetch(
			threadId
		)) as Discord.ThreadChannel
	} catch (error) {
		await handleError(
			interaction,
			'JT001',
			"Unable to find thread. It may have been deleted or you don't have access."
		)
		return
	}

	if (!thread?.isThread()) {
		await handleError(
			interaction,
			'JT003',
			'The found channel is not a thread.'
		)
		return
	}

	try {
		await thread.members.add(interaction.user.id)
	} catch (error) {
		await handleError(
			interaction,
			'JT004',
			'An error occurred while trying to join the thread. Check if you have the appropriate permissions.'
		)
	}
}

async function claimTicket(
	interaction: Discord.ButtonInteraction
): Promise<void> {
	await interaction.deferUpdate()

	const parts = interaction.customId.split('_')
	const threadChannelId = parts[parts.length - 2]

	if (!threadChannelId || Number.isNaN(Number(threadChannelId))) {
		await handleError(interaction, 'CT004', 'Invalid thread ID.')
		return
	}

	let thread: Discord.ThreadChannel | null = null
	try {
		thread = (await interaction.guild.channels.fetch(
			threadChannelId
		)) as Discord.ThreadChannel
	} catch (error) {
		await handleError(
			interaction,
			'CT005',
			'An error occurred while trying to find the thread.'
		)
		return
	}

	if (!thread?.isThread()) {
		await handleError(
			interaction,
			'CT006',
			'The found channel is not a thread.'
		)
		return
	}

	const metadata = thread_metadata_store.get(thread.id)

	if (!metadata) return

	metadata.claimed_by = interaction.user
	thread_metadata_store.set(thread.id, metadata)

	const message = await interaction.message.fetch()
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

	const updatedComponents = message.components.map((row) =>
		new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
			row.components.map((button) =>
				Discord.ButtonBuilder.from(
					button as Discord.APIButtonComponent
				).setDisabled(button.customId === interaction.customId)
			)
		)
	)

	await interaction.message.edit({
		embeds: [updatedEmbed],
		components: updatedComponents,
	})
}

async function modalSubmit(
	interaction: Discord.ModalSubmitInteraction
): Promise<void> {
	if (interaction.customId === 'close_ticket_modal') {
		const reason = interaction.fields.getTextInputValue('close_reason')
		await interaction.deferUpdate()
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
