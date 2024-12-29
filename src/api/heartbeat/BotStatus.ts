import { client } from '../../index' // Ensure correct import of client
import { bunnyLog } from 'bunny-log'

/**
 * Checks the status of the bot and the database connection.
 * @returns {Promise<{ bot_status: 'online' | 'offline', db_status: { status: string, error?: string } }>} The status of the bot and the database connection.
 */
const checkHeartbeat = async (): Promise<{
	bot_status: 'online' | 'offline'
	db_status: { status: string; error?: string }
}> => {
	const botStatusPromise = new Promise<'online' | 'offline'>((resolve) => {
		if (!client.isReady()) return resolve('offline')
		resolve('online')
	})

	const dbStatusPromise = new Promise<{ status: string; error?: string }>(
		(resolve) => {
			try {
				resolve({ status: 'online' })
			} catch (error) {
				bunnyLog.error('Database connection error:', error)
				resolve({ status: 'offline', error: error.message })
			}
		}
	)

	const [bot_status, db_status] = await Promise.all([
		botStatusPromise,
		dbStatusPromise,
	])

	return {
		bot_status,
		db_status,
	}
}

export { checkHeartbeat }
