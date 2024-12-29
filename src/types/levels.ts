import type { LevelUpResult } from '../utils/xpUtils'

interface Level {
	xp?: number
	level?: number
	status?: 'not found' | 'error'
}

interface LevelStatus extends Level {
	levelChangeStatus: LevelUpResult
}

export type { Level, LevelStatus }
