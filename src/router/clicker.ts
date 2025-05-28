import { setCorsHeaders } from '@/utils/cors.js'
import { errorHandler } from '@/utils/errorHandler.js'

// import {
// 	getCountryStats,
// 	addClick,
// 	shopBuy,
// 	getShopItems,
// } from '@/clicker/api/index.js'
import { bunnyLog } from 'bunny-log'

/**
 * Routes mapping for the clicker API
 */
const routes: Record<string, (req: Request) => Promise<Response>> = {
	// Health check
	'GET /clicker/ping': errorHandler(
		async (req) =>
			new Response('Pong! Clicker API ready.', {
				status: 200,
				headers: setCorsHeaders(),
			})
	),

	// 'GET /clicker/v1/leaderboard': async (req) => {
	// 	const url = new URL(req.url)
	// 	const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10)
	// 	const stats = await getCountryStats(limit)
	// 	return new Response(JSON.stringify(stats), {
	// 		status: 200,
	// 		headers: setCorsHeaders({
	// 			'Content-Type': 'application/json',
	// 		}),
	// 	})
	// },

	// 'POST /clicker/v1/click': async (req) => {
	// 	const { code } = await req.json()
	// 	if (!code)
	// 		return new Response('Missing country code', {
	// 			status: 400,
	// 			headers: setCorsHeaders(),
	// 		})

	// 	const result = await addClick(code)
	// 	if (!result)
	// 		return new Response('Failed to add click', {
	// 			status: 500,
	// 			headers: setCorsHeaders(),
	// 		})

	// 	return new Response(JSON.stringify({ success: true }), {
	// 		status: 200,
	// 		headers: setCorsHeaders({
	// 			'Content-Type': 'application/json',
	// 		}),
	// 	})
	// },

	// 'GET /clicker/v1/shop': async (req) => {
	// 	const items = await getShopItems()
	// 	return new Response(JSON.stringify(items), {
	// 		status: 200,
	// 		headers: setCorsHeaders({
	// 			'Content-Type': 'application/json',
	// 		}),
	// 	})
	// },

	// 'POST /clicker/v1/shop/buy': async (req) => {
	// 	const { user_id, item_id, payment_method } = await req.json()
	// 	if (!user_id || !item_id || !payment_method)
	// 		return new Response('Missing parameters', {
	// 			status: 400,
	// 			headers: setCorsHeaders(),
	// 		})

	// 	const result = await shopBuy(user_id, item_id, payment_method)
	// 	if (!result)
	// 		return new Response('Failed to buy item', {
	// 			status: 400,
	// 			headers: setCorsHeaders(),
	// 		})

	// 	return new Response(JSON.stringify(result), {
	// 		status: 200,
	// 		headers: setCorsHeaders({
	// 			'Content-Type': 'application/json',
	// 		}),
	// 	})
	// },
}

/**
 * Main clicker router handler.
 * @param req - The request object
 * @returns The response object
 */
export const clickerRouter = async (req: Request): Promise<Response> => {
	const url = new URL(req.url)
	const routeKey = `${req.method.toUpperCase()} ${url.pathname}`

	const handler = routes[routeKey]
	if (handler) return errorHandler(handler)(req)

	return new Response('Not Found', { status: 404, headers: setCorsHeaders() })
}
