import type { LevelUpResult } from '@/utils/xpUtils.js'

interface Level {
	xp?: number
	level?: number
	status?: 'not found' | 'error'
}

interface LevelStatus extends Level {
	levelChangeStatus: LevelUpResult
}

export type { Level, LevelStatus }
