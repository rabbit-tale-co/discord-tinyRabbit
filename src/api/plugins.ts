import type { DefaultConfigs, PluginResponse, Plugins } from '../types/plugins'
import {
	ButtonStyle,
	ComponentType,
	type Guild,
	type Client,
	type Snowflake,
	type ClientUser,
	Colors,
} from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '../db/supabase'

const default_configs: DefaultConfigs = {
	levels: {
		enabled: false,
		reward_message: 'Congratulations, you have leveled up to level {level}!',
		channel_id: null,
		command_channel_id: null,
		reward_roles: null,
		boost_3x_roles: null,
	},
	tickets: {
		enabled: false,
		admin_channel_id: null,
		transcript_channel_id: null,
		embeds: {
			open_ticket: {
				title: 'Click to open a ticket',
				description:
					'Click on the button corresponding to the type of ticket you wish to open',
				color: Colors.Blurple,
				buttons_map: [
					{
						unique_id: 'open_ticket_general',
						label: 'General Support',
						style: ButtonStyle.Primary,
						type: ComponentType.Button,
					},
				],
			},
			user_ticket: {
				title: 'Ticket Opened',
				description: 'A new ticket: {channel_id} has been opened.',
				color: 0x23a55a,
			},
			opened_ticket: {
				description:
					'Thank you for reaching out! {opened_by} A support representative will be with you shortly. \n\nPlease provide as much detail as possible to help us assist you better.',
				color: 0x23a55a,
				buttons_map: [
					{
						unique_id: 'close_ticket',
						label: 'Close Ticket',
						style: ButtonStyle.Danger,
						type: ComponentType.Button,
					},
					{
						unique_id: 'close_ticket_with_reason',
						label: 'Close Ticket with Reason',
						style: ButtonStyle.Danger,
						type: ComponentType.Button,
					},
				],
			},
			confirm_close_ticket: {
				title: 'Close Confirmation',
				description: 'Please confirm that you want to close this ticket.',
				color: 0x23a55a,
				buttons_map: [
					{
						unique_id: 'confirm_close_ticket',
						label: 'Confirm Close',
						style: ButtonStyle.Success,
						type: ComponentType.Button,
					},
				],
			},
			closed_ticket: {
				title: 'Ticket Closed',
				description: 'The ticket was closed by {closed_by}.',
				color: Colors.Red,
				fields: [
					{
						name: 'Reason',
						value: '{reason}',
						inline: true,
					},
				],
			},
			admin_ticket: {
				title: 'New Ticket - {ticket_id}',
				color: Colors.Blurple,
				fields: [
					{
						name: 'Opened by',
						value: '{opened_by}',
						inline: true,
					},
					{
						name: 'Claimed by',
						value: '{claimed_by}',
						inline: true,
					},
					{
						name: 'Category',
						value: '{category}',
						inline: true,
					},
				],
				buttons_map: [
					{
						unique_id: 'claim_ticket',
						label: 'Claim Ticket',
						style: ButtonStyle.Primary,
						type: ComponentType.Button,
					},
					{
						unique_id: 'join_ticket',
						label: 'Join Ticket',
						style: ButtonStyle.Secondary,
						type: ComponentType.Button,
					},
				],
			},
			transcript: {
				title: 'Ticket Closed',
				color: 0x23a55a,
				fields: [
					{
						name: 'Ticket ID',
						value: '{ticket_id}',
						inline: true,
					},
					{
						name: 'Opened by',
						value: '{opened_by}',
						inline: true,
					},
					{
						name: 'Closed by',
						value: '{closed_by}',
						inline: true,
					},
					{
						name: 'Open Time',
						value: '{open_time}',
						inline: true,
					},
					{
						name: 'Claimbed By',
						value: '{claimed_by}',
						inline: true,
					},
					{
						name: 'Reason',
						value: '{reason}',
					},
				],
				buttons_map: [
					{
						unique_id: 'open_thread',
						label: 'Open Thread',
						style: ButtonStyle.Link,
						type: ComponentType.Button,
						url: 'https://discord.com/channels/{guild_id}/{thread_id}',
					},
				],
				footer: '{close_time}',
			},
		},
	},
	welcome: {
		enabled: false,
		type: 'text',
		welcome_message: 'Welcome to the server! {user}',
		welcome_channel_id: null,
		leave_message: null,
		leave_channel_id: null,
		embed_welcome: {
			title: '{username} has joined the server!',
			description: 'We are glad to have you here. Enjoy your stay!',
			color: Colors.Blurple,
			thumbnail: {
				url: '{avatar}',
			},
		},
		embed_leave: {
			title: '{username} has left the server!',
			color: Colors.Blurple,
			thumbnail: {
				url: '{avatar}',
			},
		},
		join_role_id: null,
	},
	starboard: {
		enabled: false,
		emoji: '⭐',
		watch_channels: null,
		channel_id: null,
		threshold: 15,
	},
	birthday: {
		enabled: false,
		channel_id: null,
		message: 'Happy Birthday {user}! 🎉',
	},
	tempvc: {
		enabled: false,
		channel_id: null,
		durations: null,
	},
	slowmode: {
		enabled: false,
		watch_channels: null,
		threshold: 10,
		duration: 10_000,
		rate_duration: {
			high_rate: 6,
			low_rate: 2,
		},
	},
	connectSocial: {
		enabled: false,
		minecraft: {
			role_id: null,
		},
		youtube: {
			role_id: null,
		},
		twitter: {
			role_id: null,
		},
		tiktok: {
			role_id: null,
		},
		twitch: {
			role_id: null,
		},
	},
}

function getDefaultConfig(plugin_name: keyof DefaultConfigs): Plugins {
	return default_configs[plugin_name]
}

async function saveGuildPlugins(
	client: Client,
	guild_id: Guild['id'],
	plugins: any[]
) {
	try {
		// Fetch the guild from Discord
		const guild = await client.guilds.fetch(guild_id)
		if (!guild) {
			throw new Error(`Guild not found for ID: ${guild_id}`)
		}

		const guild_name = guild.name
		const bot_id = client.user?.id

		if (!bot_id) {
			throw new Error('Bot ID is undefined')
		}

		// Check if the guild exists in the database
		const { data: guildExists, error: guildError } = await supabase
			.from('guilds')
			.select('bot_id')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.single()

		if (guildError && guildError.code !== 'PGRST116') {
			throw guildError
		}

		// If guild doesn't exist, add it
		if (!guildExists) {
			const { error: insertGuildError } = await supabase
				.from('guilds')
				.insert({ bot_id: bot_id, guild_id: guild_id, guild_name: guild_name })
			if (insertGuildError) throw insertGuildError
		} else {
			// If guild exists, update the name in case it has changed
			const { error: updateGuildError } = await supabase
				.from('guilds')
				.update({ guild_name: guild_name })
				.eq('bot_id', bot_id)
				.eq('guild_id', guild_id)
			if (updateGuildError) throw updateGuildError
		}

		// Save plugins
		const pluginData = plugins.map((plugin) => ({
			bot_id: bot_id,
			guild_id: guild_id,
			plugin_name: plugin.name,
			config: plugin.config,
		}))

		const { error: pluginError } = await supabase
			.from('plugins')
			.upsert(pluginData)

		if (pluginError) throw pluginError

		bunnyLog.database(
			`Plugins saved successfully for guild ${guild_name} (${guild_id})`
		)
	} catch (error) {
		bunnyLog.error('Error saving guild plugins:', error)
		throw error
	}
}

async function updateMissingPlugins(client: Client): Promise<void> {
	const guilds = client.guilds.cache

	for (const guild of guilds.values()) {
		const current_plugins = await getGuildPlugins(client.user.id, guild.id)

		const missing_plugins = Object.keys(default_configs).filter(
			(plugin_name) =>
				!current_plugins.some((plugin) => plugin.id === plugin_name)
		)

		if (missing_plugins.length > 0) {
			await saveGuildPlugins(
				client,
				guild.id,
				missing_plugins.map((plugin_name) => ({
					name: plugin_name,
					config: default_configs[plugin_name],
				}))
			)

			bunnyLog.database(
				`Initialized missing plugins for guild ${guild.name} (${guild.id})`
			)
		}
	}
}

export async function getGuildPlugins(
	bot_id: ClientUser['id'],
	guild_id: Guild['id']
): Promise<PluginResponse<DefaultConfigs[keyof DefaultConfigs]>[]> {
	const { data, error } = await supabase
		.from('plugins')
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)

	if (error) {
		throw error
	}

	return data.map((plugin) => ({
		id: plugin.plugin_name,
		...plugin.config,
	}))
}

async function togglePlugin(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	plugin_name: Plugins,
	enabled: boolean
): Promise<void> {
	try {
		const { error } = await supabase
			.from('plugins')
			.update({ 'config.enabled': enabled })
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('plugin_name', plugin_name)

		if (error) {
			throw error
		}
	} catch (error) {
		bunnyLog.error(
			`Error ${enabled ? 'enabling' : 'disabling'} ${plugin_name} plugin:`,
			error
		)
		throw error
	}
}

async function setPluginConfig(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	plugin_name: Plugins,
	config: object
): Promise<void> {
	const { error } = await supabase
		.from('plugins')
		.update({ config })
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('plugin_name', plugin_name)

	if (error) {
		throw error
	}
}

/**
 * @param {ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Guild['id']} guild_id - The ID of the guild.
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @returns
 */
async function getPluginConfig<T extends keyof DefaultConfigs>(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	plugin_name: T
): Promise<PluginResponse<DefaultConfigs[T]>> {
	const { data, error } = await supabase
		.from('plugins')
		.select('config')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('plugin_name', plugin_name)
		.single()

	if (error) {
		if (error.code === 'PGRST116') {
			const default_config = getDefaultConfig(plugin_name) as DefaultConfigs[T]
			await setPluginConfig(
				bot_id,
				guild_id,
				plugin_name as Plugins,
				default_config
			)
			return {
				id: plugin_name as Plugins,
				...default_config,
			} as PluginResponse<DefaultConfigs[T]>
		}
		throw error
	}

	return { id: plugin_name as Snowflake, ...data.config } as PluginResponse<
		DefaultConfigs[T]
	>
}

async function enablePlugin(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	plugin_name: Plugins
): Promise<void> {
	await togglePlugin(bot_id, guild_id, plugin_name, true)
}

async function disablePlugin(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	plugin_name: Plugins
): Promise<void> {
	await togglePlugin(bot_id, guild_id, plugin_name, false)
}

async function updatePluginConfig<T extends keyof DefaultConfigs>(
	bot_id: ClientUser['id'],
	guild_id: Guild['id'],
	plugin_name: T,
	config: DefaultConfigs[T]
): Promise<void> {
	try {
		const { error } = await supabase
			.from('plugins')
			.update({ config })
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('plugin_name', plugin_name)

		if (error) {
			throw error
		}

		bunnyLog.database('Plugin configuration updated successfully')
	} catch (error) {
		bunnyLog.error('Error updating plugin configuration:', error)
		throw error
	}
}

export {
	updateMissingPlugins,
	getPluginConfig,
	setPluginConfig,
	enablePlugin,
	disablePlugin,
	updatePluginConfig,
	togglePlugin,
	saveGuildPlugins,
}
