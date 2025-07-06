CREATE TABLE "bot_stats" (
	"bot_id" text PRIMARY KEY NOT NULL,
	"users" bigint DEFAULT 0 NOT NULL,
	"servers" bigint DEFAULT 0 NOT NULL,
	"birthday_messages" bigint DEFAULT 0 NOT NULL,
	"starboard_posts" bigint DEFAULT 0 NOT NULL,
	"temp_channels" bigint DEFAULT 0 NOT NULL,
	"tickets_opened" bigint DEFAULT 0 NOT NULL,
	"total_xp" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"voice_channels" bigint DEFAULT 0 NOT NULL,
	"leaderboard_users" bigint DEFAULT 0 NOT NULL,
	"total_plugins" bigint DEFAULT 0 NOT NULL,
	"configured_plugins" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bots" (
	"bot_id" text PRIMARY KEY NOT NULL,
	"bot_name" text NOT NULL,
	"bot_token" text NOT NULL,
	"bot_owner" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_transactions" (
	"id" text NOT NULL,
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "currency_transactions_id_bot_id_guild_id_pk" PRIMARY KEY("id","bot_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_reward_claims" (
	"minecraft_uuid" varchar PRIMARY KEY NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"premium" boolean DEFAULT false NOT NULL,
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"guild_name" text NOT NULL,
	"members" integer DEFAULT 0,
	CONSTRAINT "guilds_bot_id_guild_id_pk" PRIMARY KEY("bot_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "leaderboard" (
	"bot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"guild_id" text NOT NULL,
	CONSTRAINT "leaderboard_bot_id_user_id_guild_id_pk" PRIMARY KEY("bot_id","user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "license_history" (
	"id" integer PRIMARY KEY NOT NULL,
	"license_key" text NOT NULL,
	"action_type" text NOT NULL,
	"action_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "license_servers" (
	"license_key" text NOT NULL,
	"server_ip" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now(),
	"last_check" timestamp with time zone DEFAULT now(),
	"is_active" boolean DEFAULT true,
	"heartbeat_count" integer DEFAULT 0,
	CONSTRAINT "license_servers_license_key_server_ip_pk" PRIMARY KEY("license_key","server_ip")
);
--> statement-breakpoint
CREATE TABLE "linked_accounts" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"discord_id" text,
	"minecraft_id" text,
	"youtube_id" text,
	"twitter_id" text,
	"tiktok_id" text,
	"twitch_id" text,
	"discord_verified" boolean DEFAULT false,
	"minecraft_verified" boolean DEFAULT false,
	"youtube_verified" boolean DEFAULT false,
	"twitter_verified" boolean DEFAULT false,
	"tiktok_verified" boolean DEFAULT false,
	"twitch_verified" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "linked_accounts_bot_id_guild_id_user_id_pk" PRIMARY KEY("bot_id","guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "plugin_licenses" (
	"license_key" text PRIMARY KEY NOT NULL,
	"plugin_name" text NOT NULL,
	"user_id" text NOT NULL,
	"license_type" text NOT NULL,
	"max_servers" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"is_active" boolean DEFAULT true,
	"last_check" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plugin_configs" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"plugin_name" text NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plugin_configs_bot_id_guild_id_plugin_name_pk" PRIMARY KEY("bot_id","guild_id","plugin_name")
);
--> statement-breakpoint
CREATE TABLE "starboards" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"author_message_id" text NOT NULL,
	"starboard_message_id" text NOT NULL,
	"star_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "starboards_bot_id_guild_id_author_message_id_starboard_message_id_pk" PRIMARY KEY("bot_id","guild_id","author_message_id","starboard_message_id")
);
--> statement-breakpoint
CREATE TABLE "temp_voice_channels" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"creator_id" text NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "temp_voice_channels_bot_id_guild_id_channel_id_creator_id_pk" PRIMARY KEY("bot_id","guild_id","channel_id","creator_id")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"messages" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tickets_bot_id_guild_id_thread_id_pk" PRIMARY KEY("bot_id","guild_id","thread_id")
);
--> statement-breakpoint
CREATE TABLE "trial_servers" (
	"server_ip" text NOT NULL,
	"plugin_name" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"conversion_license_key" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"is_converted" boolean DEFAULT false,
	CONSTRAINT "trial_servers_server_ip_plugin_name_pk" PRIMARY KEY("server_ip","plugin_name")
);
--> statement-breakpoint
CREATE TABLE "user_balances" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_balances_bot_id_guild_id_user_id_pk" PRIMARY KEY("bot_id","guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_bdays" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"birthday" jsonb NOT NULL,
	CONSTRAINT "user_bdays_bot_id_guild_id_user_id_pk" PRIMARY KEY("bot_id","guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_levels" (
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_levels_bot_id_guild_id_user_id_pk" PRIMARY KEY("bot_id","guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"token" text,
	"state" text PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"minecraft_uuid" text NOT NULL,
	"discord_username" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_bot_id_bots_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("bot_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_bot_id_bots_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("bot_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_history" ADD CONSTRAINT "license_history_license_key_plugin_licenses_license_key_fk" FOREIGN KEY ("license_key") REFERENCES "public"."plugin_licenses"("license_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_servers" ADD CONSTRAINT "license_servers_license_key_plugin_licenses_license_key_fk" FOREIGN KEY ("license_key") REFERENCES "public"."plugin_licenses"("license_key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trial_servers" ADD CONSTRAINT "trial_servers_conversion_license_key_plugin_licenses_license_key_fk" FOREIGN KEY ("conversion_license_key") REFERENCES "public"."plugin_licenses"("license_key") ON DELETE no action ON UPDATE no action;