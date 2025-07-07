import postgres from 'postgres'
import fs from 'fs'
import path from 'path'
import 'dotenv/config'

console.log('Marking migrations as completed...')

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
		application_name: 'migration-marker',
	},
})

try {
	// Read journal to get migration info
	const journalPath = path.join('./drizzle', 'meta', '_journal.json')
	if (!fs.existsSync(journalPath)) {
		throw new Error('Journal file not found: drizzle/meta/_journal.json')
	}

	const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
	console.log(`Found ${journal.entries.length} migrations to mark as completed`)

	// Check which migrations are already in database
	const existingMigrations = await client`
		SELECT hash FROM drizzle.__drizzle_migrations
	`
	const existingHashes = new Set(existingMigrations.map(m => m.hash))

	// Insert missing migrations
	for (const entry of journal.entries) {
		if (existingHashes.has(entry.tag)) {
			console.log(`✅ Migration ${entry.tag} already marked as completed`)
			continue
		}

		console.log(`📝 Marking migration ${entry.tag} as completed...`)

		await client`
			INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
			VALUES (${entry.tag}, ${new Date(entry.when)})
		`

		console.log(`✅ Migration ${entry.tag} marked as completed`)
	}

	// Verify all migrations are now marked
	console.log('\nVerifying migration status...')
	const allMigrations = await client`
		SELECT hash, created_at FROM drizzle.__drizzle_migrations
		ORDER BY created_at
	`

	console.log(`Total migrations in database: ${allMigrations.length}`)
	allMigrations.forEach(migration => {
		console.log(`- ${migration.hash} (${migration.created_at})`)
	})

	console.log('\n🎉 All migrations are now marked as completed!')
	console.log('You can now run "bun run db:migrate" safely for future migrations.')

} catch (error) {
	console.error('Error marking migrations:', error.message)
	process.exit(1)
} finally {
	await client.end()
}

console.log('\nProcess completed.')
