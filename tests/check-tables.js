import postgres from 'postgres'
import 'dotenv/config'

console.log('Checking existing tables...')

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set in .env file')
	process.exit(1)
}

const url = new URL(process.env.DATABASE_URL)
if (!url.searchParams.has('sslmode')) {
	url.searchParams.set('sslmode', 'require')
}

const client = postgres(url.toString(), {
	max: 1,
	ssl: 'require',
	connection: {
		application_name: 'table-checker',
	},
})

try {
	// Check if drizzle migrations table exists
	const drizzleTable = await client`
		SELECT EXISTS (
			SELECT FROM information_schema.tables
			WHERE table_schema = 'drizzle'
			AND table_name = '__drizzle_migrations'
		) as exists
	`

	console.log('Drizzle migrations table exists:', drizzleTable[0].exists)

	// List all tables in public schema
	const tables = await client`
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = 'public'
		ORDER BY table_name
	`

	console.log('\nExisting tables in public schema:')
	tables.forEach(table => {
		console.log(`- ${table.table_name}`)
	})

	// Check if any of our expected tables exist
	const expectedTables = [
		'bot_stats', 'bots', 'guilds', 'leaderboard', 'plugins',
		'user_balances', 'user_levels', 'tickets', 'temp_voice_channels', 'starboards'
	]

	console.log('\nExpected tables status:')
	for (const tableName of expectedTables) {
		const exists = await client`
			SELECT EXISTS (
				SELECT FROM information_schema.tables
				WHERE table_schema = 'public'
				AND table_name = ${tableName}
			) as exists
		`
		console.log(`- ${tableName}: ${exists[0].exists ? '✅ exists' : '❌ missing'}`)
	}

} catch (error) {
	console.error('Error checking tables:', error.message)
} finally {
	await client.end()
}

console.log('\nCheck completed.')
