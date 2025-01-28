import * as leaderboardAPI from '../api/leaderBoard'
import * as heartbeatAPI from '../api/heartbeat/BotStatus'
import * as guildsAPI from '../api/guilds'
import * as userAPI from '../api/user'
import * as pluginsAPI from '../api/plugins'
import * as xpAPI from '../api/totalXp'
import * as connectSocialsAPI from '../api/connectSocials'
import type { DefaultConfigs } from '../types/plugins'
import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { linkMinecraftAccount } from '../api/connectSocials'
import {
	checkBotMembership,
	checkUserOnServer,
	getGuildDetails,
} from '../api/guilds'
import { getUser } from '../api/user'
import { getGuildPlugins, getPluginConfig } from '../api/plugins'

type RequestHandler = (req: Request) => Promise<Response>

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

/**
 * Gets the package version from the package.json file.
 * @returns {string} The package version.
 */
const getPackageVersion = (): string => {
	// Get the package version from the package.json file
	const packageJsonPath = resolve(process.cwd(), 'package.json')
	const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))

	// Return the package version
	return packageJson.version
}

/**
 * Sets the CORS headers for the response.
 * @param {Response} response - The response object.
 * @returns {Response} The response object with CORS headers.
 */
const setCorsHeaders = (response: Response): Response => {
	// Set the CORS headers for the response
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		response.headers.set(key, value)
	}

	// Return the response with CORS headers
	return response
}

/**
 * Handles errors in the request handler.
 * @param {RequestHandler} handler - The request handler.
 * @returns {RequestHandler} The request handler with error handling.
 */
const errorHandler =
	(handler: RequestHandler): RequestHandler =>
	async (req) => {
		try {
			return await handler(req)
		} catch (error) {
			bunnyLog.error('Error handling request:', error)
			return new Response('Internal server error', { status: 500 })
		}
	}

/**
 * The main router function.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function router(req: Request): Promise<Response> {
	// Get the URL from the request
	const url = new URL(req.url)

	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: CORS_HEADERS })
	}

	// Define the routes and their corresponding handlers
	const routes: Map<string, RequestHandler> = new Map([
		['/api/bot-status', handleBotStatus],
		['/api/leaderboard/totalXp', handleTotalXp],
		['/api/leaderboard/getGlobal', handleGlobalLeaderboard],
		['/api/leaderboard/getServer', handleServerLeaderboard],
		['/api/guilds/getGuild', handleGetGuild],
		['/api/guilds/checkBotMembership', handleCheckBotMembership],
		['/api/guilds/botGuilds', handleGetBotGuilds],
		['/api/guilds/getPlugins', handleGetGuildPlugins],
		['/api/user/getUsers', handleGetUsers],
		['/api/user/getUser', handleGetUser],
		['/api/plugins/available', handleGetAvailablePlugins],
		['/api/plugins/config', handleGetPluginConfig],
		['/api/connectSocials/link', handleDiscordLink],
	])

	// Get the handler for the requested route
	const handler = routes.get(url.pathname)

	// If the handler exists, call it with the request and handle any errors
	if (handler) {
		return errorHandler(handler)(req)
	}

	// If the handler does not exist, return a 404 response
	return new Response('Not found', { status: 404 })
}

/**
 * Handles the bot status request.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
export async function handleBotStatus(): Promise<Response> {
	// Get the package version
	const version = getPackageVersion()

	// Check the heartbeat status
	const healthStatus = await heartbeatAPI.checkHeartbeat()

	// Create the response
	const response = new Response(JSON.stringify({ version, healthStatus }), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the total XP request.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleTotalXp(): Promise<Response> {
	// Fetch the total XP
	const totalXp = await xpAPI.fetchTotalXp()

	// Create the response
	const response = new Response(JSON.stringify({ totalXp }), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the global leaderboard request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGlobalLeaderboard(req: Request): Promise<Response> {
	// Get the page and limit from the request
	const url = new URL(req.url)

	// Get the page and limit from the request
	const page = Number.parseInt(url.searchParams.get('page') || '1', 10)

	// Get the limit from the request
	const limit = Math.min(
		Number.parseInt(url.searchParams.get('limit') || '25', 10),
		100
	)

	// Get the global leaderboard
	const globalLeaderboard = await leaderboardAPI.getGlobalLeaderboard(
		page,
		limit
	)

	// Get the total users
	const totalUsers = await leaderboardAPI.getTotalUserCount()

	// Get the total XP
	const totalXp = await xpAPI.fetchTotalXp()

	// Create the response
	const response = new Response(
		JSON.stringify({ leaderboard: globalLeaderboard, totalUsers, totalXp }),
		{ headers: { 'Content-Type': 'application/json' } }
		// TODO: put hedears with cors
	)

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the server leaderboard request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleServerLeaderboard(req: Request): Promise<Response> {
	// Get the bot_id and guild_id from the request
	const bot_id = new URL(req.url).searchParams.get('bot_id')
	const guild_id = new URL(req.url).searchParams.get('guild_id')

	// Check if the bot_id and guild_id are provided
	if (!bot_id || !guild_id)
		return new Response('Missing bot_id or guild_id', { status: 400 })

	// Get the server leaderboard
	const serverLeaderboard = await leaderboardAPI.getServerLeaderboard(
		bot_id,
		guild_id
	)

	// Create the response
	const response = new Response(JSON.stringify(serverLeaderboard), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the guild details request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGetGuild(req: Request): Promise<Response> {
	// Get the guildId from the request
	const guildId = new URL(req.url).searchParams.get('guildId')

	// Check if the guildId is provided
	if (!guildId) return new Response('Missing guildId', { status: 400 })

	// Get the guild details
	const guildDetails = await guildsAPI.getGuildDetails(guildId)

	// Create the response
	const response = new Response(JSON.stringify(guildDetails), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the guild plugins request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGetGuildPlugins(req: Request): Promise<Response> {
	// Get the bot_id and guild_id from the request
	const bot_id = new URL(req.url).searchParams.get('bot_id')
	const guild_id = new URL(req.url).searchParams.get('guild_id')

	// Check if the bot_id and guild_id are provided
	if (!bot_id || !guild_id)
		return new Response('Missing bot_id or guild_id', { status: 400 })

	// Get the guild plugins
	const plugins = await pluginsAPI.getGuildPlugins(bot_id, guild_id)

	// Create the response
	const response = new Response(JSON.stringify(plugins), {
		headers: { 'Content-Type': 'application/json' },
	})
	return setCorsHeaders(response)
}

/**
 * Handles the bot membership check request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleCheckBotMembership(req: Request): Promise<Response> {
	// Get the guildId from the request
	const guildId = new URL(req.url).searchParams.get('guildId')

	// Check if the guildId is provided

	// Get the bot membership
	if (!guildId) return new Response('Missing guildId', { status: 400 })

	// Get the bot membership
	const isBotMember = await checkBotMembership(guildId)

	// Create the response
	const response = new Response(JSON.stringify({ isBotMember }), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the bot guilds request.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGetBotGuilds(): Promise<Response> {
	// Get the bot guilds
	const guilds = await guildsAPI.getBotGuilds()

	// Create the response
	const response = new Response(JSON.stringify(guilds), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the users request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGetUsers(req: Request): Promise<Response> {
	// Get the serverId from the request
	const serverId = new URL(req.url).searchParams.get('serverId')

	// Check if the serverId is provided

	// Get the user
	if (!serverId) return new Response('Missing serverId', { status: 400 })

	// Get the users
	const users = await userAPI.getUsers(serverId)

	// Create the response
	const response = new Response(JSON.stringify(users), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the user request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGetUser(req: Request): Promise<Response> {
	// Get the bot_id, guild_id, and user_id from the request
	const url = new URL(req.url)
	const botId = url.searchParams.get('bot_id')
	const guildId = url.searchParams.get('guild_id')
	const userId = url.searchParams.get('user_id')

	// Check if the bot_id, guild_id, and user_id are provided
	if (!botId || !guildId || !userId)
		return new Response('Missing bot_id, guild_id, or user_id', {
			status: 400,
		})

	// Get the user
	const user = await userAPI.getUser(botId, guildId, userId)

	// Create the response
	const response = new Response(JSON.stringify(user), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the available plugins request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGetAvailablePlugins(req: Request): Promise<Response> {
	// Get the bot_id and guild_id from the request
	const bot_id = new URL(req.url).searchParams.get('bot_id')
	const guild_id = new URL(req.url).searchParams.get('guild_id')

	// Check if the bot_id and guild_id are provided
	if (!bot_id || !guild_id)
		return new Response('Missing bot_id or guild_id', { status: 400 })

	const availablePlugins = await pluginsAPI.getGuildPlugins(bot_id, guild_id)

	// Create the response
	const response = new Response(JSON.stringify(availablePlugins), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the plugin config request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleGetPluginConfig(req: Request): Promise<Response> {
	// Get the bot_id, guild_id, and plugin_name from the request
	const url = new URL(req.url)
	const bot_id = url.searchParams.get('bot_id') as Discord.Snowflake
	const guild_id = url.searchParams.get('guild_id') as Discord.Snowflake
	const plugin_name = url.searchParams.get(
		'plugin_name'
	) as keyof DefaultConfigs

	// Check if the bot_id, guild_id, and plugin_name are provided
	if (!bot_id || !guild_id || !plugin_name)
		return new Response('Missing bot_id, guild_id or plugin_name', {
			status: 400,
		})

	// Get the plugin config
	const config = await pluginsAPI.getPluginConfig(bot_id, guild_id, plugin_name)

	// Create the response
	const response = new Response(JSON.stringify(config), {
		headers: { 'Content-Type': 'application/json' },
	})

	// Set the CORS headers
	return setCorsHeaders(response)
}

/**
 * Handles the Discord link request.
 * @param {Request} req - The request object.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
async function handleDiscordLink(req: Request): Promise<Response> {
	// Check if the request method is POST
	if (req.method !== 'POST') {
		return new Response('Method not allowed', { status: 405 })
	}

	try {
		// Get the minecraftUuid, botId, guildId, and userId from the request body
		const { minecraftUuid, botId, guildId, userId } = await req.json()

		// Check if the minecraftUuid, botId, guildId, and userId are provided
		if (!minecraftUuid || !botId || !guildId || !userId) {
			return new Response(
				'Missing minecraftUuid, botId, guildId, or userId in request body',
				{ status: 400 }
			)
		}

		// Check if the user is on the server
		const isOnServer = await checkUserOnServer(userId, guildId)

		// Check if the user is on the server
		if (!isOnServer) {
			return new Response('User is not on the server', { status: 403 })
		}

		// Link the Minecraft account
		const success = await linkMinecraftAccount(
			minecraftUuid,
			botId,
			guildId,
			userId
		)

		// Create the response
		const response = new Response(JSON.stringify({ success }), {
			headers: { 'Content-Type': 'application/json' },
		})

		// Set the CORS headers
		return setCorsHeaders(response)
	} catch (error) {
		// Log the error
		bunnyLog.error('Error linking Minecraft account:', error)
		return new Response('Error processing request', { status: 500 })
	}
}

export { router }
