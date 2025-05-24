import * as Discord from 'discord.js'
import type {
	TicketTemplates,
	ComponentsV2,
	PluginResponse,
	DefaultConfigs,
} from '@/types/plugins.js'
import * as V2 from 'discord-components-v2'
import { ID } from '../../constants.js'
import { PlaceholderMap, replacePlaceholders } from '@/components/ui-builder.js'

// Define container styles enum since it's not exported from discord.js
enum ContainerStyle {
	NORMAL = 0,
	SECONDARY = 1,
	SUCCESS = 2,
	DANGER = 3,
}

export type TextDisplayComponent = Extract<
	ComponentsV2,
	{ type: Discord.ComponentType.TextDisplay }
> & { text: Discord.Snowflake }

export type ButtonComponent = Extract<
	ComponentsV2,
	{ type: Discord.ComponentType.Button }
> & {
	label: Discord.Snowflake
	style?: Discord.ButtonStyle
	customId?: Discord.Snowflake
	url?: Discord.Snowflake
}

export type ActionRowComponent = Extract<
	ComponentsV2,
	{ type: Discord.ComponentType.ActionRow }
> & { components: ComponentsV2[] }

interface ContainerTemplate {
	type: 'container'
	content: string
	style?: ContainerStyle
	components?: ComponentsV2[]
}

interface ComponentsTemplate {
	type: 'components'
	components: ComponentsV2[]
}

type TicketTemplate = ContainerTemplate | ComponentsTemplate

class TicketError extends Error {
	constructor(
		message: string,
		public readonly code: string
	) {
		super(message)
		this.name = 'TicketError'
	}
}

/* -------------------------------------------------------------------------- */
/*                             PUBLIC  API                                    */
/* -------------------------------------------------------------------------- */

export async function createTicketMessage(
	config: PluginResponse<DefaultConfigs['tickets']>,
	templateKey: keyof TicketTemplates,
	placeholders: Record<Discord.Snowflake, Discord.Snowflake | number> = {}
): Promise<Discord.BaseMessageOptions> {
	try {
		const tpl = config.components?.[templateKey] as unknown as
			| TicketTemplate
			| undefined
		if (!tpl) {
			throw new TicketError(
				`Template not found: ${String(templateKey)}`,
				'TEMPLATE_NOT_FOUND'
			)
		}

		return tpl.type === 'container'
			? buildContainerTemplate(tpl, placeholders)
			: buildComponentsTemplate(tpl, placeholders)
	} catch (error) {
		if (error instanceof TicketError) {
			throw error
		}
		throw new TicketError(
			`Failed to create ticket message: ${error instanceof Error ? error.message : String(error)}`,
			'CREATE_MESSAGE_FAILED'
		)
	}
}

/* -------------------------------------------------------------------------- */
/*                              TEMPLATE BUILDERS                             */
/* -------------------------------------------------------------------------- */

function buildContainerTemplate(
	tpl: ContainerTemplate,
	map: PlaceholderMap
): Discord.BaseMessageOptions {
	try {
		const content = replacePlaceholders(tpl.content, map)
		const componentRows = tpl.components ? extractRows(tpl.components, map) : []

		// Validate component rows
		if (componentRows.length > 5) {
			throw new TicketError(
				'Too many component rows (maximum 5)',
				'TOO_MANY_ROWS'
			)
		}

		// Convert ActionRowBuilders to component arrays
		const components = componentRows.map((row) => {
			const json = row.toJSON()
			if (!json.components?.length) {
				throw new TicketError('Empty component row', 'EMPTY_ROW')
			}
			return json
		})

		const container = V2.makeContainer(components).setColor(
			tpl.style ?? ContainerStyle.NORMAL
		)

		return {
			content,
			components: [container],
		}
	} catch (error) {
		if (error instanceof TicketError) {
			throw error
		}
		throw new TicketError(
			`Failed to build container template: ${error instanceof Error ? error.message : String(error)}`,
			'BUILD_CONTAINER_FAILED'
		)
	}
}

function buildComponentsTemplate(
	tpl: ComponentsTemplate,
	map: PlaceholderMap
): Discord.BaseMessageOptions {
	try {
		const rows = extractRows(tpl.components, map)

		// Validate rows
		if (rows.length > 5) {
			throw new TicketError(
				'Too many component rows (maximum 5)',
				'TOO_MANY_ROWS'
			)
		}

		const content = tpl.components
			.filter(
				(c): c is TextDisplayComponent =>
					c.type === Discord.ComponentType.TextDisplay
			)
			.map((t) => replacePlaceholders(t.text, map))
			.join('\n')

		return {
			content,
			components: rows.map((row) => {
				const json = row.toJSON()
				if (!json.components?.length) {
					throw new TicketError('Empty component row', 'EMPTY_ROW')
				}
				return json
			}),
		}
	} catch (error) {
		if (error instanceof TicketError) {
			throw error
		}
		throw new TicketError(
			`Failed to build components template: ${error instanceof Error ? error.message : String(error)}`,
			'BUILD_COMPONENTS_FAILED'
		)
	}
}

/* -------------------------------------------------------------------------- */
/*                             COMPONENTS utils                               */
/* -------------------------------------------------------------------------- */

function extractRows(components: ComponentsV2[], map: PlaceholderMap) {
	try {
		const rows: Discord.ActionRowBuilder<Discord.ButtonBuilder>[] = []
		let currentRow: Discord.ButtonBuilder[] = []

		const push = () => {
			if (currentRow.length) {
				if (currentRow.length > 5) {
					throw new TicketError(
						'Too many buttons in row (maximum 5)',
						'TOO_MANY_BUTTONS'
					)
				}
				rows.push(
					new Discord.ActionRowBuilder<Discord.ButtonBuilder>().addComponents(
						currentRow
					)
				)
				currentRow = []
			}
		}

		for (const comp of components) {
			switch (comp.type) {
				case Discord.ComponentType.Button:
					currentRow.push(
						convertButton(
							comp as Discord.ButtonComponent,
							map,
							currentRow.length
						)
					)
					if (currentRow.length === 5) push()
					break

				case Discord.ComponentType.ActionRow: {
					push()
					const row = comp as ActionRowComponent
					if (!row.components?.length) {
						throw new TicketError('Empty action row', 'EMPTY_ACTION_ROW')
					}
					rows.push(...extractRows(row.components, map))
					break
				}

				case Discord.ComponentType.TextDisplay:
					break

				default:
					throw new TicketError(
						`Unsupported component type: ${comp.type}`,
						'UNSUPPORTED_COMPONENT'
					)
			}
		}
		push()
		return rows
	} catch (error) {
		if (error instanceof TicketError) {
			throw error
		}
		throw new TicketError(
			`Failed to extract rows: ${error instanceof Error ? error.message : String(error)}`,
			'EXTRACT_ROWS_FAILED'
		)
	}
}

function convertButton(
	btn: Discord.ButtonComponent,
	map: PlaceholderMap,
	idx: number
): Discord.ButtonBuilder {
	try {
		if (!btn.label) {
			throw new TicketError('Button must have a label', 'MISSING_LABEL')
		}

		const button = new Discord.ButtonBuilder()
			.setLabel(replacePlaceholders(btn.label, map))
			.setStyle(btn.style ?? Discord.ButtonStyle.Secondary)

		if (btn.url) {
			if (!btn.url.startsWith('http')) {
				throw new TicketError('Invalid URL format', 'INVALID_URL')
			}
			button.setURL(replacePlaceholders(btn.url, map))
		} else {
			button.setCustomId(btn.customId ?? `${ID.TICKET_OPEN}:${idx}`)
		}

		return button
	} catch (error) {
		if (error instanceof TicketError) {
			throw error
		}
		throw new TicketError(
			`Failed to convert button: ${error instanceof Error ? error.message : String(error)}`,
			'CONVERT_BUTTON_FAILED'
		)
	}
}
