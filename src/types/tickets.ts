import type * as Discord from 'discord.js'

interface Attachment {
	url: string
	proxyURL: string
	name: string
	size: number
}

interface Transcript {
	id: string
	author: {
		id: string
		username: string
		avatar: string
	}
	content: string | null
	attachments: Array<Attachment> | null
	timestamp: number
}

interface ThreadMetadata {
	join_ticket_message_id?: string | null
	confirm_close_ticket_message_id?: string | null
	admin_channel_id?: string | null
	ticket_id: string | number
	opened_by: string
	open_time: number
	ticket_type: string
	claimed_by?: string | null
}

export type { Transcript, Attachment, ThreadMetadata }
