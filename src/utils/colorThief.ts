import Jimp from 'jimp'

/**
 * Fetches the dominant color from an image provided as a URL.
 * @param {string} imageUrl - The URL of the image.
 * @returns {Promise<string>} - The dominant color in HEX format.
 */
async function getDominantColor(imageUrl: string): Promise<string> {
	try {
		const image = await Jimp.read(imageUrl)
		const colorCounts = new Map<string, number>()
		const { width, height } = image.bitmap

		if (width === 0 || height === 0) {
			throw new Error('Image dimensions are invalid')
		}

		// Count occurrences of each color in the image
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const { r, g, b } = Jimp.intToRGBA(image.getPixelColor(x, y))
				const hexColor = rgbToHex(r, g, b)

				colorCounts.set(hexColor, (colorCounts.get(hexColor) || 0) + 1)
			}
		}

		// Find the color with the highest count
		let dominantColor = ''
		let maxCount = 0
		for (const [color, count] of colorCounts) {
			if (count > maxCount) {
				maxCount = count
				dominantColor = color
			}
		}

		return dominantColor
	} catch (error) {
		throw new Error(`Error fetching the dominant color: ${error.message}`)
	}
}

/**
 * Converts RGB values to HEX format.
 * @param {number} r - The red value (0-255).
 * @param {number} g - The green value (0-255).
 * @param {number} b - The blue value (0-255).
 * @returns {string} - The color in HEX format.
 */
function rgbToHex(r: number, g: number, b: number): string {
	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`
}

export { getDominantColor }
