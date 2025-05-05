export interface UserBalance {
	user_id: string
	guild_id: string
	amount: number
	created_at: string
	updated_at: string
}

export interface Currency {
	guild_id: string
	name: string
	symbol: string
	emoji: string
	is_custom_emoji: boolean
}

export interface CurrencyMultiplier {
	guild_id: string
	multiplier_type: 'role' | 'channel' | 'global'
	multiplier: number
	conditions: {
		role_id?: string
		channel_id?: string
	}
}

export interface CurrencyTransaction {
	bot_id: string
	guild_id: string
	user_id: string
	amount: number
	type: 'add' | 'remove' | 'transfer'
	reason: string
	created_at: string
}

export interface CurrencyBalance {
	bot_id: string
	guild_id: string
	user_id: string
	amount: number
	created_at: string
	updated_at: string
}

export interface EconomyConfig {
	enabled: boolean
	currency_name: string
	currency_symbol: string
	currency_emoji: string
	is_custom_emoji: boolean
	starting_balance: number
	multipliers: {
		enabled: boolean
		default: number
		roles: Array<{
			role_id: string
			multiplier: number
		}>
	}
	leaderboard: {
		enabled: boolean
		channel_id: string | null
		update_interval: number
		top_count: number
	}
}
