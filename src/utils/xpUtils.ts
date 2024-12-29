import type { Level, LevelStatus } from '../types/levels'

const XP_PER_LEVEL = 3_000
const XP_PER_MESSAGE = 150

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
/**
 * Calculates the XP needed to reach the next level.
 * @param {number} level - The current level.
 * @returns {number} XP required to reach the next level.
 */
function calculateXpForNextLevel(level: number): number {
	if (Number.isNaN(level) || level < 0) {
		throw new Error('Invalid level value')
	}

	const cachedXp = xpForNextLevelCache.get(level)
	if (cachedXp !== undefined) {
		return cachedXp
	}

	const xpForNextLevel = (level + 1) * XP_PER_LEVEL
	xpForNextLevelCache.set(level, xpForNextLevel)
	return xpForNextLevel
}

/**
 * Updates user XP and levels based on message content or direct XP setting.
 * @param {object} data - The user data object containing XP and level.
 * @param {number} newXp - The new XP value, if setting directly.
 * @param {number} boost_multiplier - The boost multiplier value, if setting directly.
 * @param isDirectSet - Flag indicating if the XP is being set directly (e.g., setxp command).
 * @param {Level | null} originalData - The original user data for comparison.
 * @returns {LevelStatus} Updated user data, including levelUp and levelDown flags.
 */
function updateUserXpAndLevel(
	data: Level,
	newXp: number,
	boost_multiplier: number,
	isDirectSet = false,
	originalData: Level | null = null
): LevelStatus {
	const previousLevel = originalData ? originalData.level : data.level

	data.xp = isDirectSet
		? newXp
		: data.xp + XP_PER_MESSAGE * boost_multiplier + (newXp || 0)

	let xpForNextLevel = calculateXpForNextLevel(data.level)

	while (data.xp >= xpForNextLevel) {
		data.xp -= xpForNextLevel
		data.level++
		xpForNextLevel = calculateXpForNextLevel(data.level)
	}

	while (data.xp < 0 && data.level > 0) {
		data.level--
		data.xp += calculateXpForNextLevel(data.level)
	}

	if (data.level === 0 && data.xp < 0) data.xp = 0

	const levelChangeStatus =
		data.level > previousLevel
			? LevelUpResult.LevelUp
			: data.level < previousLevel
				? LevelUpResult.LevelDown
				: LevelUpResult.NoChange

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
 * @param {number} totalXp - The total XP.
 * @returns {Level} The level and remaining XP.
 */
function calculateLevelAndXpFromTotalXp(totalXp: number): Level {
	let level = 0
	let xp = totalXp

	while (xp >= calculateXpForNextLevel(level)) {
		xp -= calculateXpForNextLevel(level)
		level++
	}

	return { level, xp }
}

export {
	calculateXpForNextLevel,
	calculateLevelAndXpFromTotalXp,
	updateUserXpAndLevel,
	XP_PER_MESSAGE,
}
