import { env } from "node:process";
import type * as Discord from "discord.js";
import type { OAuthTokenResponse } from "../types/oAuth.js";
import { bunnyLog } from "bunny-log";

const CLIENT_SECRET: string = env.BOT_CLIENT_SECRET || "";

/**
 * Handles the login process for the OAuth2 flow.
 * @param {Request} req - The request object.
 * @param {Discord.ClientUser['id']} client_id - The Discord client.
 * @param {Discord.Snowflake} redirect_uri - The redirect URI.
 * @returns {Response} A response object.
 */
export function handleLogin(
	req: Request,
	client_id: Discord.ClientUser["id"],
	redirect_uri: Discord.Snowflake,
): Response {
	const referer = req.headers.get("Referer");
	const state: string = encodeURIComponent(
		referer && isValidState(referer)
			? referer
			: new URL(env.DASHBOARD_URL || "http://localhost:3000").origin,
	);
	return new Response(null, {
		status: 302,
		headers: {
			Location: `https://discord.com/api/oauth2/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=identify+guilds+email&state=${state}`,
		},
	});
}

/**
 * Handles the OAuth2 callback.
 * @param {URL} url - The URL object.
 * @param {Discord.Snowflake} client_id - The client ID.
 * @param {Discord.Snowflake} redirect_uri - The redirect URI.
 * @returns {Promise<Response>} A promise that resolves to a response object.
 */
export async function handleOAuthCallback(
	url: URL,
	client_id: Discord.Snowflake,
): Promise<Response> {
	// Get the code from the URL
	const code: string | null = url.searchParams.get("code");

	// Get the state from the URL
	const state: string = decodeURIComponent(
		url.searchParams.get("state") ||
			new URL(env.DASHBOARD_URL || "http://localhost:3000").origin,
	);

	// Add state validation
	if (!isValidState(state)) {
		return new Response("Invalid state parameter", { status: 400 });
	}

	bunnyLog.api("OAuth2 Callback", {
		code,
		state,
		client_id,
	});

	// Get the error from the URL
	const error: string | null = url.searchParams.get("error");

	// If there is an error, redirect with the error
	if (error) {
		return redirectWithError(state, error);
	}

	// If there is no code, redirect with the error
	if (!code) {
		return new Response("Authorization code not found", {
			status: 400,
			headers: { Location: `${state}?error=code_not_found` },
		});
	}

	// Create the params for the token request
	const params: URLSearchParams = new URLSearchParams();
	params.append("client_id", client_id);
	params.append("client_secret", CLIENT_SECRET);
	params.append("grant_type", "authorization_code");
	params.append("code", code);

	bunnyLog.api("OAuth2 Token Request", params.toString());

	// Fetch the token
	try {
		const tokenResponse: Response = await fetch(
			"https://discord.com/api/oauth2/token",
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: params.toString(),
			},
		);

		// Add proper error logging
		if (!tokenResponse.ok) {
			const errorData = await tokenResponse.json();
			bunnyLog.error('Token exchange failed', {
				status: tokenResponse.status,
				error: errorData
			});
			return redirectWithError(state, `token_exchange_failed_${tokenResponse.status}`);
		}

		// Get the data from the token response
		const data: OAuthTokenResponse = await tokenResponse.json();

		// If there is an error, redirect with the error
		if ("error" in data && typeof data.error === "string") {
			return redirectWithError(state, data.error);
		}

		// If there is an access token, redirect with the access token
		if (data.access_token) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: `${process.env.DASHBOARD_URL}/api/auth/callback?code=${data.access_token}`,
				},
			});
		}

		// If there is no access token, redirect with the error
		return new Response("Error fetching access token", { status: 400 });
	} catch (error) {
		// If there is an error, redirect with the error
		return new Response("Error during token exchange", { status: 500 });
	}
}

/**
 * Redirects with an error.
 * @param {Discord.Snowflake} state - The state.
 * @param {Discord.Snowflake} error - The error.
 * @returns {Response} A response object.
 */
function redirectWithError(
	state: Discord.Snowflake,
	error: Discord.Snowflake,
): Response {
	return new Response(null, {
		status: 302,
		headers: { Location: `${state}?error=${error}` },
	});
}

/**
 * Sets the CORS headers for the response.
 * @param {Response} response - The response object.
 * @returns {Response} A response object.
 */
export function setCorsHeaders(response: Response): Response {
	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type");
	return response;
}

// Add state validation function
function isValidState(state: string): boolean {
	try {
		const stateUrl = new URL(state);
		const allowedOrigins = [
			env.DASHBOARD_URL,
			"http://localhost:3000",
			"https://dashboard.rabbittale.co",
		].filter(Boolean);
		return allowedOrigins.includes(stateUrl.origin);
	} catch {
		return false;
	}
}
