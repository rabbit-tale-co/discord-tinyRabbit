import { replacePlaceholders } from '@/utils/replacePlaceholders.js'
import { handleResponse } from '@/utils/responses.js'
import { formatter, hexToNumber } from '@/utils/formatter.js'
import { calculateXpForNextLevel, LevelUpResult } from '@/utils/xpUtils.js'
import { ColorThief } from '@/utils/colorThief.js'

export {
	replacePlaceholders,
	handleResponse,
	formatter,
	hexToNumber,
	calculateXpForNextLevel,
	LevelUpResult,
	ColorThief,
}

export * from './xpUtils.js'
export * from './bunnyLogger.js'
