import * as API from '@/discord/api/index.js'
import { setCorsHeaders } from '@/utils/cors.js'
import { errorHandler } from '@/utils/errorHandler.js'

/**
 * GitHub API Route Handlers
 * Each route is keyed as: "METHOD /github/v1/endpoint"
 */
const routes: Record<string, (req: Request) => Promise<Response>> = {
	'GET /github/v1/ping': async () => new Response('Pong!', { status: 200 }),

	// GitHub Sponsors webhook endpoint
	'POST /github/v1/sponsors': async (
		req: Request
	): Promise<Response> => {
		return await API.handleGitHubSponsorsWebhook(req)
	},
}

/**
 * Main GitHub API router function.
 * @param req - The request object
 * @returns The response object
 */
export const githubRouter = async (req: Request): Promise<Response> => {
	const url = new URL(req.url)
	const routeKey = `${req.method.toUpperCase()} ${url.pathname}`

	const handler = routes[routeKey]
	if (handler) return errorHandler(handler)(req)

	return new Response('Not Found', { status: 404, headers: setCorsHeaders() })
}
