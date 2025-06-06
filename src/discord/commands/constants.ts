import type * as Discord from 'discord.js'
import { cid } from '@/discord/components/ui-builder.js'

/* -------------------------------------------------------------------------- */
/*                                PLUGIN KEY                                  */
/* -------------------------------------------------------------------------- */

// used to generate custom-id (cid)
export const PLUGINS = Object.freeze({
	TICKETS: 'tickets',
	LEVELS: 'levels',
	WELCOME_GOODBYE: 'welcome_goodbye',
	STARBOARD: 'starboard',
	BIRTHDAY: 'birthday',
	TEMPVC: 'tempvc',
	SLOWMODE: 'slowmode',
} as const)

/* -------------------------------------------------------------------------- */
/*                             TICKET ACTIONS                                 */
/* -------------------------------------------------------------------------- */

// Direct actions (without plugin prefix)
export const DIRECT_ACTIONS = {
	OPEN: (category: string) => `open_ticket_${category}`,
	CLAIM: 'claim_ticket',
	JOIN: 'join_ticket',
	CLOSE: 'close_ticket',
} as const

// Structured actions (with plugin prefix)
export const TICKET_ACTIONS = {
	// Basic ticket operations
	OPEN: cid(PLUGINS.TICKETS, 'open'),
	CONFIRM_CLOSE: (threadId: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, 'confirm', 'close', threadId),
	CANCEL_CLOSE: (threadId: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, 'cancel', 'close', threadId),
	CLAIM: (threadId: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, 'claim', threadId),
	JOIN: (threadId: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, 'join', threadId),

	// Rating system
	RATE: (threadId: Discord.ThreadChannel['id'], rating: number) =>
		cid(PLUGINS.TICKETS, 'rate', threadId, rating.toString()),

	// Configuration
	CONFIG: {
		SELECT: cid(PLUGINS.TICKETS, 'config_select'),
		BACK: cid(PLUGINS.TICKETS, 'back', 'config'),
	},

	// Role time limits
	ROLE_LIMITS: {
		ADD: cid(PLUGINS.TICKETS, 'add', 'role_limit'),
		EDIT: cid(PLUGINS.TICKETS, 'edit', 'role_limit'),
		REMOVE: cid(PLUGINS.TICKETS, 'remove', 'role_limit'),
		REMOVE_SELECT: cid(PLUGINS.TICKETS, 'select', 'role_limit_remove'),
		SELECT: cid(PLUGINS.TICKETS, 'select', 'role_limit'),
		TIME_UNIT: cid(PLUGINS.TICKETS, 'select', 'role_limit_time_unit'),
		TIME_VALUE: (roles: string) =>
			cid(PLUGINS.TICKETS, 'select', 'role_limit_time_value', roles),
	},

	// Auto-close settings
	AUTO_CLOSE: {
		ENABLE: cid(PLUGINS.TICKETS, 'autoclose', 'enable'),
		DISABLE: cid(PLUGINS.TICKETS, 'autoclose', 'disable'),
		SET_REASON: cid(PLUGINS.TICKETS, 'autoclose', 'reason'),
		UNIT_SELECT: cid(PLUGINS.TICKETS, 'autoclose', 'unit'),
		VALUE_SELECT: (unit: Discord.Snowflake) =>
			cid(PLUGINS.TICKETS, 'autoclose', 'value', unit),
		PRESET_SELECT: cid(PLUGINS.TICKETS, 'autoclose', 'preset'),
	},
} as const

/* -------------------------------------------------------------------------- */
/*                             LEGACY ID SUPPORT                              */
/* -------------------------------------------------------------------------- */

// For backward compatibility - will be removed in future
export const ID = {
	TICKET_OPEN: TICKET_ACTIONS.OPEN,
	TICKET_CONFIRM_CLOSE: TICKET_ACTIONS.CONFIRM_CLOSE,
	TICKET_CANCEL_CLOSE: TICKET_ACTIONS.CANCEL_CLOSE,
	TICKET_CLAIM: TICKET_ACTIONS.CLAIM,
	TICKET_JOIN: TICKET_ACTIONS.JOIN,
	TICKET_RATE: TICKET_ACTIONS.RATE,
	CONFIG_SELECT: TICKET_ACTIONS.CONFIG.SELECT,
	CONFIG_BACK: TICKET_ACTIONS.CONFIG.BACK,
	ROLE_LIMIT_ADD: TICKET_ACTIONS.ROLE_LIMITS.ADD,
	ROLE_LIMIT_EDIT: TICKET_ACTIONS.ROLE_LIMITS.EDIT,
	ROLE_LIMIT_REMOVE: TICKET_ACTIONS.ROLE_LIMITS.REMOVE,
	ROLE_LIMIT_REMOVE_SELECT: TICKET_ACTIONS.ROLE_LIMITS.REMOVE_SELECT,
	ROLE_LIMIT_SELECT: TICKET_ACTIONS.ROLE_LIMITS.SELECT,
	ROLE_LIMIT_TIME_UNIT: TICKET_ACTIONS.ROLE_LIMITS.TIME_UNIT,
	ROLE_LIMIT_TIME_VALUE: TICKET_ACTIONS.ROLE_LIMITS.TIME_VALUE,
	AC_ENABLE: TICKET_ACTIONS.AUTO_CLOSE.ENABLE,
	AC_DISABLE: TICKET_ACTIONS.AUTO_CLOSE.DISABLE,
	AC_SET_REASON: TICKET_ACTIONS.AUTO_CLOSE.SET_REASON,
	AC_UNIT_SELECT: TICKET_ACTIONS.AUTO_CLOSE.UNIT_SELECT,
	AC_VALUE_SELECT: TICKET_ACTIONS.AUTO_CLOSE.VALUE_SELECT,
	AC_PRESET_SELECT: TICKET_ACTIONS.AUTO_CLOSE.PRESET_SELECT,
} as const

export type Ticketcustom_id =
	| ReturnType<typeof DIRECT_ACTIONS.OPEN>
	| typeof DIRECT_ACTIONS.CLAIM
	| typeof DIRECT_ACTIONS.JOIN
	| typeof DIRECT_ACTIONS.CLOSE
	| typeof TICKET_ACTIONS.OPEN
	| ReturnType<typeof TICKET_ACTIONS.CONFIRM_CLOSE>
	| ReturnType<typeof TICKET_ACTIONS.CANCEL_CLOSE>
	| ReturnType<typeof TICKET_ACTIONS.CLAIM>
	| ReturnType<typeof TICKET_ACTIONS.JOIN>
	| ReturnType<typeof TICKET_ACTIONS.RATE>
	| typeof TICKET_ACTIONS.CONFIG.SELECT
	| typeof TICKET_ACTIONS.CONFIG.BACK
	| typeof TICKET_ACTIONS.ROLE_LIMITS.ADD
	| typeof TICKET_ACTIONS.ROLE_LIMITS.EDIT
	| typeof TICKET_ACTIONS.ROLE_LIMITS.REMOVE
	| typeof TICKET_ACTIONS.ROLE_LIMITS.REMOVE_SELECT
	| typeof TICKET_ACTIONS.ROLE_LIMITS.SELECT
	| typeof TICKET_ACTIONS.ROLE_LIMITS.TIME_UNIT
	| ReturnType<typeof TICKET_ACTIONS.ROLE_LIMITS.TIME_VALUE>
	| typeof TICKET_ACTIONS.AUTO_CLOSE.ENABLE
	| typeof TICKET_ACTIONS.AUTO_CLOSE.DISABLE
	| typeof TICKET_ACTIONS.AUTO_CLOSE.SET_REASON
	| typeof TICKET_ACTIONS.AUTO_CLOSE.UNIT_SELECT
	| ReturnType<typeof TICKET_ACTIONS.AUTO_CLOSE.VALUE_SELECT>
	| typeof TICKET_ACTIONS.AUTO_CLOSE.PRESET_SELECT
