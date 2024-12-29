import { env } from 'node:process'
import type { OAuthTokenResponse } from '../types/oAuth'

const CLIENT_SECRET: string = env.BOT_CLIENT_SECRET

export function handleLogin(
	req: Request,
	clientId: string,
	redirectUri: string
): Response {
	const state: string = encodeURIComponent(
		req.headers.get('Referer') || 'http://dashboard.rabbittale.co'
	)
	return new Response(null, {
		status: 302,
		headers: {
			Location: `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify+guilds+email&state=${state}`,
		},
	})
}

export async function handleOAuthCallback(
	url: URL,
	client_id: string
): Promise<Response> {
	const code: string | null = url.searchParams.get('code')
	const state: string = decodeURIComponent(
		url.searchParams.get('state') || 'http://dashboard.rabbittale.co'
	)
	const error: string | null = url.searchParams.get('error')

	if (error) {
		return redirectWithError(state, error)
	}

	if (!code) {
		return new Response('Authorization code not found', {
			status: 400,
			headers: { Location: `${state}?error=code_not_found` },
		})
	}

	const params: URLSearchParams = new URLSearchParams()
	params.append('client_id', client_id)
	params.append('client_secret', CLIENT_SECRET)
	params.append('grant_type', 'authorization_code')
	params.append('code', code)
	// params.append('redirect_uri', redirect)

	try {
		const tokenResponse: Response = await fetch(
			'https://discord.com/api/oauth2/token',
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: params.toString(),
			}
		)

		const data: OAuthTokenResponse = await tokenResponse.json()

		if ('error' in data && typeof data.error === 'string') {
			return redirectWithError(state, data.error)
		}

		if (data.access_token) {
			return new Response(null, {
				status: 302,
				headers: {
					Location: `${state}?access_token=${data.access_token}&expires_in=${data.expires_in}`,
				},
			})
		}
		return new Response('Error fetching access token', { status: 400 })
	} catch (error) {
		return new Response('Error during token exchange', { status: 500 })
	}
}

function redirectWithError(state: string, error: string): Response {
	return new Response(null, {
		status: 302,
		headers: { Location: `${state}?error=${error}` },
	})
}

export function setCorsHeaders(response: Response): Response {
	response.headers.set('Access-Control-Allow-Origin', '*')
	response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
	response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
	return response
}
