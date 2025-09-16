import * as API from '@/discord/api/index.js'
import { setCorsHeaders } from '@/utils/cors.js'
import { errorHandler } from '@/utils/errorHandler.js'

/**
 * Twitch API Route Handlers
 * Each route is keyed as: "METHOD /twitch/v1/endpoint"
 */
const routes: Record<string, (req: Request) => Promise<Response>> = {
	'GET /twitch/v1/ping': async () => new Response('Pong!', { status: 200 }),

	// Twitch webhook endpoint for stream notifications
	'POST /twitch/v1/webhook': async (
		req: Request
	): Promise<Response> => {
		return await API.handleTwitchWebhook(req)
	},
}

/**
 * Main Twitch API router function.
 * @param req - The request object
 * @returns The response object
 */
export const twitchRouter = async (req: Request): Promise<Response> => {
	const url = new URL(req.url)
	const routeKey = `${req.method.toUpperCase()} ${url.pathname}`

	const handler = routes[routeKey]
	if (handler) return errorHandler(handler)(req)

	return new Response('Not Found', { status: 404, headers: setCorsHeaders() })
}
