import type { Client, Guild, Snowflake, User } from 'discord.js'
import { bunnyLog } from 'bunny-log'
import { getPluginConfig } from './plugins'
import supabase from '../db/supabase'
import { client } from '..'

type SocialPlatform = 'minecraft' | 'youtube' | 'twitter' | 'tiktok' | 'twitch'

async function linkSocialAccount(
	client: Client,
	socialId: string,
	discordId: Snowflake,
	platform: SocialPlatform
): Promise<boolean> {
	try {
		const guild = await client.guilds.fetch(process.env.GUILD_ID as Snowflake)
		const member = await guild.members.fetch(discordId)

		if (!member) {
			bunnyLog.warn(`User ${discordId} not found in the guild`)
			return false
		}

		// Update user data in Supabase
		const { data, error } = await supabase.from('user_socials').upsert(
			{
				bot_id: client.user?.id,
				guild_id: guild.id,
				user_id: discordId,
				[`${platform}_id`]: socialId,
			},
			{
				onConflict: 'bot_id,guild_id,user_id',
			}
		)

		if (error) {
			bunnyLog.error(`Error updating ${platform} data in Supabase:`, error)
			return false
		}

		const config = await getPluginConfig(
			client.user?.id,
			guild.id,
			'connectSocial'
		)
		const roleId = config[platform].role_id

		if (roleId) {
			const role = guild.roles.cache.get(roleId)
			if (role) {
				await member.roles.add(role)
			}
		}

		bunnyLog.info(
			`Successfully linked ${platform} account ${socialId} to Discord user ${discordId}`
		)
		return true
	} catch (error) {
		bunnyLog.error(`Error linking ${platform} account:`, error)
		return false
	}
}

export async function linkMinecraftAccount(
	minecraftUuid: string,
	bot_id: Client['user']['id'],
	guild_id: Guild['id'],
	user_id: User['id']
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
			.eq('bot_id', client.user?.id)
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
		const { error: upsertError } = await supabase.from('user_socials').upsert(
			{
				bot_id: client.user?.id,
				guild_id: guild_id,
				user_id: user_id,
				minecraft_uuid: minecraftUuid,
			},
			{
				onConflict: 'bot_id,guild_id,user_id',
			}
		)

		if (upsertError) {
			bunnyLog.error('Error updating Minecraft data in Supabase:', upsertError)
			return false
		}

		const config = await getPluginConfig(
			client.user?.id,
			guild_id,
			'connectSocial'
		)
		const roleId = config.minecraft.role_id

		if (roleId) {
			const role = guild.roles.cache.get(roleId)
			if (role) {
				await member.roles.add(role)
			}
		}

		bunnyLog.info(
			`Successfully linked Minecraft account ${minecraftUuid} to Discord user ${user_id} in guild ${guild_id}`
		)
		return true
	} catch (error) {
		bunnyLog.error('Error linking Minecraft account:', error)
		return false
	}
}

export const linkYoutubeAccount = (
	client: Client,
	youtubeId: string,
	bot_id: Client['user']['id'],
	guild_id: Guild['id'],
	user_id: User['id']
) => linkSocialAccount(client, youtubeId, user_id, 'youtube')

export const linkTwitterAccount = (
	client: Client,
	twitterId: string,
	bot_id: Client['user']['id'],
	guild_id: Guild['id'],
	user_id: User['id']
) => linkSocialAccount(client, twitterId, user_id, 'twitter')

export const linkTiktokAccount = (
	client: Client,
	tiktokId: string,
	bot_id: Client['user']['id'],
	guild_id: Guild['id'],
	user_id: User['id']
) => linkSocialAccount(client, tiktokId, user_id, 'tiktok')

export const linkTwitchAccount = (
	client: Client,
	twitchId: string,
	bot_id: Client['user']['id'],
	guild_id: Guild['id'],
	user_id: User['id']
) => linkSocialAccount(client, twitchId, user_id, 'twitch')
