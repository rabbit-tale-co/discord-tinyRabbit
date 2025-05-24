import type * as Discord from 'discord.js'
import type { GuildMember } from 'discord.js'
import { ButtonStyle } from 'discord.js'
import { replacePlaceholders } from '@/utils/replacePlaceholders.js'
import * as V2 from 'discord-components-v2'
import { TextDisplayBuilder, ThumbnailBuilder } from 'discord.js'

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

type ComponentConfig =
	| SectionComponent
	| TextComponent
	| MediaGalleryComponent
	| SeparatorComponent

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

// Main builder function
export function buildV2Components(
	components: ComponentConfig[],
	member: GuildMember,
	guild: Discord.Guild
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
				let accessory: ThumbnailBuilder | null = null

				// Only add accessory if explicitly defined in database
				if (component.accessory && isThumbnailAccessory(component.accessory)) {
					const url = replacePlaceholders(
						component.accessory.media.url,
						member,
						guild
					)
					if (url?.startsWith('http')) {
						accessory = new ThumbnailBuilder().setURL(url)
					}
				} else if (isFirstSection) {
					// Only the first section gets the user avatar by default
					const avatarUrl = member.user.displayAvatarURL({
						extension: 'png',
						size: 1024,
					})
					if (avatarUrl) {
						accessory = new ThumbnailBuilder().setURL(avatarUrl)
					}
				}
				isFirstSection = false

				// Process nested components
				const textComponents: TextDisplayBuilder[] = []
				if (component.components && component.components.length > 0) {
					for (const subComponent of component.components) {
						if (subComponent.type === 10 && subComponent.content) {
							const content = replacePlaceholders(
								subComponent.content,
								member,
								guild
							)
							if (content?.trim()) {
								textComponents.push(
									new TextDisplayBuilder().setContent(content)
								)
							}
						} else if (
							subComponent.type === 14 &&
							isSeparatorComponent(subComponent)
						) {
							// Convert separator to newlines
							const spacing = Math.min(subComponent.spacing ?? 1, 3)
							const separatorText = '\n'.repeat(spacing)
							if (separatorText) {
								textComponents.push(
									new TextDisplayBuilder().setContent(separatorText)
								)
							}
						}
					}
				}

				// Ensure we have at least one text component
				if (textComponents.length === 0) {
					textComponents.push(new TextDisplayBuilder().setContent('Welcome!'))
				}

				// Only create section if we have a valid accessory
				if (accessory) {
					const section = V2.makeSection(textComponents, accessory)
					if (section) {
						validComponents.push(section)
					}
				} else {
					// Add text components directly as V2 text displays
					for (const textComponent of textComponents) {
						const textDisplay = V2.makeTextDisplay(textComponent.data.content)
						if (textDisplay) {
							validComponents.push(textDisplay)
						}
					}
				}
			} else if (component.type === 10 && component.content) {
				// Handle standalone text components as V2 text displays
				const content = replacePlaceholders(component.content, member, guild)
				if (content?.trim()) {
					const textDisplay = V2.makeTextDisplay(content)
					if (textDisplay) {
						validComponents.push(textDisplay)
					}
				}
			} else if (component.type === 12 && component.items?.length > 0) {
				// Handle media gallery components
				const validItems = component.items
					.filter(isMediaItemWithUrl)
					.map((item) => {
						const url = replacePlaceholders(item.media.url, member, guild)
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
					const mediaGallery = V2.makeMediaGallery(validItems)
					if (mediaGallery) {
						validComponents.push(mediaGallery)
					}
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
			}
		} catch (error) {
			console.error('Error processing component:', error, component)
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

// Export types for external use
export type {
	TextComponent,
	SeparatorComponent,
	ThumbnailAccessory,
	MediaGalleryAccessory,
	SectionComponent,
	MediaGalleryComponent,
	ComponentConfig,
}
