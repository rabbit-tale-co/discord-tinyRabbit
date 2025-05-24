import type * as Discord from 'discord.js'
import { cid, ACTIONS } from '@/components/ui-builder.js'

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
/*                             CUSTOM‑ID  DICTIONARY                          */
/* -------------------------------------------------------------------------- */

export const ID = {
	// ––– Ticket lifecycle ––––––––––––––––––––––––––––––––––––––––––––––––––––
	TICKET_OPEN: cid(PLUGINS.TICKETS, ACTIONS.OPEN),
	TICKET_CONFIRM_CLOSE: (thread_id: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, ACTIONS.CONFIRM, 'close', thread_id),
	TICKET_CANCEL_CLOSE: (thread_id: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, ACTIONS.CANCEL, 'close', thread_id),
	TICKET_CLAIM: (thread_id: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, 'claim', thread_id),
	TICKET_JOIN: (thread_id: Discord.ThreadChannel['id']) =>
		cid(PLUGINS.TICKETS, 'join', thread_id),

	// ––– Config UI –––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
	CONFIG_SELECT: cid(PLUGINS.TICKETS, 'config_select'),
	CONFIG_BACK: cid(PLUGINS.TICKETS, ACTIONS.BACK, 'config'),

	// Role time‑limits
	ROLE_LIMIT_ADD: cid(PLUGINS.TICKETS, ACTIONS.ADD, 'role_limit'),
	ROLE_LIMIT_REMOVE: cid(PLUGINS.TICKETS, ACTIONS.REMOVE, 'role_limit'),
	ROLE_LIMIT_REMOVE_SELECT: cid(PLUGINS.TICKETS, 'role_limit_remove_select'),
	ROLE_LIMIT_SELECT: cid(PLUGINS.TICKETS, 'role_limit_select'),
	ROLE_LIMIT_TIME_UNIT: cid(PLUGINS.TICKETS, 'role_limit_time_unit'),
	ROLE_LIMIT_TIME_VALUE: (roles: string) =>
		cid(PLUGINS.TICKETS, 'role_limit_time_value', roles),

	// Autoclose settings
	AC_ENABLE: cid(PLUGINS.TICKETS, 'ac_enable'),
	AC_DISABLE: cid(PLUGINS.TICKETS, 'ac_disable'),
	AC_SET_REASON: cid(PLUGINS.TICKETS, 'ac_set_reason'),
	AC_UNIT_SELECT: cid(PLUGINS.TICKETS, 'ac_unit_select'),
	AC_VALUE_SELECT: (unit: Discord.Snowflake) =>
		cid(PLUGINS.TICKETS, 'ac_value', unit),
	AC_PRESET_SELECT: cid(PLUGINS.TICKETS, 'ac_preset_select'),
}

export type TicketCustomId =
	| typeof ID.TICKET_OPEN
	| ReturnType<typeof ID.TICKET_CONFIRM_CLOSE>
	| ReturnType<typeof ID.TICKET_CANCEL_CLOSE>
	| ReturnType<typeof ID.TICKET_CLAIM>
	| ReturnType<typeof ID.TICKET_JOIN>
	| typeof ID.CONFIG_SELECT
	| typeof ID.CONFIG_BACK
	| typeof ID.ROLE_LIMIT_ADD
	| typeof ID.ROLE_LIMIT_REMOVE
	| typeof ID.ROLE_LIMIT_REMOVE_SELECT
	| typeof ID.ROLE_LIMIT_SELECT
	| typeof ID.ROLE_LIMIT_TIME_UNIT
	| ReturnType<typeof ID.ROLE_LIMIT_TIME_VALUE>
	| typeof ID.AC_ENABLE
	| typeof ID.AC_DISABLE
	| typeof ID.AC_SET_REASON
	| typeof ID.AC_UNIT_SELECT
	| ReturnType<typeof ID.AC_VALUE_SELECT>
	| typeof ID.AC_PRESET_SELECT
