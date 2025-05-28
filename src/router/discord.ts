import { errorHandler } from '@/utils/errorHandler.js'
import { setCorsHeaders } from '@/utils/cors.js'

import * as API from '@/discord/api/index.js'
import { bunnyLog } from 'bunny-log'
import { fetchAvailablePlugins } from '@/discord/plugins/index.js'
import getPackageVersion from '@/utils/getPackageVersion.js'

/**
 * Discord API Route Handlers
 * Each route is keyed as: "METHOD /discord/v1/endpoint"
 */
const routes: Record<string, (req: Request) => Promise<Response>> = {
	'GET /discord/v1/ping': async () => new Response('Pong!', { status: 200 }),

	// Status endpoints
	'GET /discord/v1/status': async (): Promise<Response> => {
		const version = getPackageVersion()
		const healthStatus = await API.checkHeartbeat()

		return new Response(JSON.stringify({ version, healthStatus }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		})
	},

	'GET /discord/v1/stats': async (req: Request): Promise<Response> => {
		const url = new URL(req.url)
		const bot_id = url.searchParams.get('bot_id')
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})

		const stats = await API.fetchAllStats(bot_id)
		return new Response(JSON.stringify(stats), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	// Leaderboard endpoints
	'GET /discord/v1/leaderboard/total-xp': async (): Promise<Response> => {
		const total_xp = await API.fetchTotalXp()
		return new Response(JSON.stringify({ total_xp }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		})
	},

	'GET /discord/v1/leaderboard/global': async (
		req: Request
	): Promise<Response> => {
		const url = new URL(req.url)
		const page = Number.parseInt(url.searchParams.get('page') || '1', 10)
		const limit = Math.min(
			Number.parseInt(url.searchParams.get('limit') || '25', 10),
			100
		)
		const leaderboard = await API.getGlobalLeaderboard(page, limit)
		const total_users = await API.getTotalUserCount()
		const total_xp = await API.fetchTotalXp()
		return new Response(
			JSON.stringify({ leaderboard, total_users, total_xp }),
			{
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			}
		)
	},

	'GET /discord/v1/leaderboard/server': async (
		req: Request
	): Promise<Response> => {
		const url = new URL(req.url)
		const bot_id = url.searchParams.get('bot_id')
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		const guild_id = url.searchParams.get('guild_id')
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})

		const leaderboard = await API.getServerLeaderboard(bot_id, guild_id)
		return new Response(JSON.stringify(leaderboard), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	// Guild endpoints
	'GET /discord/v1/guild/all': async (): Promise<Response> => {
		const guilds = await API.getBotGuilds()
		return new Response(JSON.stringify(guilds), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	'GET /discord/v1/guild/details': async (req: Request): Promise<Response> => {
		const url = new URL(req.url)
		const guild_id = url.searchParams.get('guild_id')
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		const guild_details = await API.getGuildDetails(guild_id)
		return new Response(JSON.stringify(guild_details), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	'GET /discord/v1/guild/plugins': async (req: Request): Promise<Response> => {
		const url = new URL(req.url)
		const bot_id = url.searchParams.get('bot_id')
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		const guild_id = url.searchParams.get('guild_id')
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		const plugins = await API.getGuildPlugins(bot_id, guild_id)
		return new Response(JSON.stringify(plugins), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	'GET /discord/v1/guild/users': async (req: Request): Promise<Response> => {
		const url = new URL(req.url)
		const guild_id = url.searchParams.get('guild_id') // FIXME: changed from server_id to guild_id
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})

		const users = await API.getUsers(guild_id)
		return new Response(JSON.stringify(users), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	// User endpoints
	'GET /discord/v1/users/me': async (req: Request): Promise<Response> => {
		const url = new URL(req.url)
		const guild_id = url.searchParams.get('guild_id') // FIXME: changed from server_id to guild_id
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})

		const users = await API.getUsers(guild_id)
		return new Response(JSON.stringify(users), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	// Integration endpoints
	'POST /discord/v1/integrations/discord/link': async (
		req: Request
	): Promise<Response> => {
		if (req.method !== 'POST')
			return new Response('Method not allowed', { status: 405 })

		try {
			const { minecraft_uid, bot_id, guild_id, user_id } = await req.json()
			if (!minecraft_uid)
				return new Response('Missing minecraft_uid', {
					status: 400,
					headers: setCorsHeaders(),
				})
			if (!bot_id)
				return new Response('Missing bot_id', {
					status: 400,
					headers: setCorsHeaders(),
				})
			if (!guild_id)
				return new Response('Missing guild_id', {
					status: 400,
					headers: setCorsHeaders(),
				})
			if (!user_id)
				return new Response('Missing user_id', {
					status: 400,
					headers: setCorsHeaders(),
				})

			const isOnServer = await API.checkUserOnServer(user_id, guild_id)
			if (!isOnServer) {
				return new Response('User is not on the server', { status: 403 })
			}

			return new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: setCorsHeaders({
					'Content-Type': 'application/json',
				}),
			})
		} catch (error) {
			bunnyLog.error('Error in handleDiscordLink:', error as Error)
			return new Response('Internal Server Error', {
				status: 500,
				headers: setCorsHeaders(),
			})
		}
	},

	// Plugin endpoints
	'POST /discord/v1/plugins/toggle': async (
		req: Request
	): Promise<Response> => {
		const { bot_id, guild_id, plugin_name, enabled } = await req.json()
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!plugin_name)
			return new Response('Missing plugin_name', {
				status: 400,
				headers: setCorsHeaders(),
			})

		await API.togglePlugin(bot_id, guild_id, plugin_name, enabled)

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	'POST /discord/v1/plugins/enable': async (
		req: Request
	): Promise<Response> => {
		const { bot_id, guild_id, plugin_name } = await req.json()
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!plugin_name)
			return new Response('Missing plugin_name', {
				status: 400,
				headers: setCorsHeaders(),
			})

		await API.enablePlugin(bot_id, guild_id, plugin_name)

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	'POST /discord/v1/plugins/disable': async (
		req: Request
	): Promise<Response> => {
		const { bot_id, guild_id, plugin_name } = await req.json()
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!plugin_name)
			return new Response('Missing plugin_name', {
				status: 400,
				headers: setCorsHeaders(),
			})

		await API.disablePlugin(bot_id, guild_id, plugin_name)

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	'POST /discord/v1/plugins/config': async (
		req: Request
	): Promise<Response> => {
		const { bot_id, guild_id } = await req.json()
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})

		const plugins = await API.getGuildPlugins(bot_id, guild_id)
		return new Response(JSON.stringify(plugins), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	'POST /discord/v1/plugins/set': async (req: Request): Promise<Response> => {
		const { bot_id, guild_id, plugin_name, config } = await req.json()
		if (!bot_id)
			return new Response('Missing bot_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!guild_id)
			return new Response('Missing guild_id', {
				status: 400,
				headers: setCorsHeaders(),
			})
		if (!plugin_name)
			return new Response('Missing plugin_name', {
				status: 400,
				headers: setCorsHeaders(),
			})

		await API.setPluginConfig(bot_id, guild_id, plugin_name, config)

		return new Response(JSON.stringify({ success: true }), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},

	// Available plugins endpoint
	'GET /discord/v1/plugins/available': async (): Promise<Response> => {
		const availablePlugins = await fetchAvailablePlugins()
		return new Response(JSON.stringify(availablePlugins), {
			status: 200,
			headers: setCorsHeaders({
				'Content-Type': 'application/json',
			}),
		})
	},
}

/**
 * Main discord API router function.
 * @param req - The request object
 * @returns The response object
 */
export const discordRouter = async (req: Request): Promise<Response> => {
	const url = new URL(req.url)
	const routeKey = `${req.method.toUpperCase()} ${url.pathname}`

	const handler = routes[routeKey]
	if (handler) return errorHandler(handler)(req)

	return
}
