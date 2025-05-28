import type { DefaultConfigs } from '@/types/plugins.js'
import type { PluginResponse } from '@/types/plugins.js'
import * as Discord from 'discord.js'
import * as api from '@/discord/api/index.js'

export const MS_IN = {
	second: 1000,
	minute: 60 * 1000,
	hour: 60 * 60 * 1000,
	day: 24 * 60 * 60 * 1000,
	week: 7 * 24 * 60 * 60 * 1000,
} as const

export const UI_COMPONENTS = Object.freeze({
	TIME_UNIT_OPTIONS: [
		{ label: 'Minutes', value: 'minutes' },
		{ label: 'Hours', value: 'hours' },
		{ label: 'Days', value: 'days' },
		{ label: 'Weeks', value: 'weeks' },
		{ label: 'Predefined Values', value: 'predefined' },
	] as const,

	PREDEFINED_TIME_OPTIONS: [
		{ label: '30 minutes', value: '30m' },
		{ label: '1 hour', value: '1h' },
		{ label: '12 hours', value: '12h' },
		{ label: '1 day', value: '1d' },
		{ label: '3 days', value: '3d' },
		{ label: '1 week', value: '1w' },
		{ label: '2 weeks', value: '2w' },
	] as const,
})

export const TIME_VALUE_PRESETS: Record<
	'seconds' | 'minutes' | 'hours' | 'days' | 'weeks',
	number[]
> = {
	seconds: Array.from({ length: 12 }, (_, i) => (i + 1) * 5), // 5, 10 ... 60
	minutes: [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
	hours: [1, 2, 3, 4, 6, 8, 12, 18, 24, 36, 48, 72],
	days: [1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30],
	weeks: [1, 2, 3, 4],
}

/**
 * Replace placeholders in a string with values from a dictionary
 * @param text - The string to replace placeholders in
 * @param placeholders - The dictionary of placeholders and their values
 * @returns The string with placeholders replaced
 */
export function replacePlaceholders(
	text: string,
	placeholders: Record<string, string | number>
): string {
	if (!text) return text

	return text.replace(/\\?\{(\w+)}/g, (match, key) =>
		// keep escaped tokens and unknown keys intact
		match.startsWith('\\') || !(key in placeholders)
			? match.replace(/^\\/, '') // strip the escape backslash
			: String(placeholders[key])
	)
}

/**
 * Converts shorthand strings like `"30m"`, `"2 h"`, `"3d"`, `"1w"`,
 * or `"90s"` → **milliseconds**.
 * Returns `0` when the input cannot be parsed.
 *
 * | Suffix | Meaning      |
 * | ------ | ------------ |
 * | `s`, `sec`, `second` (…) | seconds |
 * | `m`, `min`, `minute` (…) | minutes |
 * | `h`, `hr`, `hour` (…)    | hours   |
 * | `d`, `day` (…)           | days    |
 * | `w`, `week` (…)          | weeks   |
 * | `y`, `yr`, `year` (…)    | years (365 d) |
 *
 * Bare numbers default to **days** for backwards‑compat.
 */
export function parseTimeLimit(input: string | number): number {
	/* ------------------------- quick exits ------------------------- */
	if (typeof input === 'number' && Number.isFinite(input)) return input
	const raw = String(input ?? '')
		.trim()
		.toLowerCase()
	if (!raw) return 0

	/* --------------------------- regex ----------------------------- */
	const m = raw.match(/^(\d+)\s*([a-z]*)$/i)
	if (!m) return 0

	const [, numStr, unitStr] = m
	const value = Number(numStr)
	if (!Number.isFinite(value)) return 0

	/* ----------------------- unit mapping -------------------------- */
	const UNIT_MS: Record<string, number> = {
		// seconds
		s: MS_IN.second,
		sec: MS_IN.second,
		second: MS_IN.second,
		seconds: MS_IN.second,
		// minutes
		m: MS_IN.minute,
		min: MS_IN.minute,
		minute: MS_IN.minute,
		minutes: MS_IN.minute,
		// hours
		h: MS_IN.hour,
		hr: MS_IN.hour,
		hour: MS_IN.hour,
		hours: MS_IN.hour,
		// days
		d: MS_IN.day,
		day: MS_IN.day,
		days: MS_IN.day,
		// weeks
		w: MS_IN.week,
		week: MS_IN.week,
		weeks: MS_IN.week,
		// years (365 d)
		y: 365 * MS_IN.day,
		yr: 365 * MS_IN.day,
		year: 365 * MS_IN.day,
		years: 365 * MS_IN.day,
	}

	const unit = unitStr || 'd'
	const msPerUnit = UNIT_MS[unit] ?? 0

	return value * msPerUnit
}

export const UI_BUILDERS = {
	/**
	 * Creates a standard back button for navigation
	 * @param custom_id - The custom ID for the button
	 * @param label - The label for the button (defaults to 'Back')
	 * @returns A button builder with the specified custom_id and label
	 */
	createBackButton(
		custom_id = 'ticket_config_back',
		label = 'Back to Main Menu'
	) {
		return new Discord.ButtonBuilder()
			.setcustom_id(custom_id)
			.setLabel(label)
			.setStyle(Discord.ButtonStyle.Secondary)
	},

	/**
	 * Creates a row with just a back button
	 * @param custom_id - The custom ID for the button
	 * @param label - The label for the button
	 * @returns An action row with a back button
	 */
	createBackButtonRow(
		custom_id = 'ticket_config_back',
		label = 'Back to Main Menu'
	) {
		return new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
			this.createBackButton(custom_id, label)
		)
	},

	/**
	 * Creates standard toggle buttons for enabling/disabling features
	 * @param enabledState - Current enabled state
	 * @param enableId - Custom ID for enable button
	 * @param disableId - Custom ID for disable button
	 * @returns Action row with enable/disable buttons
	 */
	createToggleButtonRow(
		enabledState: boolean,
		enableId = 'autoclose_enable',
		disableId = 'autoclose_disable'
	) {
		return new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
			new Discord.ButtonBuilder()
				.setcustom_id(enableId)
				.setLabel('Enable')
				.setStyle(
					enabledState
						? Discord.ButtonStyle.Success
						: Discord.ButtonStyle.Secondary
				)
				.setDisabled(enabledState),
			new Discord.ButtonBuilder()
				.setcustom_id(disableId)
				.setLabel('Disable')
				.setStyle(
					!enabledState
						? Discord.ButtonStyle.Danger
						: Discord.ButtonStyle.Secondary
				)
				.setDisabled(!enabledState)
		)
	},

	/**
	 * Creates an auto-close settings toggle row with enable/disable and set reason buttons
	 * @param enabledState - Whether auto-close is enabled
	 * @returns Action row with auto-close toggle buttons
	 */
	createAutoCloseToggleRow(enabledState: boolean) {
		const row = this.createToggleButtonRow(enabledState)

		// Add set reason button
		row.addComponents(
			new Discord.ButtonBuilder()
				.setcustom_id('autoclose_set_reason')
				.setLabel('Set Reason')
				.setStyle(Discord.ButtonStyle.Primary)
		)

		return row
	},

	/**
	 * Creates a time unit selection menu
	 * @param custom_id - The custom ID for the select menu
	 * @param placeholder - The placeholder text for the menu
	 * @param includePredefined - Whether to include predefined values option
	 * @returns A select menu builder with time unit options
	 */
	createTimeUnitMenu(
		custom_id: string,
		placeholder = 'Select time unit',
		includePredefined = true
	) {
		// Convert readonly array to mutable array
		const optionsArray = includePredefined
			? [...UI_COMPONENTS.TIME_UNIT_OPTIONS]
			: [
					...UI_COMPONENTS.TIME_UNIT_OPTIONS.filter(
						(opt) => opt.value !== 'predefined'
					),
				]

		return new Discord.StringSelectMenuBuilder()
			.setcustom_id(custom_id)
			.setPlaceholder(placeholder)
			.addOptions(optionsArray)
	},

	/**
	 * Creates a row with a time unit selection menu
	 * @param custom_id - The custom ID for the select menu
	 * @param placeholder - The placeholder text for the menu
	 * @param includePredefined - Whether to include predefined values option
	 * @returns An action row with a time unit selection menu
	 */
	createTimeUnitMenuRow(
		custom_id: string,
		placeholder = 'Select time unit',
		includePredefined = true
	) {
		return new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
			this.createTimeUnitMenu(custom_id, placeholder, includePredefined)
		)
	},

	/**
	 * Creates a predefined time options select menu
	 * @param custom_id - The custom ID for the select menu
	 * @param placeholder - The placeholder text for the menu
	 * @returns A select menu builder with predefined time options
	 */
	createPredefinedTimeMenu(
		custom_id: string,
		placeholder = 'Select a predefined time limit'
	) {
		// Convert readonly array to mutable array
		const optionsArray = [...UI_COMPONENTS.PREDEFINED_TIME_OPTIONS]

		return new Discord.StringSelectMenuBuilder()
			.setcustom_id(custom_id)
			.setPlaceholder(placeholder)
			.addOptions(optionsArray)
	},

	/**
	 * Creates a row with a predefined time options select menu
	 * @param custom_id - The custom ID for the select menu
	 * @param placeholder - The placeholder text for the menu
	 * @returns An action row with a predefined time options select menu
	 */
	createPredefinedTimeMenuRow(
		custom_id: string,
		placeholder = 'Select a predefined time limit'
	) {
		return new Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>().addComponents(
			this.createPredefinedTimeMenu(custom_id, placeholder)
		)
	},

	/**
	 * Creates a row with a channel select menu
	 * @param custom_id - The custom ID for the select menu
	 * @param placeholder - The placeholder text for the menu
	 * @param channelTypes - The types of channels to include
	 * @returns An action row with a channel select menu
	 */
	createChannelSelectRow(
		custom_id: string,
		placeholder: string,
		channelTypes = [Discord.ChannelType.GuildText]
	) {
		return new Discord.ActionRowBuilder<Discord.ChannelSelectMenuBuilder>().addComponents(
			new Discord.ChannelSelectMenuBuilder()
				.setcustom_id(custom_id)
				.setPlaceholder(placeholder)
				.setChannelTypes(channelTypes)
		)
	},

	/**
	 * Creates a row with a role select menu
	 * @param custom_id - The custom ID for the select menu
	 * @param placeholder - The placeholder text for the menu
	 * @param minValues - Minimum number of roles to select
	 * @param maxValues - Maximum number of roles to select
	 * @returns An action row with a role select menu
	 */
	createRoleSelectRow(
		custom_id: string,
		placeholder: string,
		minValues = 0,
		maxValues = 10
	) {
		return new Discord.ActionRowBuilder<Discord.RoleSelectMenuBuilder>().addComponents(
			new Discord.RoleSelectMenuBuilder()
				.setcustom_id(custom_id)
				.setPlaceholder(placeholder)
				.setMinValues(minValues)
				.setMaxValues(maxValues)
		)
	},
}

export const CONTENT_BUILDERS = {
	/**
	 * Creates a formatted title section for a configuration panel
	 * @param title - The title of the configuration panel
	 * @param description - Optional description for the panel
	 * @returns Formatted markdown string with title and description
	 */
	createConfigHeader(title: string, description?: string): string {
		return [`# ${title}`, '', description || '', description ? '' : '']
			.filter(Boolean)
			.join('\n')
	},

	/**
	 * Creates a formatted settings section with key-value pairs
	 * @param title - The title of the settings section
	 * @param settings - Object containing setting keys and values
	 * @returns Formatted markdown string with settings
	 */
	createSettingsSection(
		title: string,
		settings: Record<string, string>
	): string {
		const settingsText = Object.entries(settings)
			.map(([key, value]) => `**${key}:** ${value}`)
			.join('\n')

		return [`## ${title}`, settingsText, ''].join('\n')
	},

	/**
	 * Creates the content for auto-close settings panel
	 * @param settings - Object containing auto-close settings
	 * @returns Formatted markdown string for auto-close settings panel
	 */
	createAutoCloseSettingsContent(settings: {
		status: string
		threshold: string
		reason: string
	}): string {
		return [
			this.createConfigHeader(
				'Auto-close Settings',
				'Configure when inactive tickets should be automatically closed.'
			),
			this.createSettingsSection('Current Settings', {
				Status: settings.status,
				Threshold: settings.threshold,
				'Close Reason': settings.reason,
			}),
			'Use the controls below to update these settings:',
		].join('\n')
	},

	/**
	 * Creates the content for role time limits configuration panel
	 * @param limitsText - Formatted text showing current role limits
	 * @returns Formatted markdown string for role time limits panel
	 */
	createRoleTimeLimitsContent(limitsText: string): string {
		return [
			this.createConfigHeader(
				'Role Time Limits',
				'Configure how long users with specific roles must wait between creating tickets.'
			),
			this.createSettingsSection('Current Limits', { '': limitsText }),
			'Use the controls below to manage role time limits:',
		].join('\n')
	},

	/**
	 * Creates the content for the main configuration panel
	 * @param settings - Object containing ticket system settings
	 * @returns Formatted markdown string for the main configuration panel
	 */
	createMainConfigContent(settings: Record<string, string>): string {
		return [
			this.createConfigHeader('🎫 Ticket System Configuration'),
			this.createSettingsSection('Current Settings', settings),
			'Select an option below to configure:',
		].join('\n')
	},
}

/**
 * Creates the typical components for auto-close settings panel
 * @param config - The ticket plugin configuration
 * @returns Object containing UI components for auto-close settings
 */
export function createAutoCloseSettingsComponents(
	config: PluginResponse<DefaultConfigs['tickets']>
): {
	toggleRow: Discord.ActionRowBuilder<Discord.ButtonBuilder>
	timeUnitRow: Discord.ActionRowBuilder<Discord.StringSelectMenuBuilder>
	backRow: Discord.ActionRowBuilder<Discord.ButtonBuilder>
} {
	const autoClose = config.auto_close?.[0] ?? {
		enabled: false,
		threshold: 72 * MS_IN.hour,
		reason: 'Ticket automatically closed due to inactivity.',
	}

	return {
		toggleRow: UI_BUILDERS.createAutoCloseToggleRow(autoClose.enabled),
		timeUnitRow: UI_BUILDERS.createTimeUnitMenuRow(
			'autoclose_time_unit_select',
			'Select time unit for threshold'
		),
		backRow: UI_BUILDERS.createBackButtonRow(),
	}
}

/**
 * Creates default settings for auto-close if not configured
 * @returns Default auto-close settings object
 */
export function getDefaultAutoCloseSettings() {
	return {
		enabled: false,
		threshold: 72 * MS_IN.hour,
		reason: 'Ticket automatically closed due to inactivity.',
	}
}

/**
 * Gets auto-close settings from config or default values
 * @param config - The ticket plugin configuration
 * @returns Auto-close settings object
 */
export function getAutoCloseSettings(
	config: PluginResponse<DefaultConfigs['tickets']>
) {
	return config.auto_close?.[0] ?? getDefaultAutoCloseSettings()
}

export const ticketUtils = {
	/* -----------------------------  API  ----------------------------- */

	getTicketConfig(clientId: string, guildId: string) {
		return api.getPluginConfig(clientId, guildId, 'tickets') as Promise<
			PluginResponse<DefaultConfigs['tickets']>
		>
	},

	updateTicketConfig(
		clientId: Discord.Client['user']['id'],
		guildId: Discord.Guild['id'],
		config: PluginResponse<DefaultConfigs['tickets']>
	) {
		return api.updatePluginConfig(clientId, guildId, 'tickets', config)
	},

	/* --------------------------  Components  ------------------------- */

	createToggleButtons(enabled: boolean) {
		return new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
			new Discord.ButtonBuilder()
				.setcustom_id('autoclose_enable')
				.setLabel('Enable')
				.setStyle(
					enabled ? Discord.ButtonStyle.Success : Discord.ButtonStyle.Secondary
				)
		)
	},

	createTimeUnitSelector(custom_id: string, includePredefined = true) {
		return UI_BUILDERS.createTimeUnitMenuRow(
			custom_id,
			'Select time unit',
			includePredefined
		)
	},

	formatAutoCloseSettings(config: PluginResponse<DefaultConfigs['tickets']>) {
		const autoClose = config.auto_close?.[0] ?? {
			enabled: false,
			threshold: 72 * MS_IN.hour,
			reason: 'Ticket automatically closed due to inactivity.',
		}

		return {
			status: autoClose.enabled ? '✅ Enabled' : '❌ Disabled',
			threshold: formatTimeThreshold(autoClose.threshold),
			reason: autoClose.reason,
		}
	},

	/* ------------------------  Time Helpers  ------------------------- */

	generateTimeValueOptions(timeUnit: keyof typeof TIME_VALUE_PRESETS) {
		return TIME_VALUE_PRESETS[timeUnit].map((value) => ({
			label: `${value} ${timeUnit}`,
			value: `${value}${timeUnit.charAt(0)}`, //30m, 2h, ect.
		}))
	},

	/** Flexible parser: "3d", "48", "2 h", etc. → milliseconds */
	parseTimeValue(raw: string): number {
		const input = raw?.trim().toLowerCase()
		if (!input) return 0

		const directMatch = input.match(/^(\d+)\s*([smhdwy])$/)
		if (directMatch) {
			const [, num, unit] = directMatch
			return parseTimeLimit(`${num}${unit}`) ?? 0
		}

		if (/^\d+d$/.test(input)) return parseTimeLimit(`${input}d`) ?? 0

		const spacedDayMatch = input.match(/^(\d+)\s*d?$/)
		if (spacedDayMatch) return Number(spacedDayMatch[1]) * MS_IN.day

		return 0
	},

	/** Numeric quantity + coarse unit selector → ms */
	calculateTimeInMs(timeNumber: number, timeUnit: string): number {
		switch (timeUnit) {
			case 'seconds':
				return timeNumber * MS_IN.second
			case 'minutes':
				return timeNumber * MS_IN.minute
			case 'hours':
				return timeNumber * MS_IN.hour
			case 'days':
				return timeNumber * MS_IN.day
			case 'weeks':
				return timeNumber * MS_IN.week
			default:
				return 0
		}
	},
} as const

/**
 * Formats milliseconds to a human-readable time format.
 * @param ms - The time in milliseconds
 * @returns A string representing the time in a human-readable format
 */
export function formatTimeThreshold(ms: number): string {
	const seconds = Math.floor(ms / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)
	const days = Math.floor(hours / 24)

	if (days > 0) {
		return `${days} ${days === 1 ? 'day' : 'days'}`
	}

	if (hours > 0) {
		return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
	}

	if (minutes > 0) {
		return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
	}

	return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`
}
