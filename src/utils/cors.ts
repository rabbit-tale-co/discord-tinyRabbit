const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cookie',
}

export const setCorsHeaders = (init?: HeadersInit): Headers => {
	const headers = new Headers(init)
	for (const [key, value] of Object.entries(CORS_HEADERS)) {
		headers.set(key, value)
	}

	return headers
}
