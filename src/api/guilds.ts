import { bunnyLog } from 'bunny-log'
import Discord from 'discord.js'

async function fetchDiscordAPI(endpoint: string) {
	const response = await fetch(`https://discord.com/api/${endpoint}`, {
		headers: {
			Authorization: `Bot ${process.env.BOT_TOKEN}`,
		},
	})

	if (!response.ok) {
		throw new Error(
			`Failed to fetch from endpoint: ${endpoint}, Status: ${response.status}`
		)
	}

	return response.json()
}

async function getCustomInvite(guildId: string) {
	try {
		const invites = await fetchDiscordAPI(`guilds/${guildId}/invites`)
		return invites.length > 0 ? invites[0].code : null
	} catch (error) {
		bunnyLog.error('Error fetching custom invites:', error)
		return null
	}
}

async function getBotGuilds() {
	try {
		const guilds = await fetchDiscordAPI('users/@me/guilds?with_counts=true')

		const detailedGuilds = await Promise.all(
			guilds.map(async (guild: Discord.Guild) => {
				let invite_link = ''
				if (guild.features.includes(Discord.GuildFeature.Community)) {
					const inviteCode = await getCustomInvite(guild.id)
					invite_link = inviteCode ? `https://discord.gg/${inviteCode}` : ''
				}

				const icon = guild.icon
					? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=4096`
					: null

				return {
					...guild,
					icon,
					invite_link,
				}
			})
		)

		return detailedGuilds
	} catch (error) {
		bunnyLog.error('Error fetching bot guilds:', error)
		throw error
	}
}

async function getGuildDetails(guild_id: string) {
	try {
		const [guild, channels, roles] = await Promise.all([
			fetchDiscordAPI(
				`guilds/${guild_id}?with_counts=true`
			) as Promise<Discord.AnonymousGuild>,
			fetchDiscordAPI(`guilds/${guild_id}/channels`) as Promise<
				Discord.GuildChannel[]
			>,
			fetchDiscordAPI(`guilds/${guild_id}/roles`) as Promise<Discord.Role[]>,
		])

		const category_count = channels.filter(
			(channel) => channel.type === Discord.ChannelType.GuildCategory
		).length
		const text_channel_count = channels.filter(
			(channel) => channel.type === Discord.ChannelType.GuildText
		).length
		const voice_channel_count = channels.filter(
			(channel) => channel.type === Discord.ChannelType.GuildVoice
		).length

		const filtered_roles = roles.filter(
			(role) => !role.managed && role.id !== guild_id
		)

		return {
			guild_details: guild,
			category_count,
			text_channel_count,
			voice_channel_count,
			roles: filtered_roles,
			channels,
		}
	} catch (error) {
		bunnyLog.error('Error fetching guild details:', error)
		throw error
	}
}

async function checkBotMembership(guildId: Discord.Snowflake) {
	try {
		const response = await fetchDiscordAPI(`guilds/${guildId}`)

		if (response.ok) return true

		if ([401, 403, 404].includes(response.status)) return false

		bunnyLog.error(`Unexpected status code: ${response.status}`)
		return false
	} catch (error) {
		bunnyLog.error('Error checking bot membership:', error)
		return false
	}
}

async function checkUserOnServer(
	user_id: Discord.User['id'],
	guild_id: Discord.Guild['id']
): Promise<boolean> {
	try {
		return await fetchDiscordAPI(`guilds/${guild_id}/members/${user_id}`)
			.then(() => true)
			.catch(() => false)
	} catch (error) {
		bunnyLog.error('Error checking user on server:', error)
		return false
	}
}

export { getGuildDetails, checkBotMembership, getBotGuilds, checkUserOnServer }
