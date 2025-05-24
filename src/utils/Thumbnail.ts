import type {
	APIThumbnailComponent,
	APIUnfurledMediaItem,
	Snowflake,
} from "discord.js";
import { ComponentType } from "discord.js";

/**
 * A class for creating a thumbnail component compatible with ThumbnailBuilder
 */
export class V2Thumbnail {
	private id?: number;
	private media: APIUnfurledMediaItem;
	private description?: Snowflake;
	private spoiler?: boolean;
	private readonly type = ComponentType.Thumbnail;

	/**
	 * The API data associated with this component.
	 */
	public get data(): Partial<APIThumbnailComponent> {
		return {
			type: this.type,
			media: this.media,
			...(this.id !== undefined && { id: this.id }),
			...(this.description !== undefined && { description: this.description }),
			...(this.spoiler !== undefined && { spoiler: this.spoiler }),
		};
	}

	/**
	 * Create a new thumbnail component
	 * @param media - The media item to display
	 */
	constructor(media: APIUnfurledMediaItem) {
		this.media = media;
	}

	/**
	 * Set the ID of the thumbnail
	 * @param id - The numeric ID
	 * @returns The thumbnail instance
	 */
	setId(id: number) {
		this.id = id;
		return this;
	}

	/**
	 * Clears the id of this component, defaulting to a default incremented id.
	 * @returns The thumbnail instance
	 */
	clearId() {
		this.id = undefined;
		return this;
	}

	/**
	 * Set the description of the thumbnail
	 * @param description - The text description
	 * @returns The thumbnail instance
	 */
	setDescription(description: string) {
		this.description = description;
		return this;
	}

	/**
	 * Clears the description of this thumbnail.
	 * @returns The thumbnail instance
	 */
	clearDescription() {
		this.description = undefined;
		return this;
	}

	/**
	 * Set whether the thumbnail should be marked as a spoiler
	 * @param spoiler - Whether to mark as spoiler
	 * @returns The thumbnail instance
	 */
	setSpoiler(spoiler: boolean) {
		this.spoiler = spoiler;
		return this;
	}

	/**
	 * Set the media URL of this thumbnail
	 * @param url - The URL to display
	 * @returns The thumbnail instance
	 */
	setURL(url: string) {
		this.media = {
			...this.media,
			url,
		};
		return this;
	}

	/**
	 * Set the media for the thumbnail
	 * @param media - The media item to display
	 * @returns The thumbnail instance
	 */
	setThumbnail(media: APIUnfurledMediaItem) {
		this.media = media;
		return this;
	}

	/**
	 * Convert the thumbnail to a JSON object
	 * @returns The JSON representation of the thumbnail
	 */
	toJSON(): APIThumbnailComponent {
		return {
			type: this.type,
			media: this.media,
			...(this.id !== undefined && { id: this.id }),
			...(this.description !== undefined && { description: this.description }),
			...(this.spoiler !== undefined && { spoiler: this.spoiler }),
		};
	}
}

/**
 * Helper function to create a thumbnail component
 * @param url - The URL of the image to display
 * @param options - Optional configuration for the thumbnail
 * @returns A thumbnail component ready to use in sections
 *
 * @example
 * ```typescript
 * // Simple thumbnail
 * const thumb = makeThumbnail("https://example.com/image.png");
 *
 * // With description and spoiler
 * const thumb = makeThumbnail("https://example.com/image.png", {
 *   description: "Cool image",
 *   spoiler: true,
 *   id: 123
 * });
 *
 * // Use in a section
 * const section = makeSection(
 *   ["Title", "Description"],
 *   makeThumbnail("https://example.com/image.png")
 * );
 * ```
 */
export function makeThumbnail(
	url: Snowflake,
	options?: {
		description?: Snowflake;
		spoiler?: boolean;
		id?: number;
		width?: number;
		height?: number;
	},
): V2Thumbnail {
	const media = {
		url,
		width: options?.width ?? 0,
		height: options?.height ?? 0,
	};

	const thumbnail = new V2Thumbnail(media);

	if (options?.description) thumbnail.setDescription(options.description);
	if (options?.spoiler) thumbnail.setSpoiler(options.spoiler);
	if (options?.id) thumbnail.setId(options.id);

	return thumbnail;
}
