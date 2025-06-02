import db from '@/db/supabase.js'
import { DatabaseLogger, StatusLogger } from '@/utils/bunnyLogger.js'

/**
 * Initializes the database with retry logic
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} retryDelay - Delay in ms between retries
 */
export async function initializeDatabase(maxRetries = 3, retryDelay = 5_000) {
	let retries = 0
	let success = false

	// Try to initialize the database with retries
	while (!success && retries < maxRetries) {
		try {
			// Initialize the database
			const { error } = await db.rpc('initialize_database')

			// Check if the database is initialized
			if (error) {
				throw error
			}

			// Mark as successful
			success = true

			// Log the database initialization
			DatabaseLogger.connect()
		} catch (error) {
			retries++
			DatabaseLogger.error(
				`Database initialization attempt ${retries}/${maxRetries} failed: ${error instanceof Error ? error.message : String(error)}`
			)

			// If we haven't reached max retries, wait before retrying
			if (retries < maxRetries) {
				StatusLogger.info(
					`Retrying database initialization in ${retryDelay / 1_000} seconds...`
				)
				await new Promise((resolve) => setTimeout(resolve, retryDelay))
			} else {
				DatabaseLogger.error('Failed to initialize database after multiple attempts')
				// We'll continue without throwing to allow other bot features to work
			}
		}
	}
}
