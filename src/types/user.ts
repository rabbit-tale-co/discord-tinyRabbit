import type {
	HexColorString,
	Snowflake,
	UserFlags,
	UserPremiumType,
} from 'discord.js'

interface UserData {
	id: Snowflake
	username: string
	discriminator: string
	global_name?: string
	avatar?: string
	bot?: boolean
	system?: boolean
	mfa_enabled?: boolean
	banner?: string
	accent_color?: HexColorString
	locate?: string
	verified?: boolean
	email?: string
	flags?: UserFlags
	premium_type?: UserPremiumType
	public_flags?: UserFlags
	avatar_decoration_data?: {
		asset: string
		sku_id: Snowflake
	}
}

export type { UserData }


// import type { LevelUpResult } from '../utils/xpUtils'

// interface UserData {
//     xp: number
//     level: number
// }

// interface UpdatedUserData extends UserData {
// 	levelChangeStatus: LevelUpResult
// }

// export type { UserData, UpdatedUserData }
