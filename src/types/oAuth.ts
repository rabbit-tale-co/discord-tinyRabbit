interface OAuthTokenResponse {
	access_token: string
	token_type: string
	expires_in: number
	refresh_token?: string
	scope: string
}

interface OAuthErrorResponse {
	error: string
	error_description?: string
}

export type { OAuthTokenResponse, OAuthErrorResponse }
