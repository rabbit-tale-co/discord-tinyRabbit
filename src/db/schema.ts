import {
	pgTable,
	text,
	bigint,
	timestamp,
	boolean,
	jsonb,
	integer,
	primaryKey,
	varchar,
} from 'drizzle-orm/pg-core'

export const botStats = pgTable('bot_stats', {
	bot_id: text('bot_id').primaryKey(),
	users: bigint('users', { mode: 'number' }).notNull().default(0),
	servers: bigint('servers', { mode: 'number' }).notNull().default(0),
	birthday_messages: bigint('birthday_messages', { mode: 'number' })
		.notNull()
		.default(0),
	starboard_posts: bigint('starboard_posts', { mode: 'number' })
		.notNull()
		.default(0),
	temp_channels: bigint('temp_channels', { mode: 'number' })
		.notNull()
		.default(0),
	tickets_opened: bigint('tickets_opened', { mode: 'number' })
		.notNull()
		.default(0),
	total_xp: bigint('total_xp', { mode: 'number' }).notNull().default(0),
	updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	voice_channels: bigint('voice_channels', { mode: 'number' })
		.notNull()
		.default(0),
	leaderboard_users: bigint('leaderboard_users', { mode: 'number' })
		.notNull()
		.default(0),
	total_plugins: bigint('total_plugins', { mode: 'number' })
		.notNull()
		.default(0),
	configured_plugins: bigint('configured_plugins', { mode: 'number' })
		.notNull()
		.default(0),
})

export const bots = pgTable('bots', {
	bot_id: text('bot_id').primaryKey(),
	bot_name: text('bot_name').notNull(),
	bot_token: text('bot_token').notNull(),
	bot_owner: jsonb('bot_owner').notNull(),
})

export const guilds = pgTable(
	'guilds',
	{
		premium: boolean('premium').notNull().default(false),
		bot_id: text('bot_id')
			.notNull()
			.references(() => bots.bot_id),
		guild_id: text('guild_id').notNull(),
		guild_name: text('guild_name').notNull(),
		members: integer('members').default(0),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.bot_id, table.guild_id] }),
	})
)

export const currencyTransactions = pgTable(
	'currency_transactions',
	{
		id: text('id').notNull(),
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		user_id: text('user_id').notNull(),
		amount: bigint('amount', { mode: 'number' }).notNull(),
		type: text('type', { enum: ['ADD', 'REMOVE'] }).notNull(),
		reason: text('reason').notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.id, table.bot_id, table.guild_id] }),
	})
)

export const discordRewardClaims = pgTable('discord_reward_claims', {
	minecraft_uuid: varchar('minecraft_uuid').primaryKey(),
	claimed_at: timestamp('claimed_at', { withTimezone: true }).defaultNow(),
})

export const leaderboard = pgTable(
	'leaderboard',
	{
		bot_id: text('bot_id')
			.notNull()
			.references(() => bots.bot_id),
		user_id: text('user_id').notNull(),
		xp: integer('xp').notNull().default(0),
		guild_id: text('guild_id').notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.bot_id, table.user_id, table.guild_id] }),
	})
)

export const pluginLicenses = pgTable('plugin_licenses', {
	license_key: text('license_key').primaryKey(),
	plugin_name: text('plugin_name').notNull(),
	user_id: text('user_id').notNull(),
	license_type: text('license_type', {
		enum: ['standard', 'premium', 'enterprise'],
	}).notNull(),
	max_servers: integer('max_servers').notNull(),
	expires_at: timestamp('expires_at', { withTimezone: true }),
	created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
	is_active: boolean('is_active').default(true),
	last_check: timestamp('last_check', { withTimezone: true }).defaultNow(),
})

export const licenseHistory = pgTable('license_history', {
	id: integer('id').primaryKey(),
	license_key: text('license_key')
		.notNull()
		.references(() => pluginLicenses.license_key),
	action_type: text('action_type', {
		enum: [
			'created',
			'activated',
			'deactivated',
			'expired',
			'server_added',
			'server_removed',
		],
	}).notNull(),
	action_data: jsonb('action_data'),
	created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

export const licenseServers = pgTable(
	'license_servers',
	{
		license_key: text('license_key')
			.notNull()
			.references(() => pluginLicenses.license_key),
		server_ip: text('server_ip').notNull(),
		connected_at: timestamp('connected_at', {
			withTimezone: true,
		}).defaultNow(),
		last_check: timestamp('last_check', { withTimezone: true }).defaultNow(),
		is_active: boolean('is_active').default(true),
		heartbeat_count: integer('heartbeat_count').default(0),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.license_key, table.server_ip] }),
	})
)

export const linkedAccounts = pgTable(
	'linked_accounts',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		user_id: text('user_id').notNull(),
		discord_id: text('discord_id'),
		minecraft_id: text('minecraft_id'),
		youtube_id: text('youtube_id'),
		twitter_id: text('twitter_id'),
		tiktok_id: text('tiktok_id'),
		twitch_id: text('twitch_id'),
		discord_verified: boolean('discord_verified').default(false),
		minecraft_verified: boolean('minecraft_verified').default(false),
		youtube_verified: boolean('youtube_verified').default(false),
		twitter_verified: boolean('twitter_verified').default(false),
		tiktok_verified: boolean('tiktok_verified').default(false),
		twitch_verified: boolean('twitch_verified').default(false),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.bot_id, table.guild_id, table.user_id] }),
	})
)

export const plugins = pgTable(
	'plugin_configs',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		plugin_name: text('plugin_name').notNull(),
		config: jsonb('config'),
		enabled: boolean('enabled').default(true).notNull(),
	},
	(table) => ({
		pk: primaryKey({
			columns: [table.bot_id, table.guild_id, table.plugin_name],
		}),
	})
)

export const starboards = pgTable(
	'starboards',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		author_message_id: text('author_message_id').notNull(),
		starboard_message_id: text('starboard_message_id').notNull(),
		star_count: integer('star_count').notNull().default(0),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		pk: primaryKey({
			columns: [
				table.bot_id,
				table.guild_id,
				table.author_message_id,
				table.starboard_message_id,
			],
		}),
	})
)

export const tempVoiceChannels = pgTable(
	'temp_voice_channels',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		channel_id: text('channel_id').notNull(),
		creator_id: text('creator_id').notNull(),
		expire_at: timestamp('expire_at', { withTimezone: true }).notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		pk: primaryKey({
			columns: [
				table.bot_id,
				table.guild_id,
				table.channel_id,
				table.creator_id,
			],
		}),
	})
)

export const tickets = pgTable(
	'tickets',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		thread_id: text('thread_id').notNull(),
		messages: jsonb('messages').notNull(),
		metadata: jsonb('metadata').notNull(),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		pk: primaryKey({
			columns: [table.bot_id, table.guild_id, table.thread_id],
		}),
	})
)

export const trialServers = pgTable(
	'trial_servers',
	{
		server_ip: text('server_ip').notNull(),
		plugin_name: text('plugin_name').notNull(),
		expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
		conversion_license_key: text('conversion_license_key').references(
			() => pluginLicenses.license_key
		),
		started_at: timestamp('started_at', { withTimezone: true }).defaultNow(),
		is_converted: boolean('is_converted').default(false),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.server_ip, table.plugin_name] }),
	})
)

export const userBalances = pgTable(
	'user_balances',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		user_id: text('user_id').notNull(),
		amount: bigint('amount', { mode: 'number' }).notNull().default(0),
		created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
		updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.bot_id, table.guild_id, table.user_id] }),
	})
)

export const userBdays = pgTable(
	'user_bdays',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		user_id: text('user_id').notNull(),
		birthday: jsonb('birthday').notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.bot_id, table.guild_id, table.user_id] }),
	})
)

export const userLevels = pgTable(
	'user_levels',
	{
		bot_id: text('bot_id').notNull(),
		guild_id: text('guild_id').notNull(),
		user_id: text('user_id').notNull(),
		xp: integer('xp').notNull().default(0),
		level: integer('level').notNull().default(0),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.bot_id, table.guild_id, table.user_id] }),
	})
)

export const verificationTokens = pgTable('verification_tokens', {
	token: text('token'),
	state: text('state').primaryKey(),
	bot_id: text('bot_id').notNull(),
	guild_id: text('guild_id').notNull(),
	minecraft_uuid: text('minecraft_uuid').notNull(),
	discord_username: text('discord_username').notNull(),
	expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
	created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// I noticed the original SQL has some malformed/duplicate foreign keys.
// Drizzle requires defining relations explicitly if you want to use them in queries.
// I'm omitting the relations part for now to keep it simple and just create the tables,
// but they can be added later if needed.
