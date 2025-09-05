import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set in .env file')
}

const url = new URL(process.env.DATABASE_URL)
if (!url.searchParams.has('sslmode')) {
	url.searchParams.set('sslmode', 'require')
}

// Force SSL configuration
const client = postgres(url.toString(), {
	max: 1,
	ssl: 'require',
	connection: {
		application_name: 'discord-bot-migration',
	},
})

const db = drizzle(client)

console.log('Running migrations...')

try {
	await migrate(db, { migrationsFolder: 'drizzle' })
	console.log('Migrations completed!')
} catch (error) {
	console.error('Migration failed:', error)
	process.exit(1)
} finally {
	await client.end()
	process.exit(0)
}
