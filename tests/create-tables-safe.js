import postgres from 'postgres'
import 'dotenv/config'

console.log('Creating tables with IF NOT EXISTS...')

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
		application_name: 'table-creator',
	},
})

const createTablesSQL = `
-- Create bot_stats table if not exists
CREATE TABLE IF NOT EXISTS bot_stats (
	bot_id text PRIMARY KEY NOT NULL,
	users bigint DEFAULT 0 NOT NULL,
	servers bigint DEFAULT 0 NOT NULL,
	birthday_messages bigint DEFAULT 0 NOT NULL,
	starboard_posts bigint DEFAULT 0 NOT NULL,
	temp_channels bigint DEFAULT 0 NOT NULL,
	tickets_opened bigint DEFAULT 0 NOT NULL,
	total_xp bigint DEFAULT 0 NOT NULL,
	updated_at timestamp with time zone DEFAULT now(),
	voice_channels bigint DEFAULT 0 NOT NULL,
	leaderboard_users bigint DEFAULT 0 NOT NULL,
	total_plugins bigint DEFAULT 0 NOT NULL,
	configured_plugins bigint DEFAULT 0 NOT NULL
);

-- Create bots table if not exists
CREATE TABLE IF NOT EXISTS bots (
	bot_id text PRIMARY KEY NOT NULL,
	bot_name text NOT NULL,
	bot_token text NOT NULL,
	bot_owner jsonb NOT NULL
);

-- Create guilds table if not exists
CREATE TABLE IF NOT EXISTS guilds (
	premium boolean DEFAULT false NOT NULL,
	bot_id text NOT NULL,
	guild_id text NOT NULL,
	guild_name text NOT NULL,
	members integer DEFAULT 0,
	PRIMARY KEY (bot_id, guild_id)
);

-- Add foreign key constraint if not exists
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE constraint_name = 'guilds_bot_id_bots_bot_id_fk'
	) THEN
		ALTER TABLE guilds ADD CONSTRAINT guilds_bot_id_bots_bot_id_fk
		FOREIGN KEY (bot_id) REFERENCES bots(bot_id);
	END IF;
END $$;
`

try {
	console.log('Executing safe table creation...')
	await client.unsafe(createTablesSQL)
	console.log('✅ Tables created/verified successfully!')

	// Verify tables exist
	const tables = await client`
		SELECT table_name
		FROM information_schema.tables
		WHERE table_schema = 'public'
		AND table_name IN ('bot_stats', 'bots', 'guilds')
		ORDER BY table_name
	`

	console.log('\nVerified tables:')
	tables.forEach(table => {
		console.log(`✅ ${table.table_name}`)
	})

} catch (error) {
	console.error('❌ Error creating tables:', error.message)
	process.exit(1)
} finally {
	await client.end()
}

console.log('\n🎉 Database is ready!')
