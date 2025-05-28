import { discordRouter } from './discord.js'
import { clickerRouter } from './clicker.js'
import { setCorsHeaders } from '../utils/cors.js'

export const mainRouter = async (req: Request): Promise<Response> => {
	const url = new URL(req.url)
	const path = url.pathname

	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: setCorsHeaders() })
	}

	// Dispatch by project
	if (path.startsWith('/discord')) return await discordRouter(req)
	if (path.startsWith('/clicker')) return await clickerRouter(req)

	return new Response('Not Found', { status: 404, headers: setCorsHeaders() })
}
