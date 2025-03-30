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
	opened_by: AuthorInfo
	open_time: number
	ticket_type: string
	claimed_by?: string | AuthorInfo
	closed_by?: AuthorInfo
	close_time?: Date
	reason?: string
	rating?: {
		value: number
		submitted_at: string
		review_message_id: string
	}
	join_ticket_message_id?: string
	admin_channel_id?: string
	transcript_message_id?: string
	transcript_channel_id?: string
	guild_id?: string
}

export type { Transcript, Attachment, ThreadMetadata }
