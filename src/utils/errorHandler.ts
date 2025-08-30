import { bunnyLog } from 'bunny-log'
import { setCorsHeaders } from './cors.js'

export const errorHandler = (handler: (req: Request) => Promise<Response>) => {
	return async (req: Request) => {
		try {
			return await handler(req)
		} catch (error) {
			const url = (() => { try { return new URL(req.url).pathname } catch { return req.url } })()
			const msg = error instanceof Error ? error.message : String(error)
			const stack = error instanceof Error && error.stack ? `\n${error.stack}` : ''
			bunnyLog.log('error', `Error handling ${req.method} ${url}: ${msg}${stack}`)
			return new Response('Internal Server Error', {
				status: 500,
				headers: setCorsHeaders(),
			})
		}
	}
}
