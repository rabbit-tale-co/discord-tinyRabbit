import { registerFont } from 'canvas'
import path from 'path'

// Font configuration for Geist fonts
const FONT_CONFIG = {
	regular: './src/assets/fonts/Geist-Regular.otf',
	bold: './src/assets/fonts/Geist-Bold.otf',
	medium: './src/assets/fonts/Geist-Medium.otf',
	semiBold: './src/assets/fonts/Geist-SemiBold.otf',
	light: './src/assets/fonts/Geist-Light.otf',
	thin: './src/assets/fonts/Geist-Thin.otf',
	extraBold: './src/assets/fonts/Geist-ExtraBold.otf',
	black: './src/assets/fonts/Geist-Black.otf',
}

/**
 * Register all Geist fonts with canvas
 */
export function registerGeistFonts() {
	const registeredFonts = []

	for (const [weight, fontPath] of Object.entries(FONT_CONFIG)) {
		try {
			// Register each font weight with a unique family name
			const familyName = `Geist-${weight.charAt(0).toUpperCase() + weight.slice(1)}`
			registerFont(fontPath, { family: familyName })
			registeredFonts.push(familyName)
			console.log(`[FontSetup] Registered: ${familyName}`)
		} catch (error) {
			console.warn(
				`[FontSetup] Failed to register ${weight}: ${fontPath}`,
				error
			)
		}
	}

	return registeredFonts
}

/**
 * Get font family string with fallbacks
 * @param weight - Font weight (regular, bold, medium, etc.)
 * @returns Font family string with fallbacks
 */
export function getFontFamily(weight: string = 'regular'): string {
	const weightMap: Record<string, string> = {
		regular: 'Geist-Regular',
		bold: 'Geist-Bold',
		medium: 'Geist-Medium',
		semiBold: 'Geist-SemiBold',
		light: 'Geist-Light',
		thin: 'Geist-Thin',
		extraBold: 'Geist-ExtraBold',
		black: 'Geist-Black',
	}

	const primaryFont = weightMap[weight] || 'Geist-Regular'
	return `"${primaryFont}", "Geist", "Inter", sans-serif`
}

/**
 * Register a single font
 * @param fontPath - Path to font file
 * @param familyName - Font family name
 */
export function registerSingleFont(
	fontPath: string,
	familyName: string
): boolean {
	try {
		registerFont(fontPath, { family: familyName })
		console.log(`[FontSetup] Registered: ${familyName}`)
		return true
	} catch (error) {
		console.warn(
			`[FontSetup] Failed to register ${familyName}: ${fontPath}`,
			error
		)
		return false
	}
}
