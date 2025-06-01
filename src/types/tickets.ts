import type * as Discord from 'discord.js'

interface Attachment {
	url: string
	proxyURL: string
	name: string
	size: number
}

interface AuthorInfo {
	id: string
	username: string
	avatar: string
	displayName: string
}

interface Transcript {
	id: string
	author: AuthorInfo
	content: string | null
	attachments: Array<Attachment> | null
	timestamp: number
}

interface ThreadMetadata {
	ticket_id: number | string
	thread_id: string
	opened_by: AuthorInfo
	open_time: number
	ticket_type: string
	claimed_by?: string | AuthorInfo
	claimed_time?: Date
	closed_by?: AuthorInfo
	close_time?: Date
	reason?: string
	close_reason?: string
	guild_id?: string
	status?: string
	join_ticket_message_id?: string
	admin_channel?: {
		id: string
		message_id: string
	}
	transcript_channel?: {
		id: string
		message_id: string
	}
	rating?: {
		value: number
		submitted_at?: string
		review_message_id?: string
		user_id?: string
		timestamp?: number
	}
	transcript_message_id?: string
}

interface TicketConfig {
	auto_close_inactive?: boolean // Legacy format - keeping for backward compatibility
	inactivity_threshold?: string // Legacy format - keeping for backward compatibility
	enabled?: boolean
	auto_close?: Array<{
		enabled: boolean
		threshold: number
		reason: string
	}>
}

interface TicketEmbedConfig extends Discord.EmbedData {
	buttons_map?: Array<{
		unique_id: string
		label: string
		style: Discord.ButtonStyle
		url?: string
	}>
}

export type {
	Transcript,
	Attachment,
	ThreadMetadata,
	TicketConfig,
	TicketEmbedConfig,
}
