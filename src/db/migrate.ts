import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import 'dotenv/config'

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set in .env file')
}

const db = drizzle(postgres(process.env.DATABASE_URL, { max: 1 }))

console.log('Running migrations...')

await migrate(db, { migrationsFolder: 'drizzle' })

console.log('Migrations completed!')

process.exit(0)
