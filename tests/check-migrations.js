import fs from 'fs'
import path from 'path'
import postgres from 'postgres'
import 'dotenv/config'

console.log('Checking migration status...')

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
		application_name: 'migration-checker',
	},
})

try {
	// Check existing migrations in database
	console.log('Checking existing migrations in database...')
	const existingMigrations = await client`
		SELECT * FROM drizzle.__drizzle_migrations
		ORDER BY created_at
	`

	console.log(`Found ${existingMigrations.length} migrations in database:`)
	existingMigrations.forEach((migration) => {
		console.log(`- ${migration.hash} (${migration.created_at})`)
	})

	// Check migration files in drizzle folder
	console.log('\nChecking migration files in drizzle folder...')
	const drizzlePath = './drizzle'
	const migrationFiles = fs
		.readdirSync(drizzlePath)
		.filter((file) => file.endsWith('.sql'))
		.sort()

	console.log(`Found ${migrationFiles.length} migration files:`)
	migrationFiles.forEach((file) => {
		console.log(`- ${file}`)
	})

	// Check meta/_journal.json for migration info
	const journalPath = path.join(drizzlePath, 'meta', '_journal.json')
	if (fs.existsSync(journalPath)) {
		console.log('\nChecking _journal.json...')
		const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))

		console.log(`Journal contains ${journal.entries.length} entries:`)
		journal.entries.forEach((entry) => {
			console.log(`- ${entry.tag} (when: ${entry.when})`)
		})

		// Compare with database
		console.log('\nComparison:')
		const dbHashes = new Set(existingMigrations.map((m) => m.hash))

		journal.entries.forEach((entry) => {
			const inDb = dbHashes.has(entry.tag)
			console.log(
				`- ${entry.tag}: ${inDb ? '✅ in database' : '❌ missing from database'}`
			)
		})
	}
} catch (error) {
	console.error('Error checking migrations:', error.message)
} finally {
	await client.end()
}

console.log('\nCheck completed.')
