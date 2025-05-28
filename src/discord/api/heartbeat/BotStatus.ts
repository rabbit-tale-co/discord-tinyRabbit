import { client } from '@/server.js' // Ensure correct import of client
import { bunnyLog } from 'bunny-log'
import supabase from '@/db/supabase.js'

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
			// Use an immediately invoked async function to handle errors properly
			;(async () => {
				try {
					// Use a table we know exists instead of health_check
					const { data, error } = await supabase
						.from('plugins')
						.select('plugin_name')
						.limit(1)

					if (error) {
						bunnyLog.error('Database connection error:', error)
						resolve({ status: 'not_working', error: error.message })
					} else {
						resolve({ status: 'working' })
					}
				} catch (error) {
					bunnyLog.error('Database connection error:', error)
					resolve({
						status: 'not_working',
						error: error?.message || 'Unknown database error',
					})
				}
			})()
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
