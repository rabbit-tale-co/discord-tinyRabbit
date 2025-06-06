import * as Discord from 'discord.js'
import type {
	TicketTemplates,
	ComponentsV2,
	PluginResponse,
	DefaultConfigs,
} from '@/types/plugins.js'
import * as V2 from 'discord-components-v2'
import { ID } from '@/commands/constants.js'
import {
	replacePlaceholders,
	type PlaceholderMap,
} from '@/discord/components/ui-builder.js'
import {
	buildV2Components,
	type ComponentConfig,
} from '@/discord/components/index.js'

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
	custom_id?: Discord.Snowflake
	url?: Discord.Snowflake
}

export type ActionRowComponent = Extract<
	ComponentsV2,
	{ type: Discord.ComponentType.ActionRow }
> & { components: ComponentsV2[] }

// Add separator component type
export type SeparatorComponent = {
	type: 14 // ComponentType.Separator
	divider?: boolean
	spacing?: number
}

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

interface V2ComponentsTemplate {
	type: 'v2_components'
	components: (ComponentsV2 | SeparatorComponent)[]
}

type TicketTemplate =
	| ContainerTemplate
	| ComponentsTemplate
	| V2ComponentsTemplate

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

		// Handle different template types
		if (tpl.type === 'container') {
			return buildContainerTemplate(tpl, placeholders)
		}
		if (tpl.type === 'v2_components') {
			return buildV2ComponentsTemplate(tpl, placeholders)
		}
		return buildComponentsTemplate(tpl, placeholders)
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

/**
 * Create a ticket message using V2 components with full support for separators, text displays, and buttons
 */
export function createV2TicketMessage(
	components: (ComponentsV2 | SeparatorComponent)[],
	placeholders: Record<string, string | number> = {}
): Discord.BaseMessageOptions {
	try {
		// Create mock member and guild for buildV2Components
		const mockMember = {
			user: {
				displayAvatarURL: () =>
					placeholders.user_avatar ||
					'https://cdn.discordapp.com/embed/avatars/0.png',
			},
		} as Discord.GuildMember

		const mockGuild = {
			name: placeholders.guild_name || 'Server',
		} as Discord.Guild

		// Transform components to replace placeholders in text content
		const processedComponents = components.map((component) => {
			if (component.type === 10 && 'content' in component) {
				// Text display component - replace placeholders
				return {
					...component,
					content: replacePlaceholders(
						(component as { content: string }).content,
						placeholders
					),
				}
			}
			if (component.type === 9 && 'components' in component) {
				// Section component - process nested text displays
				const processedSubComponents =
					(
						component as {
							components: Array<{ type: number; content?: string }>
						}
					).components?.map((subComp) => {
						if (subComp.type === 10 && subComp.content) {
							return {
								...subComp,
								content: replacePlaceholders(subComp.content, placeholders),
							}
						}
						return subComp
					}) || []

				return {
					...component,
					components: processedSubComponents,
				}
			}
			return component
		})

		// Use the existing buildV2Components function
		const v2Components = buildV2Components(
			processedComponents as ComponentConfig[],
			mockMember,
			mockGuild
		)

		return {
			components: v2Components,
		}
	} catch (error) {
		throw new TicketError(
			`Failed to create V2 ticket message: ${error instanceof Error ? error.message : String(error)}`,
			'CREATE_V2_MESSAGE_FAILED'
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
		// Check if this template contains V2 components (separators, sections, etc.)
		const hasV2Components = tpl.components.some(
			(comp) =>
				comp.type === 14 || // Separator
				comp.type === 9 || // Section
				comp.type === 11 || // Thumbnail
				comp.type === 12 // MediaGallery
		)

		if (hasV2Components) {
			// Use createV2TicketMessage for V2 components
			return createV2TicketMessage(tpl.components, map)
		}

		// Original logic for standard components
		const rows = extractRows(tpl.components, map)

		// Validate rows
		if (rows.length > 5) {
			throw new TicketError(
				'Too many component rows (maximum 5)',
				'TOO_MANY_ROWS'
			)
		}

		// Recursively extract all text displays from components and action rows
		const content = extractAllTextDisplays(tpl.components, map)

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

function buildV2ComponentsTemplate(
	tpl: V2ComponentsTemplate,
	map: PlaceholderMap
): Discord.BaseMessageOptions {
	try {
		return createV2TicketMessage(tpl.components, map)
	} catch (error) {
		if (error instanceof TicketError) {
			throw error
		}
		throw new TicketError(
			`Failed to build V2 components template: ${error instanceof Error ? error.message : String(error)}`,
			'BUILD_V2_COMPONENTS_FAILED'
		)
	}
}

function createV2Button(
	btnComp: ButtonComponent,
	placeholders: Record<string, string | number>
): Discord.ButtonBuilder | null {
	try {
		const label = replacePlaceholders(btnComp.label, placeholders)
		if (!label) return null

		const button = V2.makeButton({
			label,
			style: btnComp.style ?? Discord.ButtonStyle.Primary,
		})

		if (btnComp.url) {
			const url = replacePlaceholders(btnComp.url, placeholders)
			if (url) {
				button.setURL(url).setStyle(Discord.ButtonStyle.Link)
			}
		} else if (btnComp.custom_id) {
			const custom_id = replacePlaceholders(btnComp.custom_id, placeholders)
			if (custom_id) {
				button.setCustomId(custom_id)
			}
		}

		return button
	} catch (error) {
		console.error('Error creating V2 button:', error)
		return null
	}
}

/**
 * Recursively extract all text displays from components, including nested ones in action rows
 */
function extractAllTextDisplays(
	components: ComponentsV2[],
	map: PlaceholderMap
): string {
	const textDisplays: string[] = []

	for (const comp of components) {
		if (comp.type === Discord.ComponentType.TextDisplay) {
			const textComp = comp as TextDisplayComponent
			if (textComp.text) {
				textDisplays.push(replacePlaceholders(textComp.text, map))
			}
		} else if (comp.type === Discord.ComponentType.ActionRow) {
			const actionRow = comp as ActionRowComponent
			if (actionRow.components) {
				// Recursively extract text displays from action row components
				const nestedText = extractAllTextDisplays(actionRow.components, map)
				if (nestedText) {
					textDisplays.push(nestedText)
				}
			}
		}
	}

	return textDisplays.join('\n')
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
					// Text displays are handled separately in extractAllTextDisplays
					break

				case 14: // ComponentType.Separator
					// Separators are handled in V2 components, skip here
					break

				case 9: // ComponentType.Section
					// Sections are handled in V2 components, skip here
					break

				case 10: // ComponentType.TextDisplay (alternative check)
					// Text displays are handled separately
					break

				case 11: // ComponentType.Thumbnail
					// Thumbnails are handled in V2 components, skip here
					break

				case 12: // ComponentType.MediaGallery
					// Media galleries are handled in V2 components, skip here
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
