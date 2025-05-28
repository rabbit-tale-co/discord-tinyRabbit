import { env, serve, type Server } from 'bun'
import * as API from '@/discord/api/index.js'
import * as Events from '@/discord/events/index.js'
import * as Router from '@/router/index.js'
import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import * as Birthday from './discord/commands/fun/birthday/index.js'
import * as Database from './db/initDatabase.js'
import PresenceService from '@/discord/services/presenceService.js'
import * as Services from '@/discord/services/index.js'
import * as Tickets from './discord/commands/moderation/tickets/index.js'

const PORT: number = Number.parseInt(env.PORT || '5000', 10)

serve({
	port: PORT,
	hostname: '0.0.0.0',

	fetch(req: Request, server: Server): Promise<Response> | undefined {
		if (req.headers.get('Upgrade') === 'websocket') {
			server.upgrade(req)
			return undefined
		}

		// Handle HTTP requests
		return Router.mainRouter(req)
	},
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

const presenceService = new PresenceService(client)

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

	// Initialize presence service
	presenceService.initialize()

	await Promise.all([
		API.saveBotData(c.user),
		API.updateMissingPlugins(c),
		Services.cleanupExpiredTempChannels(c),
		Services.startModerationScheduler(c),
		Birthday.scheduleBirthdayCheck(c),
		Tickets.initTicketInactivityChecker(c),
	])

	presenceService.initialize() // Restart the presence updater
})

/**
 * Event handler for guild creation.
 * @param {Discord.Guild} guild - The guild object from Discord.
 * @returns {Promise<void>} A promise that resolves when the guild is initialized.
 */
client.on(Discord.Events.GuildCreate, async (guild) => {
	await API.updateMissingPlugins(client)
})

client.on(Discord.Events.GuildDelete, async (guild) => {})

client.on(Discord.Events.MessageCreate, Events.messageHandler)
client.on(Discord.Events.MessageReactionAdd, Events.reactionHandler)
client.on(Discord.Events.InteractionCreate, Events.interactionHandler)

// Channels activity
client.on(Discord.Events.VoiceStateUpdate, Events.handleVoiceStateUpdate)

// Guild member events
client.on(Discord.Events.GuildMemberAdd, Events.handleMemberJoin)
client.on(Discord.Events.GuildMemberRemove, Events.handleMemberLeave)

client.login(env.BOT_TOKEN)

/**
 * TODO:
 * FIXME: if users have same XP, then they have same rank (for now [user1 300xp & lvl 0] [user2 300xp & lvl 0] one of them has global 1 and server 2 and second global 2 and server 1, they should have same rank)
 */

/**
 * TODO:
 * Make moderation bot
 * Purge - remove messages from a channel (Done)
 * Auto-moderation - ban/kick members who raid/nuke server ()
 * Auto-bot-detection - detect if a bot is in a server and ban it (Done)
 */

/**
 * TODO:
 * Make anti-raid/nuke system
 * ban/kick members who raid/nuke server
 */
