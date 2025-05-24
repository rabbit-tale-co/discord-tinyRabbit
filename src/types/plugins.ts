import type {
	ButtonStyle,
	EmbedData,
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
		customId?: string
		url?: string
		disabled?: boolean
	}

	export interface TextDisplay extends MessageComponent {
		type: 2
		text: string
	}

	export interface SelectMenu extends MessageComponent {
		type: 3
		customId: string
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

// Display mode for ticket messages
export enum TicketDisplayMode {
	Embed = 'embed',
	Text = 'text',
}

// Define the structure for a single ticket message template
export type TicketMessageTemplate = {
	type: TicketDisplayMode | string
	components?: ComponentsV2[]
	embed?: TicketEmbed | null
}

// Define the structure for all ticket message types
export type TicketTemplates = {
	open_ticket?: TicketMessageTemplate | null
	opened_ticket?: TicketMessageTemplate | null
	user_ticket?: TicketMessageTemplate | null
	closed_ticket?: TicketMessageTemplate | null
	confirm_close_ticket?: TicketMessageTemplate | null
	admin_ticket?: TicketMessageTemplate | null
	transcript?: TicketMessageTemplate | null
	// System messages
	inactivity_notice?: TicketMessageTemplate | null
	rating_survey?: TicketMessageTemplate | null
	ticket_claimed?: TicketMessageTemplate | null
	close_confirmation?: TicketMessageTemplate | null // Displayed when a ticket is closed
	close_reason_modal?: TicketMessageTemplate | null // Text for the close reason modal
	no_permission?: TicketMessageTemplate | null // No permission to perform action
	auto_close_warning?: TicketMessageTemplate | null // Warning about upcoming auto-close
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
	display_type?: TicketDisplayMode | string // Global display mode preference
	components?: TicketTemplates
	embeds?: TicketEmbedTemplates
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
	components?: {
		welcome: TicketMessageTemplate
		goodbye: TicketMessageTemplate
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
