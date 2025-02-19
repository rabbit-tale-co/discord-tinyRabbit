import { env } from 'node:process'
import type * as Discord from 'discord.js'
import type { OAuthTokenResponse } from '../types/oAuth.js'

const CLIENT_SECRET: string = env.BOT_CLIENT_SECRET || ''

/**
 * Handles the login process for the OAuth2 flow.
 * @param {Request} req - The request object.
 * @param {Discord.ClientUser['id']} client_id - The Discord client.
 * @param {Discord.Snowflake} redirect_uri - The redirect URI.
 * @returns {Response} A response object.
 */
export function handleLogin(
	req: Request,
	client_id: Discord.ClientUser['id'],
	redirect_uri: Discord.Snowflake
): Response {
	const state: string = encodeURIComponent(
		req.headers.get('Referer') || 'http://dashboard.rabbittale.co'
	)
	return new Response(null, {
		status: 302,
		headers: {
			Location: `https://discord.com/api/oauth2/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=identify+guilds+email&state=${state}`,
		},
	})
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
	redirect_uri: Discord.Snowflake
): Promise<Response> {
	// Get the code from the URL
	const code: string | null = url.searchParams.get('code')

	// Get the state from the URL
	const state: string = decodeURIComponent(
		url.searchParams.get('state') || 'https://dashboard.rabbittale.co'
	)

	// Get the error from the URL
	const error: string | null = url.searchParams.get('error')

	// If there is an error, redirect with the error
	if (error) {
		return redirectWithError(state, error)
	}

	// If there is no code, redirect with the error
	if (!code) {
		return new Response('Authorization code not found', {
			status: 400,
			headers: { Location: `${state}?error=code_not_found` },
		})
	}

	// Create the params for the token request
	const params: URLSearchParams = new URLSearchParams()
	params.append('client_id', client_id)
	params.append('client_secret', CLIENT_SECRET)
	params.append('grant_type', 'authorization_code')
	params.append('code', code)
	params.append('redirect_uri', redirect_uri)

	// Fetch the token
	try {
		const tokenResponse: Response = await fetch(
			'https://discord.com/api/oauth2/token',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: params.toString(),
			}
		)

		// Get the data from the token response
		const data: OAuthTokenResponse = await tokenResponse.json()

		// If there is an error, redirect with the error
		if ('error' in data && typeof data.error === 'string') {
			return redirectWithError(state, data.error)
		}

		// If there is an access token, redirect with the access token
		if (data.access_token) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: `${state}?access_token=${data.access_token}&expires_in=${data.expires_in}`,
				},
			})
		}

		// If there is no access token, redirect with the error
		return new Response('Error fetching access token', { status: 400 })
	} catch (error) {
		// If there is an error, redirect with the error
		return new Response('Error during token exchange', { status: 500 })
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
	error: Discord.Snowflake
): Response {
	return new Response(null, {
		status: 302,
		headers: { Location: `${state}?error=${error}` },
	})
}

/**
 * Sets the CORS headers for the response.
 * @param {Response} response - The response object.
 * @returns {Response} A response object.
 */
export function setCorsHeaders(response: Response): Response {
	response.headers.set('Access-Control-Allow-Origin', '*')
	response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
	response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
	return response
}
