import {
	calculateTotalXp,
	getGlobalLeaderboard,
	getServerLeaderboard,
	getTotalUserCount,
} from "../api/leaderBoard";
import { checkHeartbeat } from "../api/heartbeat/BotStatus";
import {
	checkBotMembership,
	checkUserOnServer,
	getBotGuilds,
	getGuildDetails,
} from "../api/guilds";
import { getUser, getUsers } from "../api/user";
import { getGuildPlugins, getPluginConfig } from "../api/plugins";
import { fetchTotalXp } from "../api/totalXp";
import type { DefaultConfigs } from "../types/plugins";
import type { Snowflake } from "discord.js";
import { bunnyLog } from "bunny-log";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { linkMinecraftAccount } from "../api/connectSocials";

type RequestHandler = (req: Request) => Promise<Response>;

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const getPackageVersion = () => {
	const packageJsonPath = resolve(process.cwd(), "package.json");
	const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
	return packageJson.version;
};

const setCorsHeaders = (response: Response): Response => {
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
};

const errorHandler =
	(handler: RequestHandler): RequestHandler =>
	async (req) => {
		try {
			return await handler(req);
		} catch (error) {
			bunnyLog.error("Error handling request:", error);
			return new Response("Internal server error", { status: 500 });
		}
	};

async function router(req: Request): Promise<Response> {
	const url = new URL(req.url);

	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	const routes: Record<string, RequestHandler> = {
		"/api/bot-status": handleBotStatus,
		"/api/leaderboard/totalXp": handleTotalXp,
		"/api/leaderboard/getGlobal": handleGlobalLeaderboard,
		"/api/leaderboard/getServer": handleServerLeaderboard,
		"/api/guilds/getGuild": handleGetGuild,
		"/api/guilds/checkBotMembership": handleCheckBotMembership,
		"/api/guilds/botGuilds": handleGetBotGuilds,
		"/api/guilds/getPlugins": handleGetGuildPlugins,
		"/api/user/getUsers": handleGetUsers,
		"/api/user/getUser": handleGetUser,
		"/api/plugins/available": handleGetAvailablePlugins,
		"/api/plugins/config": handleGetPluginConfig,
		"/api/connectSocials/link": handleDiscordLink,
	};

	const handler = routes[url.pathname];
	if (handler) {
		return errorHandler(handler)(req);
	}

	return new Response("Not found", { status: 404 });
}

export async function handleBotStatus(): Promise<Response> {
	const version = getPackageVersion();
	const healthStatus = await checkHeartbeat();

	const response = new Response(JSON.stringify({ version, healthStatus }), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleTotalXp(): Promise<Response> {
	const totalXp = await fetchTotalXp();
	const response = new Response(JSON.stringify({ totalXp }), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleGlobalLeaderboard(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const page = Number.parseInt(url.searchParams.get("page") || "1", 10);
	const limit = Math.min(
		Number.parseInt(url.searchParams.get("limit") || "25", 10),
		100,
	);

	const globalLeaderboard = await getGlobalLeaderboard(page, limit);
	const totalUsers = await getTotalUserCount();
	const totalXp = await calculateTotalXp();

	const response = new Response(
		JSON.stringify({ leaderboard: globalLeaderboard, totalUsers, totalXp }),
		{ headers: { "Content-Type": "application/json" } },
	);
	return setCorsHeaders(response);
}

async function handleServerLeaderboard(req: Request): Promise<Response> {
	const bot_id = new URL(req.url).searchParams.get("bot_id");
	const guild_id = new URL(req.url).searchParams.get("guild_id");
	if (!bot_id || !guild_id)
		return new Response("Missing bot_id or guild_id", { status: 400 });

	const serverLeaderboard = await getServerLeaderboard(bot_id, guild_id);
	const response = new Response(JSON.stringify(serverLeaderboard), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleGetGuild(req: Request): Promise<Response> {
	const guildId = new URL(req.url).searchParams.get("guildId");
	if (!guildId) return new Response("Missing guildId", { status: 400 });

	const guildDetails = await getGuildDetails(guildId);
	const response = new Response(JSON.stringify(guildDetails), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleGetGuildPlugins(req: Request): Promise<Response> {
	const bot_id = new URL(req.url).searchParams.get("bot_id");
	const guild_id = new URL(req.url).searchParams.get("guild_id");
	if (!bot_id || !guild_id)
		return new Response("Missing bot_id or guild_id", { status: 400 });

	const plugins = await getGuildPlugins(bot_id, guild_id);
	const response = new Response(JSON.stringify(plugins), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleCheckBotMembership(req: Request): Promise<Response> {
	const guildId = new URL(req.url).searchParams.get("guildId");
	if (!guildId) return new Response("Missing guildId", { status: 400 });

	const isBotMember = await checkBotMembership(guildId);
	const response = new Response(JSON.stringify({ isBotMember }), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleGetBotGuilds(): Promise<Response> {
	const guilds = await getBotGuilds();
	const response = new Response(JSON.stringify(guilds), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleGetUsers(req: Request): Promise<Response> {
	const serverId = new URL(req.url).searchParams.get("serverId");
	if (!serverId) return new Response("Missing serverId", { status: 400 });

	const users = await getUsers(serverId);
	const response = new Response(JSON.stringify(users), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

const handleGetUser: RequestHandler = async (req) => {
	const url = new URL(req.url);
	const botId = url.searchParams.get("bot_id");
	const guildId = url.searchParams.get("guild_id");
	const userId = url.searchParams.get("user_id");

	if (!botId || !guildId || !userId)
		return new Response("Missing bot_id, guild_id, or user_id", {
			status: 400,
		});

	const user = await getUser(botId, guildId, userId);
	const response = new Response(JSON.stringify(user), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
};

async function handleGetAvailablePlugins(req: Request): Promise<Response> {
	const bot_id = new URL(req.url).searchParams.get("bot_id");
	const guild_id = new URL(req.url).searchParams.get("guild_id");

	if (!bot_id || !guild_id)
		return new Response("Missing bot_id or guild_id", { status: 400 });

	const availablePlugins = await getGuildPlugins(bot_id, guild_id);
	const response = new Response(JSON.stringify(availablePlugins), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleGetPluginConfig(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const bot_id = url.searchParams.get("bot_id") as Snowflake;
	const guild_id = url.searchParams.get("guild_id") as Snowflake;
	const plugin_name = url.searchParams.get(
		"plugin_name",
	) as keyof DefaultConfigs;

	if (!bot_id || !guild_id || !plugin_name)
		return new Response("Missing bot_id, guild_id or plugin_name", {
			status: 400,
		});

	const config = await getPluginConfig(bot_id, guild_id, plugin_name);
	const response = new Response(JSON.stringify(config), {
		headers: { "Content-Type": "application/json" },
	});
	return setCorsHeaders(response);
}

async function handleDiscordLink(req: Request): Promise<Response> {
	if (req.method !== "POST") {
		return new Response("Method not allowed", { status: 405 });
	}

	try {
		const { minecraftUuid, botId, guildId, userId } = await req.json();

		if (!minecraftUuid || !botId || !guildId || !userId) {
			return new Response(
				"Missing minecraftUuid, botId, guildId, or userId in request body",
				{ status: 400 },
			);
		}

		const isOnServer = await checkUserOnServer(userId, guildId);
		if (!isOnServer) {
			return new Response("User is not on the server", { status: 403 });
		}

		const success = await linkMinecraftAccount(
			minecraftUuid,
			botId,
			guildId,
			userId,
		);
		const response = new Response(JSON.stringify({ success }), {
			headers: { "Content-Type": "application/json" },
		});
		return setCorsHeaders(response);
	} catch (error) {
		bunnyLog.error("Error linking Minecraft account:", error);
		return new Response("Error processing request", { status: 500 });
	}
}

export { router };
