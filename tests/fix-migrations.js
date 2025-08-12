import fs from 'fs'
import path from 'path'
import postgres from 'postgres'
import 'dotenv/config'

console.log('Fixing migration state...')

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
		application_name: 'migration-fixer',
	},
})

try {
	// First, check the structure of the migrations table
	console.log('Checking migrations table structure...')
	const tableStructure = await client`
		SELECT column_name, data_type, is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'drizzle'
		AND table_name = '__drizzle_migrations'
		ORDER BY ordinal_position
	`

	console.log('Migrations table columns:')
	tableStructure.forEach((col) => {
		console.log(
			`- ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`
		)
	})

	// Check current migrations in database
	console.log('\nCurrent migrations in database:')
	const existingMigrations = await client`
		SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at
	`

	console.log(`Found ${existingMigrations.length} existing migrations:`)
	existingMigrations.forEach((migration) => {
		console.log(`- ${migration.hash} (${migration.created_at})`)
	})

	// Read our journal
	const journalPath = path.join('./drizzle', 'meta', '_journal.json')
	if (!fs.existsSync(journalPath)) {
		throw new Error('Journal file not found: drizzle/meta/_journal.json')
	}

	const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'))
	console.log(`\nOur migrations from journal:`)
	journal.entries.forEach((entry) => {
		console.log(`- ${entry.tag} (when: ${new Date(entry.when)})`)
	})

	// Clear existing migrations and add ours
	console.log('\nClearing existing migration records...')
	await client`DELETE FROM drizzle.__drizzle_migrations`

	console.log('Adding our migrations as completed...')
	for (const entry of journal.entries) {
		const createdAt = new Date(entry.when)
		console.log(`Adding migration: ${entry.tag}`)

		await client`
			INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
			VALUES (${entry.tag}, ${createdAt})
		`
	}

	// Verify the result
	console.log('\nVerifying final state...')
	const finalMigrations = await client`
		SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
	`

	console.log(`Total migrations now in database: ${finalMigrations.length}`)
	finalMigrations.forEach((migration) => {
		console.log(`- ${migration.hash} (${migration.created_at})`)
	})

	console.log('\n🎉 Migration state fixed!')
	console.log('Now try running: bun run db:migrate')
} catch (error) {
	console.error('Error fixing migrations:', error.message)
	if (error.query) {
		console.error('Failed query:', error.query)
	}
	process.exit(1)
} finally {
	await client.end()
}

console.log('\nProcess completed.')
