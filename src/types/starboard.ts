import type { Snowflake } from 'discord.js'

interface StarboardEntry {
	starboard_message_id: Snowflake
	star_count: number
	original_message_id: Snowflake
}

export type { StarboardEntry }
