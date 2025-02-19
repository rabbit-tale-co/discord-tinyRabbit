import { env, serve } from "bun";
import * as API from "@/api/index.js";
import * as Events from "@/events/index.js";
import * as Router from "@/router/index.js";
import * as Discord from "discord.js";
import chalk from "chalk";
import { bunnyLog } from "bunny-log";
import * as Birthday from "./commands/fun/bday.js";
import * as Database from "./db/initDatabase.js";
import * as OAuth from "./router/oAuth.js";
import playdl from "play-dl";
import PresenceService from "@/services/presenceService.js";
import * as Services from "@/services/index.js";

const PORT: number = Number.parseInt(env.PORT || "5000", 10);
const CLIENT_ID: string = env.BOT_CLIENT_ID || "";
const REDIRECT_URI: string = "https://api.rabbittale.co/callback";

/**
 * Server setup
 */
serve({
	async fetch(req: Request): Promise<Response> {
		// Get the URL from the request
		const url: URL = new URL(req.url);

		// Handle preflight requests
		if (req.method === "OPTIONS") {
			return OAuth.setCorsHeaders(new Response(null, { status: 204 }));
		}

		// Handle API requests
		// TODO: change url from rabbittale.co/api/endpoint to api.rabbittale.co/endpoint
		if (url.pathname.startsWith("/api")) {
			return Router.router(req);
		}

		// Handle login requests
		if (url.pathname === "/login") {
			return OAuth.handleLogin(req, CLIENT_ID, REDIRECT_URI);
		}

		// Handle OAuth callback requests
		if (url.pathname === "/callback") {
			return OAuth.handleOAuthCallback(url, CLIENT_ID);
		}

		// Handle 404 requests
		return new Response("Not Found", { status: 404 });
	},
	port: PORT,
	hostname: "0.0.0.0",
});

bunnyLog.server(`Server is running on port ${PORT}`);

// Initialize Firebase
Database.initializeDatabase();

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
});

const presenceService = new PresenceService(client);

/**
 * Event handler for when the bot is ready.
 * @param {Client} c - The client object from Discord.
 * @returns {Promise<void>} A promise that resolves when the bot is ready.
 */
client.once("ready", async (c) => {
	// Check if the client is ready
	if (!c.user) return;

	bunnyLog.info(`${c.user.tag} has logged in!`);
	bunnyLog.info("Made by: @Hasiradoo - Rabbit Tale Studio");
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
        .l0WMMMMMMMMMMMMMWN0o.`);

	// Initialize presence service
	presenceService.initialize();

	await Promise.all([
		API.saveBotData(c.user),
		API.updateMissingPlugins(c),
		Services.cleanupExpiredTempChannels(c),
		Services.startModerationScheduler(c),
		Birthday.scheduleBirthdayCheck(c),
	]);

	playdl.setToken({
		youtube: {
			cookie: process.env.YOUTUBE_COOKIE as string,
		},
	}); // YouTube Cookies

	await playdl.setToken({
		spotify: {
			client_id: "ID",
			client_secret: "secret",
			refresh_token: "token",
			market: "US",
		},
	}); // Await this only when setting data for spotify

	playdl.setToken({
		useragent: [
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
		],
	}); // Use this to avoid 429 errors.

	//bunnyLog.info('YouTube cookie:', process.env.YOUTUBE_COOKIE)

	setInterval(async () => {
		const { bot_status: server, db_status: database } =
			await API.checkHeartbeat();

		const serverStatusColor = server === "online" ? chalk.green : chalk.red;
		const databaseStatusColor =
			database.status === "online" ? chalk.green : chalk.red;
	}, 15_000); // 15 seconds

	presenceService.initialize(); // Restart the presence updater
});

/**
 * Event handler for guild creation.
 * @param {Discord.Guild} guild - The guild object from Discord.
 * @returns {Promise<void>} A promise that resolves when the guild is initialized.
 */
client.on(Discord.Events.GuildCreate, async (guild) => {
	await API.updateMissingPlugins(client);
});

client.on(Discord.Events.GuildDelete, async (guild) => {});

client.on("messageCreate", Events.messageHandler);
client.on(Discord.Events.MessageReactionAdd, Events.reactionHandler);
client.on(Discord.Events.InteractionCreate, Events.interactionHandler);

// Channels activity
client.on(Discord.Events.VoiceStateUpdate, Events.handleVoiceStateUpdate);

// Guild member events
client.on(Discord.Events.GuildMemberAdd, Events.handleMemberJoin);
client.on(Discord.Events.GuildMemberRemove, Events.handleMemberLeave);

client.login(env.BOT_TOKEN);

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
