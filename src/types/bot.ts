interface bot {
	bot_name: string
	bot_token: string
	bot_owner: BotOwner
	bot_guilds: BotGuild[]
}

type BotOwner = {
	id: string
	email: string
	has_premium: boolean
	premium_expire: string | null
}

type BotGuild = {
	id: string
	name: string
}

export type { bot, BotOwner, BotGuild }
