import type * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import { getPluginConfig } from '@/api/plugins.js'
import supabase from '@/db/supabase.js'
import { client } from '@/index.js'

type SocialPlatform = 'minecraft' | 'youtube' | 'twitter' | 'tiktok' | 'twitch'

async function linkSocialAccount(
	client: Discord.Client,
	social_id: string,
	discord_id: Discord.Snowflake,
	platform: SocialPlatform
): Promise<boolean> {
	try {
		const guild = await client.guilds.fetch(
			process.env.GUILD_ID as Discord.Snowflake
		)
		const member = await guild.members.fetch(discord_id)

		if (!member) {
			bunnyLog.warn(`User ${discord_id} not found in the guild`)
			return false
		}

		// Update user data in Supabase
		const { data, error } = await supabase.from('user_socials').upsert(
			{
				bot_id: client.user?.id,
				guild_id: guild.id,
				user_id: discord_id,
				[`${platform}_id`]: social_id,
			},
			{
				onConflict: 'bot_id,guild_id,user_id',
			}
		)

		if (error) {
			bunnyLog.error(`Error updating ${platform} data in Supabase:`, error)
			return false
		}

		const bot_id = client.user?.id

		if (!bot_id) {
			bunnyLog.error('Bot ID is not set')
			return false
		}

		const config = await getPluginConfig(bot_id, guild.id, 'connectSocial')
		const role_id = config[platform].role_id

		if (role_id) {
			const role = guild.roles.cache.get(role_id)
			if (role) {
				await member.roles.add(role)
			}
		}

		bunnyLog.info(
			`Successfully linked ${platform} account ${social_id} to Discord user ${discord_id}`
		)
		return true
	} catch (error) {
		bunnyLog.error(`Error linking ${platform} account:`, error)
		return false
	}
}

export async function linkMinecraftAccount(
	minecraft_uuid: string,
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
): Promise<boolean> {
	try {
		const guild = await client.guilds.fetch(guild_id)
		const member = await guild.members.fetch(user_id)

		if (!member) {
			bunnyLog.warn(`User ${user_id} not found in the guild ${guild_id}`)
			return false
		}

		// Check if the user already has a linked Minecraft account
		const { data: existingLink, error: fetchError } = await supabase
			.from('user_socials')
			.select('minecraft_uuid')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('user_id', user_id)
			.single()

		if (fetchError && fetchError.code !== 'PGRST116') {
			bunnyLog.error('Error fetching existing Minecraft link:', fetchError)
			return false
		}

		if (existingLink?.minecraft_uuid) {
			bunnyLog.warn(`User ${user_id} already has a linked Minecraft account`)
			return false
		}

		// Update user data in Supabase
		const { error: upsert_error } = await supabase.from('user_socials').upsert(
			{
				bot_id: bot_id,
				guild_id: guild_id,
				user_id: user_id,
				minecraft_uuid: minecraft_uuid,
			},
			{
				onConflict: 'bot_id,guild_id,user_id',
			}
		)

		if (upsert_error) {
			bunnyLog.error('Error updating Minecraft data in Supabase:', upsert_error)
			return false
		}

		const config = await getPluginConfig(bot_id, guild_id, 'connectSocial')
		const role_id = config.minecraft.role_id

		if (role_id) {
			const role = guild.roles.cache.get(role_id)
			if (role) {
				await member.roles.add(role)
			}
		}

		bunnyLog.info(
			`Successfully linked Minecraft account ${minecraft_uuid} to Discord user ${user_id} in guild ${guild_id}`
		)
		return true
	} catch (error) {
		bunnyLog.error('Error linking Minecraft account:', error)
		return false
	}
}

export const linkYoutubeAccount = (
	client: Discord.Client,
	youtube_id: string,
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
) => {
	if (!bot_id) throw new Error('Bot ID is required')
	return linkSocialAccount(client, youtube_id, user_id, 'youtube')
}

export const linkTwitterAccount = (
	client: Discord.Client,
	twitter_id: string,
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
) => linkSocialAccount(client, twitter_id, user_id, 'twitter')

export const linkTiktokAccount = (
	client: Discord.Client,
	tiktok_id: string,
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
) => linkSocialAccount(client, tiktok_id, user_id, 'tiktok')

export const linkTwitchAccount = (
	client: Discord.Client,
	twitch_id: string,
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	user_id: Discord.User['id']
) => linkSocialAccount(client, twitch_id, user_id, 'twitch')
