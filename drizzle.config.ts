import type { Config } from 'drizzle-kit'

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set in .env file')
}

export default {
	schema: './src/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		connectionString: process.env.DATABASE_URL,
	},
	verbose: true,
	strict: true,
} satisfies Config
