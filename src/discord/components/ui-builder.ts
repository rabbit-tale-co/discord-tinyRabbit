// Placeholder types and functions
export type PlaceholderMap = Record<string, string | number>

export const replacePlaceholders = (
	raw: string,
	map: PlaceholderMap = {}
): string =>
	raw.replace(/\\?{(\w+)}/g, (match, key) =>
		match.startsWith('\\') ? match.slice(1) : String(map[key] ?? match)
	)
export const toTimestamp = (date: Date | number): number =>
	Math.floor((typeof date === 'number' ? date : date.getTime()) / 1_000)

// Action types for custom IDs
export const ACTIONS = [
	// Navigation
	'back',
	'next',
	'prev',

	// Basic operations
	'open',
	'cancel',
	'close',
	'confirm',
	'save',
	'delete',
	'add',
	'remove',
	'rate',

	// Ticket specific
	'claim',
	'join',
	'select',
	'config_select',
	'autoclose',
] as const

export const PLUGINS = [
	'tickets',
	'levels',
	'welcome_goodbye',
	'starboard',
	'birthday',
	'tempvc',
	'slowmode',
] as const

export type Action = (typeof ACTIONS)[number]
export type Plugin = (typeof PLUGINS)[number]

// Custom ID generator
export const cid = (
	plugin: Plugin,
	action: Action,
	...extra: Array<string | number>
): string => [plugin, action, ...extra].join(':')
