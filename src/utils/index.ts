import { replacePlaceholders } from '@/utils/replacePlaceholders.js'
import { handleResponse } from '@/utils/responses.js'
import { formatter, hexToNumber } from '@/utils/formatter.js'
import { calculateXpForNextLevel, LevelUpResult } from '@/utils/xpUtils.js'
import { getDominantColor } from '@/utils/colorThief.js'

export {
	replacePlaceholders,
	handleResponse,
	formatter,
	hexToNumber,
	calculateXpForNextLevel,
	LevelUpResult,
	getDominantColor,
}

export * from './xpUtils.js'
