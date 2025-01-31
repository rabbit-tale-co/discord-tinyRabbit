import db from '@/db/supabase.js'
import { bunnyLog } from 'bunny-log'

export async function initializeDatabase() {
	// Initialize the database
	try {
		// Initialize the database
		const { error } = await db.rpc('initialize_database')

		// Check if the database is initialized
		if (error) throw error

		// Log the database initialization
		bunnyLog.database('Database initialized successfully')
	} catch (error) {
		bunnyLog.error('Failed to initialize database:', error)
		throw error
	}
}
