import { drizzle } from 'drizzle-orm/postgres-js'
import fs from 'fs'
import postgres from 'postgres'
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set in .env file')
}

const url = new URL(process.env.DATABASE_URL)
if (!url.searchParams.has('sslmode')) {
	url.searchParams.set('sslmode', 'require')
}

const client = postgres(url.toString(), {
	max: 1,
	ssl: 'require',
	connection: {
		application_name: 'discord-bot-safe-migration',
	},
})

const db = drizzle(client)

console.log('Running safe migration...')

try {
	// Check if tables already exist
	const existingTables = await client`
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = 'public'
	`

	const tableNames = new Set(existingTables.map((t) => t.table_name))

	if (tableNames.has('bot_stats')) {
		console.log('✅ Tables already exist - no migration needed')
		console.log('Database is ready to use!')
	} else {
		console.log(
			'❌ Tables do not exist - please run migrations manually or use db:push'
		)
		console.log('Try: bun run db:push')
	}
} catch (error) {
	console.error('Migration check failed:', error)
	process.exit(1)
} finally {
	await client.end()
	process.exit(0)
}
