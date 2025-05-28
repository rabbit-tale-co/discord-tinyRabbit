import * as Jimp from 'jimp'

export class ColorThief {
	/**
	 * Fetches the dominant color from an image provided as a URL.
	 * @param image_url - The URL of the image.
	 * @returns The dominant color in HEX format.
	 */
	public async getDominantColor(image_url: string): Promise<string> {
		try {
			const image = await Jimp.read(image_url)
			const colorCounts = new Map<string, number>()
			const { width, height } = image.bitmap

			if (width === 0 || height === 0) {
				throw new Error('Image dimensions are invalid')
			}

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const { r, g, b } = Jimp.intToRGBA(image.getPixelColor(x, y))
					const hexColor = this.rgbToHex(r, g, b)
					colorCounts.set(hexColor, (colorCounts.get(hexColor) || 0) + 1)
				}
			}

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
	 * @param r - The red value (0-255).
	 * @param g - The green value (0-255).
	 * @param b - The blue value (0-255).
	 * @returns The color in HEX format.
	 */
	private rgbToHex(r: number, g: number, b: number): string {
		return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`
	}
}

// Example usage:
// const colorThief = new ColorThief();
// const color = await colorThief.getDominantColor('https://example.com/image.jpg');
