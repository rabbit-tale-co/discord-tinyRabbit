import { createCanvas, type Canvas } from '@napi-rs/canvas'

/**
 * Converts an emoji to a 512x512 square canvas image
 * @param emoji The emoji to convert (e.g. '🎫', '✅', '❌')
 * @returns Canvas with the emoji rendered at 512x512
 */
export function emojiToImage(emoji: string): Canvas {
	// Create a 72x72 canvas (standard Discord emoji size)
	const canvas = createCanvas(72, 72)
	const ctx = canvas.getContext('2d')

	// Set white background
	ctx.fillStyle = '#36393f' // Discord dark theme background color
	ctx.fillRect(0, 0, 72, 72)

	// Set font size to fit the canvas while keeping some padding
	const fontSize = 50 // This leaves some padding around the emoji
	ctx.font = `${fontSize}px Segoe UI Emoji` // Use a font that supports emojis well
	ctx.textAlign = 'center'
	ctx.textBaseline = 'middle'

	// Calculate center position
	const centerX = canvas.width / 2
	const centerY = canvas.height / 2

	// Draw the emoji centered on the canvas
	ctx.fillStyle = 'white' // Set text color to white
	ctx.fillText(emoji, centerX, centerY)

	return canvas
}

/**
 * Converts an emoji to a data URL that can be used with Discord's ThumbnailBuilder
 * @param emoji The emoji to convert
 * @returns Promise resolving to a base64 data URL
 */
export async function emojiToURL(emoji: string): Promise<string> {
	const canvas = emojiToImage(emoji)
	const buffer = await canvas.encode('png')
	return `data:image/png;base64,${buffer.toString('base64')}`
}

/**
 * Converts an emoji to a Buffer that can be used for file uploads
 * @param emoji The emoji to convert
 * @returns Promise resolving to a Buffer containing the PNG image data
 */
export async function emojiToBuffer(emoji: string): Promise<Buffer> {
	const canvas = emojiToImage(emoji)
	return canvas.encode('png')
}
