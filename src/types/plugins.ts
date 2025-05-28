import type {
	ButtonStyle,
	APIEmbed,
	ActionRowComponent,
	ButtonComponent,
	StringSelectMenuComponent,
	TextInputComponent,
	UserSelectMenuComponent,
	RoleSelectMenuComponent,
	MentionableSelectMenuComponent,
	SectionComponent,
	TextDisplayComponent,
	ThumbnailComponent,
	MediaGalleryComponent,
	FileComponent,
	SeparatorComponent,
	ChannelSelectMenuComponent,
	ContainerComponent,
} from 'discord.js'

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

// Definicja mapy przycisków dla embedów
interface ButtonsMap {
	buttons_map?: Array<{
		unique_id: string
		label: string
		style: ButtonStyle
		url?: string
		disabled?: boolean
	}>
}

// Rozszerzony typ APIEmbed z mapą przycisków
type TicketEmbed = APIEmbed & ButtonsMap

// Discord UI components namespace
export namespace API {
	export interface MessageComponent {
		type: number
	}

	export interface ActionRow extends MessageComponent {
		type: 1
		components: MessageComponent[]
	}

	export interface Button extends MessageComponent {
		type: 2
		style: ButtonStyle
		label?: string
		emoji?: {
			id?: string
			name?: string
			animated?: boolean
		}
		custom_id?: string
		url?: string
		disabled?: boolean
	}

	export interface TextDisplay extends MessageComponent {
		type: 2
		text: string
	}

	export interface Separator extends MessageComponent {
		type: 14
		divider: boolean
		spacing: number
	}

	export interface SelectMenu extends MessageComponent {
		type: 3
		custom_id: string
		options: SelectOption[]
		placeholder?: string
		minValues?: number
		maxValues?: number
		disabled?: boolean
	}

	export interface SelectOption {
		label: string
		value: string
		description?: string
		emoji?: {
			id?: string
			name?: string
			animated?: boolean
		}
		default?: boolean
	}
}

// Components supported by our tickets system
export type ComponentsV2 =
	| API.ActionRow
	| API.Button
	| API.TextDisplay
	| API.SelectMenu
	| API.Separator
	| ActionRowComponent
	| ButtonComponent
	| StringSelectMenuComponent
	| TextInputComponent
	| UserSelectMenuComponent
	| RoleSelectMenuComponent
	| MentionableSelectMenuComponent
	| ChannelSelectMenuComponent
	| SectionComponent
	| TextDisplayComponent
	| ThumbnailComponent
	| MediaGalleryComponent
	| FileComponent
	| SeparatorComponent
	| ContainerComponent

// Define the structure for all ticket message types
export type TicketTemplates = {
	open_ticket?: ComponentsV2[] | null
	opened_ticket?: ComponentsV2[] | null
	user_ticket?: ComponentsV2[] | null
	closed_ticket?: ComponentsV2[] | null
	confirm_close_ticket?: ComponentsV2[] | null
	admin_ticket?: ComponentsV2[] | null
	transcript?: ComponentsV2[] | null
	// System messages
	inactivity_notice?: ComponentsV2[] | null
	rating_survey?: ComponentsV2[] | null
	ticket_claimed?: ComponentsV2[] | null
	close_confirmation?: ComponentsV2[] | null // Displayed when a ticket is closed
	close_reason_modal?: ComponentsV2[] | null // Text for the close reason modal
	no_permission?: ComponentsV2[] | null // No permission to perform action
	auto_close_warning?: ComponentsV2[] | null // Warning about upcoming auto-close
}

// Define the separate embed templates for backward compatibility
export type TicketEmbedTemplates = {
	open_ticket?: TicketEmbed | null
	opened_ticket?: TicketEmbed | null
	user_ticket?: TicketEmbed | null
	closed_ticket?: TicketEmbed | null
	confirm_close_ticket?: TicketEmbed | null
	admin_ticket?: TicketEmbed | null
	transcript?: TicketEmbed | null
}

// TODO: UPDATE TO COMPONENTSV2
export type Ticket = {
	enabled?: boolean
	admin_channel_id?: string | null
	counter?: number
	transcript_channel_id?: string | null
	mods_role_ids?: Array<string> | null
	open_time_limit?: number | null
	auto_close?: Array<{
		enabled: boolean
		threshold: number
		reason: string
	}> | null
	role_time_limits?: Array<{
		role_id: string
		limit: string // Format: number + unit (e.g., "15m", "1h", "7d")
	}> | null
	components?: TicketTemplates
	embeds?: TicketEmbedTemplates
}

type Welcome_Goodbye = {
	enabled?: boolean
	welcome_message?: string | null
	welcome_channel_id?: string | null
	leave_message?: string | null
	leave_channel_id?: string | null
	join_role_ids?: string[] | null
	components?: {
		welcome: ComponentsV2[]
		goodbye: ComponentsV2[]
	}
}

type Starboard = {
	enabled?: boolean
	emoji?: string
	watch_channels?: string[] | null
	channel_id?: string | null
	threshold?: number
}

type Birthday = {
	enabled?: boolean
	channel_id?: string | null
	message?: string | null
	show_age?: boolean
	components?: ComponentsV2[]
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

type Economy = {
	enabled: boolean
	currency_name: string
	currency_symbol: string
	currency_emoji: string
	is_custom_emoji: boolean
	starting_balance: number
	multipliers: {
		enabled: boolean
		default: number
		roles: Array<{
			role_id: string
			multiplier: number
		}>
	}
	leaderboard: {
		enabled: boolean
		channel_id: string | null
		update_interval: number // in minutes
		top_count: number
	}
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
	economy: Economy
}

type Plugins = PluginTypes[keyof PluginTypes]

type DefaultConfigs = {
	[K in keyof PluginTypes]?: PluginTypes[K] // make every property optional
}

type PluginResponse<T> = T & { id: string }

export type { DefaultConfigs, PluginResponse, Plugins, TicketEmbed, ButtonsMap }

export * from './tempvc.js'
