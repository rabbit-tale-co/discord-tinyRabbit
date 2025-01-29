import { env, serve } from 'bun'
import * as Discord from 'discord.js'
import * as Message from './events/onMessage.js'
import * as Interaction from './events/onInteraction.js'
import * as Member from './events/guildMember.js'
import * as Presence from './services/presenceService.js'
import * as Router from './router/index.js'
import * as Reaction from './events/onReaction.js'
import * as Plugins from './api/plugins.js'
import chalk from 'chalk'
import * as Heartbeat from './api/heartbeat/BotStatus.js'
import { bunnyLog } from 'bunny-log'
import * as Birthday from './commands/fun/bday.js'
import * as Database from './db/initDatabase.js'
import * as SaveBot from './api/saveBot.js'
import * as TempVC from './services/tempvc.js'
import * as OAuth from './router/oAuth.js'
import * as Moderation from './services/moderation.js'
import { startModerationScheduler } from './services/moderation.js'
import { updateBotPresence } from './services/presenceService.js'

const PORT: number = Number.parseInt(env.PORT || '5000', 10)
const CLIENT_ID: string = env.BOT_CLIENT_ID || ''
const REDIRECT_URI: string = 'https://api.rabbittale.co/callback'

/**
 * Server setup
 */
serve({
	async fetch(req: Request): Promise<Response> {
		// Get the URL from the request
		const url: URL = new URL(req.url)

		// Handle preflight requests
		if (req.method === 'OPTIONS') {
			return OAuth.setCorsHeaders(new Response(null, { status: 204 }))
		}

		// Handle API requests
		if (url.pathname.startsWith('/api')) {
			return Router.router(req)
		}

		// Handle login requests
		if (url.pathname === '/login') {
			return OAuth.handleLogin(req, CLIENT_ID, REDIRECT_URI)
		}

		// Handle OAuth callback requests
		if (url.pathname === '/callback') {
			return OAuth.handleOAuthCallback(url, CLIENT_ID)
		}

		// Handle 404 requests
		return new Response('Not Found', { status: 404 })
	},
	port: PORT,
})

bunnyLog.server(`Server is running on port ${PORT}`)

// Initialize Firebase
Database.initializeDatabase()

// Initialize Discord Bot
export const client = new Discord.Client({
	intents: [
		Discord.GatewayIntentBits.Guilds, // Required for guild events
		Discord.GatewayIntentBits.GuildMembers, // Required for member events
		Discord.GatewayIntentBits.MessageContent, // Required for message content in message events
		Discord.GatewayIntentBits.GuildMessages, // Required for message events
		Discord.GatewayIntentBits.GuildMessageReactions, // Required for reaction events
		Discord.GatewayIntentBits.GuildVoiceStates, // Required for voice channel events
	],
	partials: [
		Discord.Partials.Message, // Enables handling of uncached messages
		Discord.Partials.Reaction, // Enables handling of uncached reactions
		Discord.Partials.Channel, // Required to enable reactions in uncached channels
	],
})

/**
 * Event handler for when the bot is ready.
 * @param {Client} c - The client object from Discord.
 * @returns {Promise<void>} A promise that resolves when the bot is ready.
 */
client.once('ready', async (c) => {
	// Check if the client is ready
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
	await Presence.updateBotPresence(c.user)
	//await Heartbeat.handleBotStatus()
	await SaveBot.saveBotData(c.user)
	await Plugins.updateMissingPlugins(c)
	await TempVC.initializeTempChannels(c)
	Birthday.scheduleBirthdayCheck(c)
	await Moderation.startModerationScheduler()

	// Update bot status every hour for all guilds
	setInterval(async () => {
		await Presence.updateBotPresence(c.user)
	}, 300_000) // 1h - 3_600_000 now it's 5 min

	setInterval(async () => {
		const { bot_status: server, db_status: database } =
			await Heartbeat.checkHeartbeat()

		const serverStatusColor = server === 'online' ? chalk.green : chalk.red
		const databaseStatusColor =
			database.status === 'online' ? chalk.green : chalk.red
	}, 15_000) // 15 seconds
})

/**
 * Event handler for guild creation.
 * @param {Discord.Guild} guild - The guild object from Discord.
 * @returns {Promise<void>} A promise that resolves when the guild is initialized.
 */
client.on(Discord.Events.GuildCreate, async (_guild) => {
	await Plugins.updateMissingPlugins(client)
})

client.on('messageCreate', Message.messageHandler)
client.on(Discord.Events.MessageReactionAdd, Reaction.reactionHandler)
client.on(Discord.Events.InteractionCreate, Interaction.interactionHandler)

// Channels activity
client.on(Discord.Events.VoiceStateUpdate, TempVC.handleVoiceStateUpdate)

// Guild member events
client.on(Discord.Events.GuildMemberAdd, Member.handleMemberJoin)
client.on(Discord.Events.GuildMemberRemove, Member.handleMemberLeave)

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
