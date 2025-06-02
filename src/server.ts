import { env, serve, type Server } from 'bun'
import * as API from '@/discord/api/index.js'
import * as Events from '@/discord/events/index.js'
import * as Router from '@/router/index.js'
import * as Discord from 'discord.js'
import {
	ServerLogger,
	DiscordLogger,
	DatabaseLogger,
	APILogger,
	ServiceLogger,
	GuildLogger,
	PluginLogger,
	StatusLogger,
	EventLogger,
	BirthdayLogger,
	StatsLogger
} from '@/utils/bunnyLogger.js'
import * as Birthday from './discord/commands/fun/birthday/index.js'
import * as Database from './db/initDatabase.js'
import PresenceService from '@/discord/services/presenceService.js'
import * as Services from '@/discord/services/index.js'
import * as Tickets from './discord/commands/moderation/tickets/index.js'

const PORT: number = Number.parseInt(env.PORT || '5000', 10)

// Start HTTP Server
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

ServerLogger.start(PORT)

// Initialize Database
DatabaseLogger.init()
Database.initializeDatabase()

// Initialize Discord Bot
export const client = new Discord.Client({
	intents: [
		Discord.GatewayIntentBits.Guilds,
		Discord.GatewayIntentBits.GuildMembers,
		Discord.GatewayIntentBits.MessageContent,
		Discord.GatewayIntentBits.GuildMessages,
		Discord.GatewayIntentBits.GuildMessageReactions,
		Discord.GatewayIntentBits.GuildVoiceStates,
	],
	partials: [
		Discord.Partials.Message,
		Discord.Partials.Reaction,
		Discord.Partials.Channel,
	],
})

const presenceService = new PresenceService(client)

/**
 * Collect comprehensive plugin statistics for all available plugins
 */
async function collectAllPluginStats(client: Discord.Client) {
	if (!client.user) {
		StatusLogger.error('Cannot collect plugin stats - client user is null')
		return []
	}

	PluginLogger.stats()
	const guilds = [...client.guilds.cache.values()]
	const pluginTypes = [
		'levels',
		'tickets',
		'welcome_goodbye',
		'starboard',
		'birthday',
		'tempvc',
		'slowmode',
		'connectSocial',
		'moderation',
		'music',
		'economy',
	] as const

	const pluginStats = await Promise.all(
		pluginTypes.map(async (pluginType) => {
			try {
				// Count active guilds for this plugin
				const results = await Promise.all(
					guilds.map(async (guild) => {
						try {
							const config = await API.getPluginConfig(
								client.user?.id ?? '',
								guild.id,
								pluginType
							)

							// Check if plugin is enabled and has required configuration
							let isActive = config?.enabled || false

							// Additional checks for specific plugins that need more than just 'enabled'
							if (isActive && config) {
								switch (pluginType) {
									case 'tickets':
										isActive =
											!!(config as Record<string, unknown>).admin_channel_id ||
											!!(config as Record<string, unknown>)
												.transcript_channel_id
										break
									case 'welcome_goodbye':
										isActive =
											!!(config as Record<string, unknown>)
												.welcome_channel_id ||
											!!(config as Record<string, unknown>).leave_channel_id
										break
									case 'starboard':
										isActive =
											!!(config as Record<string, unknown>).channel_id &&
											!!(config as Record<string, unknown>).emoji
										break
									case 'birthday':
										isActive = !!(config as Record<string, unknown>).channel_id
										break
									case 'tempvc':
										isActive = !!(config as Record<string, unknown>).channel_id
										break
									case 'moderation': {
										const modConfig = config as Record<string, unknown>
										isActive =
											!!(modConfig.watch_roles as unknown[])?.length &&
											!!modConfig.ban_interval
										break
									}
									case 'music':
										isActive = !!(config as Record<string, unknown>).channel_id
										break
									case 'levels':
										isActive =
											!!(config as Record<string, unknown>)
												.command_channel_id ||
											!!(config as Record<string, unknown>).channel_id
										break
									case 'slowmode':
										isActive =
											!!(config as Record<string, unknown>).watch_channels &&
											!!(config as Record<string, unknown>).threshold
										break
									case 'economy':
										isActive =
											!!(config as Record<string, unknown>).currency_name &&
											!!(config as Record<string, unknown>).starting_balance
										break
								}
							}

							return isActive ? 1 : 0
						} catch (error) {
							// Silent continue for individual guild errors
							return 0
						}
					})
				)

				const activeGuilds = results.reduce((sum, curr) => sum + curr, 0)

				// Get plugin display names
				const pluginDisplayInfo = {
					levels: { name: 'Leveling System' },
					tickets: { name: 'Support Tickets' },
					welcome_goodbye: { name: 'Welcome/Goodbye' },
					starboard: { name: 'Starboard' },
					birthday: { name: 'Birthday Announcements' },
					tempvc: { name: 'Temporary Voice Channels' },
					slowmode: { name: 'Anti-Spam Slowmode' },
					connectSocial: { name: 'Social Connections' },
					moderation: { name: 'Auto-Moderation' },
					music: { name: 'Music Player' },
					economy: { name: 'Economy System' },
				}

				const info = pluginDisplayInfo[pluginType]

				return {
					Plugin: info.name,
					'Active Guilds': activeGuilds,
					'Total Guilds': guilds.length,
					'Usage %':
						guilds.length > 0
							? `${Math.round((activeGuilds / guilds.length) * 100)}%`
							: '0%',
				}
			} catch (error) {
				PluginLogger.error(pluginType, error as Error)
				return {
					Plugin: `ERROR: ${pluginType}`,
					'Active Guilds': 0,
					'Total Guilds': guilds.length,
					'Usage %': '0%',
				}
			}
		})
	)

	PluginLogger.statsComplete(pluginStats.length)
	return pluginStats
}

/**
 * Event handler for when the bot is ready.
 */
client.once('ready', async (c) => {
	if (!c.user) {
		StatusLogger.error('Client user is null - cannot proceed with bot initialization')
		return
	}

	// ========================================
	// 🚀 BOT STARTUP SECTION
	// ========================================
	DiscordLogger.ready(c.user.tag)
	StatusLogger.info('Made by: @Hasiradoo - Rabbit Tale Studio')

	StatusLogger.info(`
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

	// ========================================
	// ⚡ SERVICE INITIALIZATION SECTION
	// ========================================
	ServiceLogger.init()
	presenceService.initialize()

	try {
		// Start services in parallel
		await Promise.all([
			Services.startModerationScheduler(c),
			Birthday.scheduleBirthdayCheck(c),
			Tickets.initTicketInactivityChecker(c),
		])

		// ========================================
		// 💾 DATA & PLUGIN STATISTICS SECTION
		// ========================================
		const [, , , pluginStats] = await Promise.all([
			API.saveBotData(c.user),
			API.updateMissingPlugins(c),
			Services.cleanupExpiredTempChannels(c),
			collectAllPluginStats(c),
		])

		// Display statistics
		StatsLogger.display(pluginStats)
		PluginLogger.totalStats(c.guilds.cache.size, c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0))

		// ========================================
		// ✅ FINAL STARTUP SECTION
		// ========================================
		StatusLogger.success('All services initialized successfully')

		// Restart presence updater
		presenceService.initialize()

	} catch (error) {
		StatusLogger.error('Failed to initialize some services', error as Error)
	}
})

/**
 * Guild event handlers
 */
client.on(Discord.Events.GuildCreate, async (guild) => {
	GuildLogger.join(guild.name, guild.memberCount, guild.id)
	await API.updateMissingPlugins(client)
})

client.on(Discord.Events.GuildDelete, async (guild) => {
	GuildLogger.leave(guild.name, guild.id)
})

// Register event handlers
EventLogger.register()
client.on(Discord.Events.MessageCreate, Events.messageHandler)
client.on(Discord.Events.MessageReactionAdd, Events.reactionHandler)
client.on(Discord.Events.InteractionCreate, Events.interactionHandler)
client.on(Discord.Events.VoiceStateUpdate, Events.handleVoiceStateUpdate)
client.on(Discord.Events.GuildMemberAdd, Events.handleMemberJoin)
client.on(Discord.Events.GuildMemberRemove, Events.handleMemberLeave)
EventLogger.complete()

// Connect to Discord
DiscordLogger.connect()
client.login(env.BOT_TOKEN)


/**
 * TODO: FEATURES LIST:
 * event planner (calendar)
 * server stats (as channels text variables)
 *  - e.g. total members, online members, count roles, etc.
 */

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
