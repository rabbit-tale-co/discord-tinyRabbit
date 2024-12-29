import type { User } from 'discord.js'

interface LeaderboardEntry {
	user_id: User['id']
	xp: number
	level: number
}

interface LeaderboardUser {
	user: {
		id: User['id']
		username: User['username']
		global_name: User['globalName']
		avatar: User['avatar']
	}
	xp: number
}

interface Leaderboard {
	user: LeaderboardUser
	totalUsers: number
	totalXp: number
}

export type { LeaderboardEntry, Leaderboard, LeaderboardUser }
