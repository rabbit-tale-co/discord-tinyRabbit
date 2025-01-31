/**
 * Format a number
 * @param number - The number to format
 * @returns The formatted number
 */
const formatter = new Intl.NumberFormat()

/**
 * Convert a hex color code to a number
 * @param hex - The hex color code
 * @returns The number
 */
const hexToNumber = (hex: string) => Number.parseInt(hex.replace('#', ''), 16)

export { formatter, hexToNumber }
