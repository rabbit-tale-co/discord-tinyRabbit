import { APILogger, StatusLogger } from '@/utils/bunnyLogger.js'
import { TwitchService } from '@/discord/services/twitchService.js'

interface TwitchWebhookChallenge {
	hub: {
		mode: 'subscribe' | 'unsubscribe'
		topic: string
		callback: string
		lease_seconds: number
	}
	challenge: string
}

interface TwitchStreamEvent {
	data: Array<{
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
	}>
}

/**
 * Handle Twitch webhook events for stream notifications
 * @param {Request} req - The incoming request
 * @returns {Promise<Response>} - The response
 */
export async function handleTwitchWebhook(req: Request): Promise<Response> {
	try {
		const body = await req.text()
		const contentType = req.headers.get('content-type') || ''

		// Handle webhook verification challenge
		if (contentType.includes('application/x-www-form-urlencoded')) {
			const params = new URLSearchParams(body)
			const mode = params.get('hub.mode')
			const challenge = params.get('hub.challenge')
			const topic = params.get('hub.topic')

			if (mode === 'subscribe' && challenge) {
				APILogger.info(`Twitch webhook challenge received for topic: ${topic}`)
				return new Response(challenge, { status: 200 })
			}

			if (mode === 'unsubscribe') {
				APILogger.info(`Twitch webhook unsubscribed from topic: ${topic}`)
				return new Response('OK', { status: 200 })
			}
		}

		// Handle stream events
		if (contentType.includes('application/json')) {
			const data: TwitchStreamEvent = JSON.parse(body)

			if (data.data && data.data.length > 0) {
				// Delegate to service layer for processing
				await TwitchService.processStreamEvents(data.data)
			}
		}

		return new Response('OK', { status: 200 })
	} catch (error) {
		APILogger.error('Error handling Twitch webhook:', error)
		return new Response('Internal server error', { status: 500 })
	}
}


export async function createTwitchWebhookSubscription(
	botId: string,
	guildId: string,
	webhookUrl: string
): Promise<boolean> {
	try {
		// This would typically involve calling Twitch's webhook subscription API
		// For now, we'll just log the webhook creation
		APILogger.info(`Twitch webhook subscription created for guild ${guildId}: ${webhookUrl}`)
		return true
	} catch (error) {
		APILogger.error('Error creating Twitch webhook subscription:', error)
		return false
	}
}
