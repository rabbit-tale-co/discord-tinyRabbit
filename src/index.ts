import { serve } from 'bun'
import { Client, Events, GatewayIntentBits, Partials } from 'discord.js'
import { messageHandler } from './events/onMessage'
import { interactionHandler } from './events/onInteraction'
import { handleMemberJoin, handleMemberLeave } from './events/guildMember'
import { updateBotPresence } from './services/presenceService'
import { handleBotStatus, router } from './router'
import { reactionHandler } from './events/onReaction'
import { updateMissingPlugins } from './api/plugins'
import { env } from 'node:process'
import chalk from 'chalk'
import { checkHeartbeat } from './api/heartbeat/BotStatus'
import { bunnyLog } from 'bunny-log'
import { scheduleBirthdayCheck } from './commands/bday'
import { initializeDatabase } from './db/initDatabase'
import { saveBotData } from './api/saveBot'
import {
	handleVoiceStateUpdate,
	initializeTempChannels,
} from './services/tempvc'
import {
	handleLogin,
	handleOAuthCallback,
	setCorsHeaders,
} from './router/oAuth'

const PORT: number = Number.parseInt(env.PORT || '5000', 10)
const CLIENT_ID: string = env.BOT_CLIENT_ID
const REDIRECT_URI: string = 'https://api.rabbittale.co/callback'

serve({
	async fetch(req: Request): Promise<Response> {
		const url: URL = new URL(req.url)

		if (req.method === 'OPTIONS') {
			return setCorsHeaders(new Response(null, { status: 204 }))
		}

		if (url.pathname.startsWith('/api')) {
			return router(req)
		}

		if (url.pathname === '/login') {
			return handleLogin(req, CLIENT_ID, REDIRECT_URI)
		}

		if (url.pathname === '/callback') {
			return handleOAuthCallback(url, CLIENT_ID)
		}

		return new Response('Not Found', { status: 404 })
	},
	port: PORT,
})

bunnyLog.server(`Server is running on port ${PORT}`)

// Initialize Firebase
initializeDatabase()

// Initialize Discord Bot
export const client = new Client({
	intents: [
		GatewayIntentBits.Guilds, // Required for guild events
		GatewayIntentBits.GuildMembers, // Required for member events
		GatewayIntentBits.MessageContent, // Required for message content in message events
		GatewayIntentBits.GuildMessages, // Required for message events
		GatewayIntentBits.GuildMessageReactions, // Required for reaction events
		GatewayIntentBits.GuildVoiceStates, // Required for voice channel events
	],
	partials: [
		Partials.Message, // Enables handling of uncached messages
		Partials.Reaction, // Enables handling of uncached reactions
		Partials.Channel, // Required to enable reactions in uncached channels
	],
})

client.once('ready', async (c) => {
	if (!c.user) return

	bunnyLog.info(`${c.user.tag} has logged in!`)
	bunnyLog.info('Made by: @Hasiradoo - Rabbit Tale Studio')
	bunnyLog.info(`
        ,KWN0d;.             :kx;.
        :XMMMMWO;           lNMMNd.
        :XMMMMMMX:         cXMMMMNl
        :XMMMMMMMO.       :XMMMMMMk.
        :XMMMMMMMK,      :KMMMMMMWo
        :XMMMMMMMK,     ;KMMMMMMWk.
        :XMMMMMMMO.    ,0MMMMMMNx.
        :XMMMMMMWd.  ,o0MMMMMMXl.
        :XMMMMMMX;  'OWWMMMMWk,
        :XMMMMMMXc.;OWMMMMMNo.
        :XMMMMMMMNXNMMMMMMMWOc.
        :XMMMMMMMMMMMMMMMMMMMMXx,
        :XMMMMMMMMMWWWMMMMMMMMMMXo.
        :XMMMMMWKxc;,;:cxKWMMMMMMNo
        :XMMMMNx.        .xWMMMMMMK,
        :XMMMMXc.        .cXMMMMMMX;
        :XMMMMMN0OOOOO0OO0NMMMMMMMO.
        'OMMMMMMMMMMMMMMMMMMMMMMW0;
        ,ONMMMMMMMMMMMMMMMMMMWKo.
        .l0WMMMMMMMMMMMMMWN0o.`)

	// const guilds = client.guilds.cache.map((guild) => guild.id)
	// for (const guildId of guilds) {
	// 	await initializePlugins(guildId)
	// }

	// Update bot status for all guilds
	await updateBotPresence(c.user)
	await handleBotStatus()
	await saveBotData(c.user)
	await updateMissingPlugins(c)
	await initializeTempChannels(c)
	scheduleBirthdayCheck(c)

	// Update bot status every hour for all guilds
	setInterval(async () => {
		await updateBotPresence(c.user)
	}, 300_000) // 1h - 3_600_000 now it's 5 min

	setInterval(async () => {
		const { bot_status: server, db_status: database } = await checkHeartbeat()

		const serverStatusColor = server === 'online' ? chalk.green : chalk.red
		const databaseStatusColor =
			database.status === 'online' ? chalk.green : chalk.red
	}, 15_000) // 15 seconds
})

/**
 * Event handler for guild creation.
 * @param {Guild} guild - The guild object from Discord.
 * @returns {Promise<void>} A promise that resolves when the guild is initialized.
 */
client.on(Events.GuildCreate, async (_guild) => {
	await updateMissingPlugins(client)
})

client.on(Events.MessageCreate, messageHandler)
client.on(Events.MessageReactionAdd, reactionHandler)
client.on(Events.InteractionCreate, interactionHandler)

// Channels activity
client.on(Events.VoiceStateUpdate, handleVoiceStateUpdate)

// Guild member events
client.on(Events.GuildMemberAdd, handleMemberJoin)
client.on(Events.GuildMemberRemove, handleMemberLeave)

client.login(env.BOT_TOKEN)

/**
 * TODO:
 * FIXME: if users have same XP, then they have same rank (for now [user1 300xp & lvl 0] [user2 300xp & lvl 0] one of them has global 1 and server 2 and second global 2 and server 1, they should have same rank)
 */

/**
 * TODO:
 * Make moderation bot
 * Purge - remove messages from a channel
 */

/**
 * TODO:
 * Make anti-raid/nuke system
 * ban/kick members who raid/nuke server
 */
