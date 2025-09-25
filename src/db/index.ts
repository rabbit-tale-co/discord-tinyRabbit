import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import 'dotenv/config'
import * as schema from './schema.js'

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
		application_name: 'discord-bot',
	},
})

export const db = drizzle(client, { schema })
