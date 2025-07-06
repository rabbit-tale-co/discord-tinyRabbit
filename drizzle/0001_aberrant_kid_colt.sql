ALTER TABLE "plugin_configs" RENAME TO "plugins";--> statement-breakpoint
ALTER TABLE "plugins" DROP CONSTRAINT "plugin_configs_bot_id_guild_id_plugin_name_pk";--> statement-breakpoint
ALTER TABLE "plugins" ADD CONSTRAINT "plugins_bot_id_guild_id_plugin_name_pk" PRIMARY KEY("bot_id","guild_id","plugin_name");--> statement-breakpoint
ALTER TABLE "plugins" DROP COLUMN "enabled";