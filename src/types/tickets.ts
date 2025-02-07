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

interface AuthorInfo {
	id: string
	username: string
	avatar: string
	displayName: string
}

interface ThreadMetadata {
	join_ticket_message_id?: string | null
	confirm_close_ticket_message_id?: string | null
	admin_channel_id?: string | null
	ticket_id: string | number
	opened_by: AuthorInfo
	open_time: number
	ticket_type: string
	claimed_by?: AuthorInfo | 'Not claimed'
}

export type { Transcript, Attachment, ThreadMetadata }
