import type * as Types from '@/types/plugins.js'
import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '@/db/supabase.js'

const default_configs: Types.DefaultConfigs = {
	levels: {
		enabled: false,
		reward_message: 'Congratulations, you have leveled up to level {level}!',
		channel_id: null, // TODO:change to reward_channel_id
		command_channel_id: null,
		reward_roles: [],
		boost_3x_roles: [],
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
				color: Discord.Colors.Blurple,
				buttons_map: [
					{
						unique_id: 'open_ticket_general',
						label: 'General Support',
						style: Discord.ButtonStyle.Primary,
						type: Discord.ComponentType.Button,
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
						style: Discord.ButtonStyle.Danger,
						type: Discord.ComponentType.Button,
					},
					{
						unique_id: 'close_ticket_with_reason',
						label: 'Close Ticket with Reason',
						style: Discord.ButtonStyle.Danger,
						type: Discord.ComponentType.Button,
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
						style: Discord.ButtonStyle.Success,
						type: Discord.ComponentType.Button,
					},
				],
			},
			closed_ticket: {
				title: 'Ticket Closed',
				description: 'The ticket was closed by {closed_by}.',
				color: Discord.Colors.Red,
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
				color: Discord.Colors.Blurple,
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
						style: Discord.ButtonStyle.Primary,
						type: Discord.ComponentType.Button,
					},
					{
						unique_id: 'join_ticket',
						label: 'Join Ticket',
						style: Discord.ButtonStyle.Secondary,
						type: Discord.ComponentType.Button,
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
						style: Discord.ButtonStyle.Link,
						type: Discord.ComponentType.Button,
						url: 'https://discord.com/channels/{guild_id}/{thread_id}',
					},
				],
				footer: '{close_time}',
			},
		},
		counter: 1,
		mods_role_ids: [],
	},
	welcome_goodbye: {
		enabled: false,
		type: 'text',
		welcome_message: 'Welcome to the server! {user}',
		welcome_channel_id: null,
		leave_message: null,
		leave_channel_id: null,
		embed_welcome: {
			title: '{username} has joined the server!',
			description: 'We are glad to have you here. Enjoy your stay!',
			color: Discord.Colors.Blurple,
			thumbnail: {
				url: '{avatar}',
			},
		},
		embed_leave: {
			title: '{username} has left the server!',
			color: Discord.Colors.Blurple,
			thumbnail: {
				url: '{avatar}',
			},
		},
		join_role_ids: [], // TODO:change to join_role_ids
	},
	starboard: {
		enabled: false,
		emojis: ['⭐'], // TODO:change to emojis
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
		title: "{display_name}'s VC",
		channel_id: null,
		durations: [],
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
	moderation: {
		enabled: false,
		watch_roles: [],
		ban_interval: 60, // Check every hour
		delete_message_days: 7,
	},
	music: {
		enabled: false,
		channel_id: null,
		role_id: null,
	},
}

/**
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @returns {Plugins} - The plugin name.
 */
function getDefaultConfig(
	plugin_name: keyof Types.DefaultConfigs
): Types.Plugins {
	return default_configs[plugin_name]
}

/**
 * @param {Discord.Client} client - The Discord client object.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Array<{name: keyof DefaultConfigs, config: DefaultConfigs[keyof DefaultConfigs]}>} plugins - The plugins to save.
 */
async function saveGuildPlugins(
	client: Discord.Client,
	guild_id: Discord.Guild['id'],
	plugins: Array<{
		name: keyof Types.DefaultConfigs
		config: Types.DefaultConfigs[keyof Types.DefaultConfigs]
	}>
) {
	try {
		// Fetch the guild from Discord
		const guild = await client.guilds.fetch(guild_id)

		// Check if the guild exists
		if (!guild) {
			throw new Error(`Guild not found for ID: ${guild_id}`)
		}

		// Get the guild name and bot ID
		const guild_name = guild.name
		const bot_id = client.user?.id

		// Check if the bot ID is undefined
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

		// Check if there is an error fetching the guild
		if (guildError && guildError.code !== 'PGRST116') {
			throw guildError
		}

		// If guild doesn't exist, add it
		if (!guildExists) {
			// Insert the guild into the database
			const { error: insertGuildError } = await supabase
				.from('guilds')
				.insert({ bot_id: bot_id, guild_id: guild_id, guild_name: guild_name })

			// Check if there is an error inserting the guild
			if (insertGuildError) throw insertGuildError
		} else {
			// If guild exists, update the name in case it has changed
			const { error: updateGuildError } = await supabase
				.from('guilds')
				.update({ guild_name: guild_name })
				.eq('bot_id', bot_id)
				.eq('guild_id', guild_id)

			// Check if there is an error updating the guild
			if (updateGuildError) throw updateGuildError
		}

		// Save plugins
		const pluginData = plugins.map((plugin) => ({
			bot_id: bot_id,
			guild_id: guild_id,
			plugin_name: plugin.name,
			config: plugin.config,
		}))

		// Insert the plugins into the database
		const { error: pluginError } = await supabase
			.from('plugins')
			.upsert(pluginData)

		// Check if there is an error inserting the plugins
		if (pluginError) throw pluginError

		// Log the success
		// bunnyLog.database(
		// 	`Plugins saved successfully for guild ${guild_name} (${guild_id})`
		// )
	} catch (error) {
		bunnyLog.error('Error saving guild plugins:', error)
		throw error
	}
}

/**
 * @param {Discord.Client} client - The Discord client object.
 */
async function updateMissingPlugins(client: Discord.Client): Promise<void> {
	// Get the guilds
	const guilds = client.guilds.cache

	// Process each guild concurrently and return 1 if plugins were initialized, 0 otherwise.
	const updateResults = await Promise.all(
		[...guilds.values()].map(async (guild) => {
			const current_plugins = await getGuildPlugins(client.user.id, guild.id)
			const missing_plugins = Object.keys(default_configs).filter(
				(plugin_name) =>
					!current_plugins.some(
						(plugin) =>
							plugin.id === (plugin_name as keyof Types.DefaultConfigs)
					)
			)

			if (missing_plugins.length > 0) {
				await saveGuildPlugins(
					client,
					guild.id,
					missing_plugins.map((plugin_name) => ({
						name: plugin_name as keyof Types.DefaultConfigs,
						config: default_configs[plugin_name as keyof Types.DefaultConfigs],
					}))
				)
				return 1
			}
			return 0
		})
	)

	// Aggregate the results and log a single summary line.
	const updatedCount = updateResults.reduce((sum, curr) => sum + curr, 0)
	bunnyLog.database(`Initialized missing plugins for ${updatedCount} guild(s)`)
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @returns {Promise<PluginResponse<DefaultConfigs[keyof DefaultConfigs]>[]>} - The plugins.
 */
export async function getGuildPlugins(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id']
): Promise<
	Types.PluginResponse<Types.DefaultConfigs[keyof Types.DefaultConfigs]>[]
> {
	// Get the plugins from the database
	const { data, error } = await supabase
		.from('plugins')
		.select('*')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)

	// Check if there is an error fetching the plugins
	if (error) {
		throw error
	}

	// Return the plugins
	return data.map((plugin) => ({
		id: plugin.plugin_name,
		...plugin.config,
	}))
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Plugins} plugin_name - The name of the plugin.
 * @param {boolean} enabled - Whether the plugin is enabled.
 */
async function togglePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: Types.Plugins,
	enabled: boolean
): Promise<void> {
	try {
		// First get the current plugin config
		const { data, error: fetchError } = await supabase
			.from('plugins')
			.select('config')
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('plugin_name', plugin_name)
			.single()

		if (fetchError) {
			throw fetchError
		}

		// Update the enabled property in the config
		const updatedConfig = { ...data.config, enabled }

		// Update the entire config object
		const { error } = await supabase
			.from('plugins')
			.update({ config: updatedConfig })
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('plugin_name', plugin_name)

		// Check if there is an error updating the plugin
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

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Plugins} plugin_name - The name of the plugin.
 * @param {object} config - The configuration object.
 */
async function setPluginConfig(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: Types.Plugins,
	config: object
): Promise<void> {
	// Update the plugin in the database
	const { error } = await supabase
		.from('plugins')
		.update({ config })
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('plugin_name', plugin_name)

	// Check if there is an error updating the plugin
	if (error) {
		throw error
	}
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @returns {Promise<PluginResponse<DefaultConfigs[T]>>} - The plugin configuration.
 */
async function getPluginConfig<T extends keyof Types.DefaultConfigs>(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: T
): Promise<Types.PluginResponse<Types.DefaultConfigs[T]>> {
	// Get the plugin configuration from the database
	const { data, error } = await supabase
		.from('plugins')
		.select('config')
		.eq('bot_id', bot_id)
		.eq('guild_id', guild_id)
		.eq('plugin_name', plugin_name)
		.single()

	// Check if there is an error fetching the plugin
	if (error) {
		// If the error is because the plugin doesn't exist, set the default config
		if (error.code === 'PGRST116') {
			const default_config = getDefaultConfig(
				plugin_name
			) as Types.DefaultConfigs[T]
			await setPluginConfig(
				bot_id,
				guild_id,
				plugin_name as Types.Plugins,
				default_config
			)

			// Log the success
			bunnyLog.database(
				`Initialized missing plugin ${plugin_name} for guild ${guild_id}`
			)

			// Return the default config
			return {
				id: plugin_name as Types.Plugins,
				...default_config,
			} as Types.PluginResponse<Types.DefaultConfigs[T]>
		}
		throw error
	}

	// Return the plugin configuration
	return {
		id: plugin_name as Types.Plugins,
		...data.config,
	} as Types.PluginResponse<Types.DefaultConfigs[T]>
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Plugins} plugin_name - The name of the plugin.
 */
async function enablePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: Types.Plugins
): Promise<void> {
	await togglePlugin(bot_id, guild_id, plugin_name, true)
}

async function disablePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: Types.Plugins
): Promise<void> {
	await togglePlugin(bot_id, guild_id, plugin_name, false)
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @param {object} config - The configuration object.
 */
async function updatePluginConfig<T extends keyof Types.DefaultConfigs>(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: T,
	config: Types.DefaultConfigs[T]
): Promise<void> {
	try {
		// Update the plugin in the database
		const { error } = await supabase
			.from('plugins')
			.update({ config })
			.eq('bot_id', bot_id)
			.eq('guild_id', guild_id)
			.eq('plugin_name', plugin_name)

		// Check if there is an error updating the plugin
		if (error) {
			throw error
		}

		// Log the success
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
