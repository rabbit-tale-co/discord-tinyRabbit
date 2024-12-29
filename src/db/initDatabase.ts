import supabase from './supabase'
import { bunnyLog } from 'bunny-log'

export async function initializeDatabase() {
	try {
		const { error } = await supabase.rpc('initialize_database')
		if (error) throw error
		bunnyLog.database('Database initialized successfully')
	} catch (error) {
		bunnyLog.error('Failed to initialize database:', error)
		throw error
	}
}
