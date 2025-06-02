import type * as Discord from 'discord.js'
import type { GuildMember } from 'discord.js'
import type { ButtonStyle } from 'discord.js'
import { replacePlaceholders } from '@/utils/replacePlaceholders.js'
import * as V2 from 'discord-components-v2'
import {
	TextDisplayBuilder,
	ThumbnailBuilder,
	ButtonBuilder,
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} from 'discord.js'
import type { ComponentsV2, ComponentContainer } from '@/types/plugins.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'

// Type definitions for component configuration
type TextComponent = {
	type: 10
	content: string
}

type SeparatorComponent = {
	type: 14
	divider?: boolean
	spacing?: number
}

type ThumbnailAccessory = {
	type: 11
	media: {
		url: string
	}
}

type MediaGalleryAccessory = {
	type: 12
	items: Array<{
		media: {
			url: string
			description?: string
		}
	}>
}

type SectionComponent = {
	type: 9
	accessory?: ThumbnailAccessory | MediaGalleryAccessory
	components?: Array<TextComponent | SeparatorComponent>
}

type MediaGalleryComponent = {
	type: 12
	items: Array<{
		media: {
			url: string
			description?: string
		}
	}>
}

type ButtonComponent = {
	type: 2
	style: number
	label: string
	custom_id?: string
	url?: string
	disabled?: boolean
	emoji?: string | Discord.APIMessageComponentEmoji
}

type ActionRowComponent = {
	type: 1
	components: Array<ButtonComponent>
}

type ComponentConfig =
	| SectionComponent
	| TextComponent
	| MediaGalleryComponent
	| SeparatorComponent
	| ButtonComponent
	| ActionRowComponent

// Type for flexible component handling
type AnyComponent = {
	type: number
	[key: string]: unknown
}

// Universal configuration structure for any plugin - made more flexible
interface UniversalComponentConfig {
	components?: ComponentConfig[] | AnyComponent[] | unknown[]
}

// Helper functions for type checking
function isThumbnailAccessory(
	accessory: unknown
): accessory is ThumbnailAccessory {
	return (
		accessory !== null &&
		typeof accessory === 'object' &&
		'type' in accessory &&
		(accessory as { type: number }).type === 11 &&
		'media' in accessory &&
		typeof (accessory as { media: unknown }).media === 'object' &&
		(accessory as { media: { url?: unknown } }).media !== null &&
		'url' in (accessory as { media: { url?: unknown } }).media &&
		typeof (accessory as { media: { url?: unknown } }).media.url === 'string'
	)
}

function isMediaGalleryAccessory(
	accessory: unknown
): accessory is MediaGalleryAccessory {
	return (
		accessory !== null &&
		typeof accessory === 'object' &&
		'type' in accessory &&
		(accessory as { type: number }).type === 12 &&
		'items' in accessory &&
		Array.isArray((accessory as { items: unknown }).items)
	)
}

function isMediaItemWithUrl(
	item: unknown
): item is { media: { url: string; description?: string } } {
	return (
		item !== null &&
		typeof item === 'object' &&
		'media' in (item as object) &&
		(item as { media: unknown }).media !== null &&
		typeof (item as { media: unknown }).media === 'object' &&
		'url' in ((item as { media: { url?: unknown } }).media as object) &&
		typeof ((item as { media: { url?: unknown } }).media as { url?: unknown })
			.url === 'string'
	)
}

function isSeparatorComponent(
	component: unknown
): component is SeparatorComponent {
	return (
		component !== null &&
		typeof component === 'object' &&
		'type' in component &&
		(component as { type: number }).type === 14
	)
}

function isButtonComponent(component: unknown): component is ButtonComponent {
	return (
		component !== null &&
		typeof component === 'object' &&
		'type' in component &&
		(component as { type: number }).type === 2
	)
}

function isActionRowComponent(
	component: unknown
): component is ActionRowComponent {
	return (
		component !== null &&
		typeof component === 'object' &&
		'type' in component &&
		(component as { type: number }).type === 1
	)
}

// Universal builder function that can handle any configuration structure
export function buildUniversalComponents(
	config: ComponentContainer | ComponentsV2[] | null | undefined,
	member: GuildMember,
	guild: Discord.Guild,
	additionalPlaceholders: Record<string, string> = {},
	forceButtons = false
): {
	v2Components: (
		| Discord.APIMessageTopLevelComponent
		| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
	)[]
	actionRows: ActionRowBuilder<ButtonBuilder>[]
} {
	const v2Components: (
		| Discord.APIMessageTopLevelComponent
		| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
	)[] = []
	const actionRows: ActionRowBuilder<ButtonBuilder>[] = []

	// Track used custom IDs to prevent duplicates
	const usedcustom_ids = new Set<string>()

	// Handle null/undefined config
	if (!config) {
		StatusLogger.warn('No components provided to buildUniversalComponents')
		return { v2Components, actionRows }
	}

	// Handle both ComponentContainer and ComponentsV2[] formats
	const components = Array.isArray(config) ? config : config.components
	if (!components) {
		StatusLogger.warn('No components found in configuration')
		return { v2Components, actionRows }
	}

	// First pass: extract all custom IDs from raw components
	if (components && Array.isArray(components)) {
		extractcustom_idsFromRawComponents(components, usedcustom_ids)
	}

	// Process components
	if (components && Array.isArray(components)) {
		// Process text displays and separators in order
		for (const comp of components) {
			const component = comp as unknown as AnyComponent

			if (component.type === 10) {
				// Text display - handle both 'content' and 'text' properties
				const content = applyAllPlaceholders(
					String(component.content || component.text || ''),
					member,
					guild,
					additionalPlaceholders
				)
				const textDisplay = V2.makeTextDisplay(content)
				if (textDisplay) {
					v2Components.push(textDisplay)
				}
			} else if (component.type === 14 && isSeparatorComponent(component)) {
				// Separator
				const separator = V2.makeSeparator({
					divider: component.divider ?? true,
					spacing: component.spacing ?? 1,
				})
				if (separator) {
					v2Components.push(separator)
				}
			}
		}

		// Then handle interactive components (buttons or select menu)
		const buttons: ButtonBuilder[] = []
		const actionRowComponents = components.filter((comp) => {
			const component = comp as unknown as AnyComponent
			return (
				component.type === 1 &&
				'components' in component &&
				Array.isArray(component.components)
			)
		})

		for (const actionRow of actionRowComponents) {
			const component = actionRow as unknown as AnyComponent
			const components = 'components' in component ? component.components : []
			const buttonComponents = (Array.isArray(components) ? components : [])
				.filter(isButtonComponent)
				.filter((btn) => !btn.url)

			if (buttonComponents.length > 0) {
				if (buttonComponents.length <= 3 || forceButtons) {
					// Create regular buttons for 3 or fewer options, or when forced
					for (const btnComp of buttonComponents) {
						const button = new ButtonBuilder()
							.setLabel(
								applyAllPlaceholders(
									btnComp.label,
									member,
									guild,
									additionalPlaceholders
								)
							)
							.setStyle(btnComp.style as Discord.ButtonStyle)
							.setCustomId(
								applyAllPlaceholders(
									btnComp.custom_id ||
										`action_${btnComp.label.toLowerCase().replace(/\s+/g, '_')}`,
									member,
									guild,
									additionalPlaceholders
								)
							)

						if (btnComp.disabled) {
							button.setDisabled(btnComp.disabled)
						}
						if (btnComp.emoji) {
							button.setEmoji(btnComp.emoji)
						}
						buttons.push(button)
					}
				} else {
					// Create select menu for more than 3 options
					const validButtons = buttonComponents.filter(
						(btn): btn is Required<ButtonComponent> => {
							if (!btn.custom_id || typeof btn.custom_id !== 'string') {
								StatusLogger.warn(
									`Button missing valid custom_id: ${btn.label}, received: ${JSON.stringify(btn.custom_id)}`
								)
								return false
							}
							if (!btn.label || typeof btn.label !== 'string') {
								StatusLogger.warn(`Button missing valid label: ${btn.custom_id}`)
								return false
							}
							return true
						}
					)

					if (validButtons.length === 0) {
						StatusLogger.warn(
							'No valid buttons found for select menu, skipping creation'
						)
						return
					}

					try {
						const selectMenu = new StringSelectMenuBuilder()
							.setCustomId(
								applyAllPlaceholders(
									validButtons[0].custom_id,
									member,
									guild,
									additionalPlaceholders
								)
							)
							.setPlaceholder('Select an action')
							.addOptions(
								validButtons.map((btnComp) =>
									new StringSelectMenuOptionBuilder()
										.setLabel(
											applyAllPlaceholders(
												btnComp.label,
												member,
												guild,
												additionalPlaceholders
											)
										)
										.setValue(
											applyAllPlaceholders(
												btnComp.custom_id,
												member,
												guild,
												additionalPlaceholders
											)
										)
										.setDescription(`Select to ${btnComp.label.toLowerCase()}`)
								)
							)

						const selectActionRow =
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								selectMenu
							)
						actionRows.push(
							selectActionRow as unknown as ActionRowBuilder<ButtonBuilder>
						)
					} catch (error) {
						StatusLogger.error('Failed to create select menu', error as Error)
					}
					break // Exit after creating select menu
				}
			}
		}

		// Add buttons to action row if we have any
		if (buttons.length > 0) {
			const buttonActionRow =
				new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)
			actionRows.push(buttonActionRow)
		}
	}

	return { v2Components, actionRows }
}

// Helper function to extract custom IDs from raw components before processing
function extractcustom_idsFromRawComponents(
	components: unknown[],
	usedcustom_ids: Set<string>
): void {
	for (const component of components) {
		if (typeof component === 'object' && component !== null) {
			const comp = component as Record<string, unknown>

			// Check for ActionRow (type 1) with nested components
			if (comp.type === 1 && Array.isArray(comp.components)) {
				for (const subComponent of comp.components) {
					if (typeof subComponent === 'object' && subComponent !== null) {
						const subComp = subComponent as Record<string, unknown>
						// Check for Button (type 2) with custom_id
						if (subComp.type === 2 && typeof subComp.custom_id === 'string') {
							usedcustom_ids.add(subComp.custom_id)
						}
					}
				}
			}
			// Check for direct Button component (type 2)
			else if (comp.type === 2 && typeof comp.custom_id === 'string') {
				usedcustom_ids.add(comp.custom_id)
			}
		}
	}
}

// Helper function to extract custom IDs from components array (legacy - keeping for compatibility)
function extractcustom_ids(
	components: AnyComponent[],
	usedcustom_ids: Set<string>
): void {
	for (const component of components) {
		if (component.type === 1 && Array.isArray(component.components)) {
			// ActionRow - check its components
			for (const subComponent of component.components) {
				if (
					subComponent.type === 2 &&
					typeof subComponent.custom_id === 'string'
				) {
					// Button with custom_id
					usedcustom_ids.add(subComponent.custom_id)
				}
			}
		} else if (
			component.type === 2 &&
			typeof component.custom_id === 'string'
		) {
			// Direct button component
			usedcustom_ids.add(component.custom_id)
		}
	}
}

// Enhanced V2 component builder
export function buildV2Components(
	components: AnyComponent[],
	member: GuildMember,
	guild: Discord.Guild,
	additionalPlaceholders: Record<string, string> = {}
): (
	| Discord.APIMessageTopLevelComponent
	| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
)[] {
	let isFirstSection = true
	const validComponents: (
		| Discord.APIMessageTopLevelComponent
		| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
	)[] = []

	for (const component of components) {
		try {
			if (component.type === 9) {
				// Handle section components
				const sectionResult = buildSectionComponent(
					component,
					member,
					guild,
					additionalPlaceholders,
					isFirstSection
				)
				isFirstSection = false

				if (sectionResult) {
					validComponents.push(...sectionResult)
				}
			} else if (component.type === 10 && component.content) {
				// Handle standalone text components as V2 text displays
				const content = applyAllPlaceholders(
					String(component.content),
					member,
					guild,
					additionalPlaceholders
				)
				if (content?.trim()) {
					const textDisplay = V2.makeTextDisplay(content)
					if (textDisplay) {
						validComponents.push(textDisplay)
					}
				}
			} else if (
				component.type === 12 &&
				Array.isArray(component.items) &&
				component.items.length > 0
			) {
				// Handle media gallery components
				const mediaGallery = buildMediaGalleryComponent(
					component,
					member,
					guild,
					additionalPlaceholders
				)
				if (mediaGallery) {
					validComponents.push(mediaGallery)
				}
			} else if (component.type === 14 && isSeparatorComponent(component)) {
				// Handle standalone separators
				const separator = V2.makeSeparator({
					divider: component.divider ?? true,
					spacing: component.spacing ?? 1,
				})
				if (separator) {
					validComponents.push(separator)
				}
			} else if (isActionRowComponent(component)) {
				// Handle action row components (convert to V2 if possible)
				const actionRowResult = buildActionRowComponent()
				if (actionRowResult) {
					validComponents.push(...actionRowResult)
				}
			}
		} catch (error) {
			StatusLogger.error('Failed to process component', error as Error)
			// Continue with next component instead of failing completely
		}
	}

	// Ensure we return at least one component
	if (validComponents.length === 0) {
		const fallbackTextDisplay = V2.makeTextDisplay('Welcome to the server!')
		if (fallbackTextDisplay) {
			validComponents.push(fallbackTextDisplay)
		}
	}

	return validComponents
}

// Helper function to build section components
function buildSectionComponent(
	component: AnyComponent,
	member: GuildMember,
	guild: Discord.Guild,
	additionalPlaceholders: Record<string, string>,
	isFirstSection: boolean
): (
	| Discord.APIMessageTopLevelComponent
	| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
)[] {
	let accessory: ThumbnailBuilder | null = null

	// Handle accessory
	if (component.accessory && isThumbnailAccessory(component.accessory)) {
		const url = applyAllPlaceholders(
			component.accessory.media.url,
			member,
			guild,
			additionalPlaceholders
		)
		if (url?.startsWith('http')) {
			accessory = new ThumbnailBuilder().setURL(url)
		}
	}

	const results: (
		| Discord.APIMessageTopLevelComponent
		| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
	)[] = []

	// Process components in order, creating sections and separators as needed
	if (Array.isArray(component.components) && component.components.length > 0) {
		let currentSectionTexts: string[] = []
		let sectionAccessory = accessory // Use accessory only for first section

		for (const subComponent of component.components) {
			const sub = subComponent as AnyComponent

			if (sub.type === 10 && sub.content) {
				const content = applyAllPlaceholders(
					String(sub.content),
					member,
					guild,
					additionalPlaceholders
				)
				if (content?.trim()) {
					currentSectionTexts.push(content)

					// If we have 3 text displays, create section now
					if (currentSectionTexts.length === 3) {
						const textComponents = currentSectionTexts.map((text) =>
							new TextDisplayBuilder().setContent(text)
						)

						if (sectionAccessory) {
							const section = V2.makeSection(textComponents, sectionAccessory)
							if (section) results.push(section)
						} else {
							// Add as individual text displays
							for (const textComp of textComponents) {
								const textDisplay = V2.makeTextDisplay(textComp.data.content)
								if (textDisplay) results.push(textDisplay)
							}
						}

						currentSectionTexts = []
						sectionAccessory = null // Only first section gets accessory
					}
				}
			} else if (sub.type === 14 && isSeparatorComponent(sub)) {
				// Finish current section if we have pending texts
				if (currentSectionTexts.length > 0) {
					const textComponents = currentSectionTexts.map((text) =>
						new TextDisplayBuilder().setContent(text)
					)

					if (sectionAccessory) {
						const section = V2.makeSection(textComponents, sectionAccessory)
						if (section) results.push(section)
					} else {
						// Add as individual text displays
						for (const textComp of textComponents) {
							const textDisplay = V2.makeTextDisplay(textComp.data.content)
							if (textDisplay) results.push(textDisplay)
						}
					}

					currentSectionTexts = []
					sectionAccessory = null // Only first section gets accessory
				}

				// Add separator
				const separator = V2.makeSeparator({
					divider: sub.divider ?? true,
					spacing: sub.spacing ?? 1,
				})
				if (separator) results.push(separator)
			}
		}

		// Finish any remaining section
		if (currentSectionTexts.length > 0) {
			const textComponents = currentSectionTexts.map((text) =>
				new TextDisplayBuilder().setContent(text)
			)

			if (sectionAccessory) {
				const section = V2.makeSection(textComponents, sectionAccessory)
				if (section) results.push(section)
			} else {
				// Add as individual text displays
				for (const textComp of textComponents) {
					const textDisplay = V2.makeTextDisplay(textComp.data.content)
					if (textDisplay) results.push(textDisplay)
				}
			}
		}
	}

	// Ensure we return at least one component
	if (results.length === 0) {
		const fallbackText = new TextDisplayBuilder().setContent('Welcome!')
		if (accessory) {
			const section = V2.makeSection([fallbackText], accessory)
			if (section) results.push(section)
		} else {
			const textDisplay = V2.makeTextDisplay(fallbackText.data.content)
			if (textDisplay) results.push(textDisplay)
		}
	}

	return results
}

// Helper function to build media gallery components
function buildMediaGalleryComponent(
	component: AnyComponent,
	member: GuildMember,
	guild: Discord.Guild,
	additionalPlaceholders: Record<string, string>
):
	| Discord.APIMessageTopLevelComponent
	| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
	| null {
	const items = component.items
	if (!Array.isArray(items)) return null

	const validItems = items
		.filter(isMediaItemWithUrl)
		.map((item) => {
			const url = applyAllPlaceholders(
				item.media.url,
				member,
				guild,
				additionalPlaceholders
			)
			if (url?.startsWith('http')) {
				return {
					media: {
						url,
						description: item.media.description || 'Image',
					},
				}
			}
			return null
		})
		.filter((item): item is NonNullable<typeof item> => item !== null)

	if (validItems.length > 0) {
		return V2.makeMediaGallery(validItems)
	}

	return null
}

// Helper function to build action row components (legacy support)
function buildActionRowComponent(): (
	| Discord.APIMessageTopLevelComponent
	| Discord.JSONEncodable<Discord.APIMessageTopLevelComponent>
)[] {
	return []
}

// Unified placeholder application function
function applyAllPlaceholders(
	text: string,
	member: GuildMember,
	guild: Discord.Guild,
	additionalPlaceholders: Record<string, string> = {}
): string {
	// First apply the standard placeholders
	let result = replacePlaceholders(text, member, guild)

	// Then apply additional placeholders (like ticket-specific ones)
	for (const [key, value] of Object.entries(additionalPlaceholders)) {
		result = result.replace(new RegExp(`{${key}}`, 'g'), String(value))
	}

	return result
}

// Export types for external use
export type {
	TextComponent,
	SeparatorComponent,
	ThumbnailAccessory,
	MediaGalleryAccessory,
	SectionComponent,
	MediaGalleryComponent,
	ButtonComponent,
	ActionRowComponent,
	ComponentConfig,
	UniversalComponentConfig,
}
