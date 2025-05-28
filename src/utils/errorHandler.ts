import { bunnyLog } from 'bunny-log'
import { setCorsHeaders } from './cors.js'

export const errorHandler = (handler: (req: Request) => Promise<Response>) => {
	return async (req: Request) => {
		try {
			return await handler(req)
		} catch (error) {
			bunnyLog.error(`Error handling request: ${error}`)
			return new Response('Internal Server Error', {
				status: 500,
				headers: setCorsHeaders(),
			})
		}
	}
}
