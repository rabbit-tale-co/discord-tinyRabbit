import type * as Levels from '@/types/levels.js'

const XP_PER_LEVEL = 3_000
const XP_PER_MESSAGE = 150

// Enum for level up results
export enum LevelUpResult {
	NoChange = 'NoChange',
	LevelUp = 'LevelUp',
	LevelDown = 'LevelDown',
}

// Cache for calculateXpForNextLevel results
const xpForNextLevelCache: Map<number, number> = new Map()

/**
 * Calculates the XP needed to reach the next level.
 * @param {number} level - The current level.
 * @returns {number} XP required to reach the next level.
 */
function calculateXpForNextLevel(level: number): number {
	// Check if the level is a valid number and greater than 0
	if (Number.isNaN(level) || level < 0) {
		throw new Error('Invalid level value')
	}

	// Check if the level is cached
	const cachedXp = xpForNextLevelCache.get(level)

	// If the level is cached, return the cached value
	if (cachedXp !== undefined) {
		return cachedXp
	}

	// Calculate the XP for the next level
	const xpForNextLevel = (level + 1) * XP_PER_LEVEL

	// Cache the XP for the next level
	xpForNextLevelCache.set(level, xpForNextLevel)

	// Return the XP for the next level
	return xpForNextLevel
}

/**
 * Updates user XP and levels based on message content or direct XP setting.
 * @param {object} data - The user data object containing XP and level.
 * @param {number} new_xp - The new XP value, if setting directly.
 * @param {number} boost_multiplier - The boost multiplier value, if setting directly.
 * @param is_direct_set - Flag indicating if the XP is being set directly (e.g., setxp command).
 * @param {Level | null} original_data - The original user data for comparison.
 * @returns {LevelStatus} Updated user data, including levelUp and levelDown flags.
 */
function updateUserXpAndLevel(
	data: Levels.Level,
	new_xp: number,
	boost_multiplier: number,
	is_direct_set = false,
	original_data: Levels.Level | null = null
): Levels.LevelStatus {
	// Initialize properties
	data.xp = data.xp ?? 0
	data.level = data.level ?? 0

	// Get the previous level
	const previous_level = (original_data?.level ?? 0) || (data.level ?? 0)

	// Update the XP
	data.xp = is_direct_set
		? new_xp
		: data.xp + XP_PER_MESSAGE * boost_multiplier + (new_xp || 0)

	// Calculate the XP for the next level
	let xpForNextLevel = calculateXpForNextLevel(data.level)

	// Level up
	while (data.xp >= xpForNextLevel) {
		data.xp -= xpForNextLevel
		data.level++
		xpForNextLevel = calculateXpForNextLevel(data.level)
	}

	// Level down
	while (data.xp < 0 && data.level > 0) {
		data.level--
		data.xp += calculateXpForNextLevel(data.level)
	}

	// Set XP to 0 if level is 0 and XP is less than 0
	if (data.level === 0 && data.xp < 0) data.xp = 0

	// Determine the level change status
	const levelChangeStatus =
		data.level > previous_level
			? LevelUpResult.LevelUp
			: data.level < previous_level
				? LevelUpResult.LevelDown
				: LevelUpResult.NoChange

	// Return the updated user data
	return { ...data, levelChangeStatus }
}

/**
 * Calculates the total XP for a specific level.
 * @param {number} level - The level to calculate total XP for.
 * @returns {number} Total XP for the given level.
 */
export function calculateTotalXpForLevel(level: number): number {
	return level * XP_PER_LEVEL
}

/**
 * Calculates the level and remaining XP from total XP.
 * @param {number} total_xp - The total XP.
 * @returns {Levels.Level} The level and remaining XP.
 */
function calculateLevelAndXpFromTotalXp(total_xp: number): Levels.Level {
	let level = 0
	let xp = total_xp

	// Calculate the level and remaining XP
	while (xp >= calculateXpForNextLevel(level)) {
		xp -= calculateXpForNextLevel(level)
		level++
	}

	// Return the level and remaining XP
	return { level, xp }
}

export {
	calculateXpForNextLevel,
	calculateLevelAndXpFromTotalXp,
	updateUserXpAndLevel,
	XP_PER_MESSAGE,
}
