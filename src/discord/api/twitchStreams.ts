import { APILogger, StatusLogger } from '@/utils/bunnyLogger.js'
import { TwitchService } from '@/discord/services/twitchService.js'
import supabase from '@/db/supabase.js'

interface TwitchStream {
	id: string
	user_id: string
	user_login: string
	user_name: string
	game_id: string
	game_name: string
	type: string
	title: string
	viewer_count: number
	started_at: string
	language: string
	thumbnail_url: string
	tag_ids: string[]
	is_mature: boolean
}

interface TwitchUser {
	id: string
	login: string
	display_name: string
	type: string
	broadcaster_type: string
	description: string
	profile_image_url: string
	offline_image_url: string
	view_count: number
	created_at: string
}

interface TwitchTokenResponse {
	access_token: string
	expires_in: number
	token_type: string
}

interface TwitchStreamsResponse {
	data: TwitchStream[]
	pagination?: {
		cursor?: string
	}
}

interface TwitchUsersResponse {
	data: TwitchUser[]
}

class TwitchAPI {
	private clientId: string
	private clientSecret: string
	private accessToken: string | null = null
	private tokenExpiry: number = 0

	constructor() {
		this.clientId = process.env.TWITCH_CLIENT_ID || ''
		this.clientSecret = process.env.TWITCH_CLIENT_SECRET || ''

		if (!this.clientId || !this.clientSecret) {
			APILogger.error('Twitch API credentials not configured')
		}
	}

	private async getAccessToken(): Promise<string | null> {
		if (this.accessToken && Date.now() < this.tokenExpiry) {
			return this.accessToken
		}

		try {
			const response = await fetch('https://id.twitch.tv/oauth2/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					client_id: this.clientId,
					client_secret: this.clientSecret,
					grant_type: 'client_credentials',
				}),
			})

			if (!response.ok) {
				APILogger.error(`Failed to get Twitch access token: ${response.status}`)
				return null
			}

			const data: TwitchTokenResponse = await response.json()
			this.accessToken = data.access_token
			this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000 // 1 minute buffer

			return this.accessToken
		} catch (error) {
			APILogger.error('Error getting Twitch access token:', error)
			return null
		}
	}

	async getStreamsByUserIds(userIds: string[]): Promise<TwitchStream[]> {
		const token = await this.getAccessToken()
		if (!token) {
			return []
		}

		try {
			const params = new URLSearchParams({
				user_id: userIds.join('&user_id='),
				first: '100', // Max 100 streams per request
			})

			const response = await fetch(`https://api.twitch.tv/helix/streams?${params}`, {
				headers: {
					'Client-ID': this.clientId,
					'Authorization': `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				APILogger.error(`Failed to get Twitch streams: ${response.status}`)
				return []
			}

			const data: TwitchStreamsResponse = await response.json()
			return data.data || []
		} catch (error) {
			APILogger.error('Error fetching Twitch streams:', error)
			return []
		}
	}

	async getUserByLogin(login: string): Promise<TwitchUser | null> {
		const token = await this.getAccessToken()
		if (!token) {
			return null
		}

		try {
			const response = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
				headers: {
					'Client-ID': this.clientId,
					'Authorization': `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				APILogger.error(`Failed to get Twitch user: ${response.status}`)
				return null
			}

			const data: TwitchUsersResponse = await response.json()
			return data.data?.[0] || null
		} catch (error) {
			APILogger.error('Error fetching Twitch user:', error)
			return null
		}
	}

	async getUsersByLogins(logins: string[]): Promise<TwitchUser[]> {
		const token = await this.getAccessToken()
		if (!token) {
			return []
		}

		try {
			const params = new URLSearchParams({
				login: logins.join('&login='),
			})

			const response = await fetch(`https://api.twitch.tv/helix/users?${params}`, {
				headers: {
					'Client-ID': this.clientId,
					'Authorization': `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				APILogger.error(`Failed to get Twitch users: ${response.status}`)
				return []
			}

			const data: TwitchUsersResponse = await response.json()
			return data.data || []
		} catch (error) {
			APILogger.error('Error fetching Twitch users:', error)
			return []
		}
	}
}

const twitchAPI = new TwitchAPI()

export async function checkTwitchStreams(
	botId: string,
	guildId: string
): Promise<void> {
	try {
		// Get all users with linked Twitch accounts
		const { data: socialUsers, error } = await supabase
			.from('user_socials')
			.select('user_id, twitch_id')
			.eq('bot_id', botId)
			.eq('guild_id', guildId)
			.not('twitch_id', 'is', null)

		if (error) {
			APILogger.error('Error fetching Twitch users:', error.message)
			return
		}

		if (!socialUsers || socialUsers.length === 0) {
			return
		}

		// Get Twitch user IDs
		const twitchUserIds = socialUsers.map(user => user.twitch_id).filter(Boolean)
		if (twitchUserIds.length === 0) {
			return
		}

		// Get current streams
		const streams = await twitchAPI.getStreamsByUserIds(twitchUserIds)
		if (streams.length === 0) {
			return
		}

		// Delegate to service layer for notifications
		await TwitchService.processStreamEvents(streams)

	} catch (error) {
		APILogger.error('Error checking Twitch streams:', error)
	}
}


export { twitchAPI, type TwitchStream, type TwitchUser }
