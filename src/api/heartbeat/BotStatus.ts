import { client } from '@/index.js' // Ensure correct import of client
import { bunnyLog } from 'bunny-log'

/**
 * Checks the status of the bot and the database connection.
 * @returns {Promise<{ bot_status: 'working' | 'not_working' | 'disabled' | 'booting_up', db_status: { status: string, error?: string } }>} The status of the bot and the database connection.
 */
const checkHeartbeat = async (): Promise<{
	bot_status: 'working' | 'not_working' | 'disabled' | 'booting_up'
	db_status: { status: string; error?: string }
}> => {
	const botStatusPromise = new Promise<
		'working' | 'not_working' | 'disabled' | 'booting_up'
	>((resolve) => {
		if (!client.isReady()) return resolve('booting_up')
		resolve('working')
	})

	const dbStatusPromise = new Promise<{ status: string; error?: string }>(
		(resolve) => {
			try {
				resolve({ status: 'working' })
			} catch (error) {
				bunnyLog.error('Database connection error:', error)
				resolve({ status: 'not_working', error: error.message })
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
