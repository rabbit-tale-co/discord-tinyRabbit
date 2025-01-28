import Jimp from 'jimp'

/**
 * Fetches the dominant color from an image provided as a URL.
 * @param {string} image_url - The URL of the image.
 * @returns {Promise<string>} - The dominant color in HEX format.
 */
async function getDominantColor(image_url: string): Promise<string> {
	try {
		// Read the image from the URL
		const image = await Jimp.read(image_url)
		const colorCounts = new Map<string, number>()
		const { width, height } = image.bitmap

		// Check if the image dimensions are valid
		if (width === 0 || height === 0) {
			throw new Error('Image dimensions are invalid')
		}

		// Count occurrences of each color in the image
		for (let y = 0; y < height; y++) {
			// Iterate over each pixel in the image
			for (let x = 0; x < width; x++) {
				// Get the RGB values of the pixel
				const { r, g, b } = Jimp.intToRGBA(image.getPixelColor(x, y))
				// Convert the RGB values to a hex color code
				const hexColor = rgbToHex(r, g, b)
				// Increment the count for the color
				colorCounts.set(hexColor, (colorCounts.get(hexColor) || 0) + 1)
			}
		}

		// Find the color with the highest count
		let dominantColor = ''
		let maxCount = 0

		// Iterate over each color and its count
		for (const [color, count] of colorCounts) {
			// Check if the current color has a higher count than the previous max
			if (count > maxCount) {
				// Update the max count and dominant color
				maxCount = count
				dominantColor = color
			}
		}

		// Return the dominant color
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
