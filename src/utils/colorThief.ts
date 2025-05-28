import { extractColors } from 'extract-colors'
import getPixels from 'get-pixels'
import { promisify } from 'node:util'

const getPixelsAsync = promisify(getPixels)

export class ColorThief {
	/**
	 * Fetches the dominant color from an image provided as a URL.
	 * @param image_url - The URL of the image.
	 * @returns The dominant color in HEX format.
	 */
	public async getDominantColor(image_url: string): Promise<string> {
		try {
			const pixels = await getPixelsAsync(image_url)
			const data = [...pixels.data]
			const [width, height] = pixels.shape

			const colors = await extractColors({ data, width, height })
			if (colors.length === 0) {
				throw new Error('No colors could be extracted from the image')
			}
			// Return the hex of the most dominant color (first in array)
			return colors[0].hex.toUpperCase()
		} catch (error) {
			throw new Error(`Error fetching the dominant color: ${error.message}`)
		}
	}
}

// Example usage:
// const colorThief = new ColorThief();
// const color = await colorThief.getDominantColor('https://example.com/image.jpg');
