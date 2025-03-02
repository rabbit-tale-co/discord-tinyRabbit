import type { ButtonStyle, ComponentType, EmbedData } from 'discord.js'

type Level = {
	enabled?: boolean
	reward_message?: string | null
	channel_id?: string | null
	command_channel_id?: string | null
	reward_roles?: Array<{
		level: number
		role_id: string
	}> | null
	boost_3x_roles?: Array<{
		role_id: string
	}> | null
}

type TicketEmbed = {
	title?: string
	description?: string
	color?: number
	footer?: string
	thumbnail?: string
	image?: string
	fields?: Array<{
		name: string
		value: string
		inline?: boolean
	}>
	buttons_map?: Array<{
		unique_id: string
		label: string
		style: ButtonStyle
		type: ComponentType
		url?: string
		disabled?: boolean
	}>
}

type Ticket = {
	enabled?: boolean
	admin_channel_id?: string | null
	counter?: number
	transcript_channel_id?: string | null
	mods_role_ids?: Array<string> | null
	embeds?: {
		open_ticket?: TicketEmbed | null
		opened_ticket?: TicketEmbed | null
		user_ticket?: TicketEmbed | null
		closed_ticket?: TicketEmbed | null
		confirm_close_ticket?: TicketEmbed | null
		admin_ticket?: TicketEmbed | null
		transcript?: TicketEmbed | null
	}
}

type Welcome_Goodbye = {
	enabled?: boolean
	type: 'embed' | 'text'
	welcome_message?: string | null
	welcome_channel_id?: string | null
	leave_message?: string | null
	leave_channel_id?: string | null
	embed_welcome?: EmbedData | null
	embed_leave?: EmbedData | null
	join_role_ids?: string[] | null
}

type Starboard = {
	enabled?: boolean
	emojis?: string[]
	watch_channels?: string[] | null
	channel_id?: string | null
	threshold?: number
}

type Birthday = {
	enabled?: boolean
	channel_id?: string | null
	message?: string | null
}

type TempVC = {
	enabled?: boolean
	channel_id?: string | null
	title: string
	durations?: Array<{
		role_id: string
		minutes: number
	}> | null
}

type Slowmode = {
	enabled?: boolean
	watch_channels?: string[] | null
	threshold?: number
	duration?: number
	rate_duration?: {
		high_rate: number
		low_rate: number
	}
}

type ConnectSocial = {
	enabled: boolean
	minecraft: {
		role_id: string | null
	}
	youtube: {
		role_id: string | null
	}
	twitter: {
		role_id: string | null
	}
	tiktok: {
		role_id: string | null
	}
	twitch: {
		role_id: string | null
	}
}

type Moderation = {
	enabled: boolean
	watch_roles: string[]
	ban_interval: number
	delete_message_days: number
}

type Music = {
	enabled: boolean // enable/disable music plugin
	channel_id: string | null // channel id where music commands are available
	role_id: string | null // role id who can use music commands
}

type PluginTypes = {
	levels: Level
	tickets: Ticket
	welcome_goodbye: Welcome_Goodbye
	starboard: Starboard
	birthday: Birthday
	tempvc: TempVC
	slowmode: Slowmode
	connectSocial: ConnectSocial
	moderation: Moderation
	music: Music
}

type Plugins = PluginTypes[keyof PluginTypes]

type DefaultConfigs = {
	[K in keyof PluginTypes]?: PluginTypes[K] // make every property optional
}

type PluginResponse<T> = T & { id: string }

export type { DefaultConfigs, PluginResponse, Plugins }

export * from './tempvc.js'
