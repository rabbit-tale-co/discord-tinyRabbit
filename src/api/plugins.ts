import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'
import supabase from '@/db/supabase.js'
import { TicketDisplayMode } from '@/types/plugins.js'
import type {
	API,
	ComponentsV2,
	TicketTemplates,
	TicketEmbedTemplates,
} from '@/types/plugins.js'
import type {
	PluginResponse,
	DefaultConfigs,
	Plugins,
} from '@/types/plugins.js'

// Define the ticket components structure using our type definitions
const createTicketComponents = (): TicketTemplates => {
	// Get embeds to integrate them in components
	const embeds = createTicketEmbeds()

	return {
		open_ticket: {
			type: TicketDisplayMode.Text, // Default display as text mode
			embed: embeds.open_ticket, // Include the embed for embed display mode
			components: [
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.TextDisplay, // TextDisplay
							text: '# 🎫 Support Tickets\n\nClick on the button below to open a support ticket.',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.Button, // Button
							customId: 'open_ticket_general',
							label: 'General Support',
							style: Discord.ButtonStyle.Primary,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		opened_ticket: {
			type: TicketDisplayMode.Text, // Default to text mode
			embed: embeds.opened_ticket, // Include embed for embed display mode
			components: [
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.TextDisplay, // TextDisplay
							text: '# 🎫 Ticket #{ticket_id} - {category}\n\n## 👋 Welcome {opened_by}!\n\nThank you for reaching out! A support representative will be with you shortly.\n\nPlease provide as much detail as possible to help us assist you better.\n\n---\n*You can close this ticket using the button below when your issue is resolved.*',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.Button, // Button
							customId: 'close_ticket',
							label: 'Close Ticket',
							style: Discord.ButtonStyle.Danger,
						} as API.Button,
						{
							type: Discord.ComponentType.Button, // Button
							customId: 'close_ticket_with_reason',
							label: 'Close with Reason',
							style: Discord.ButtonStyle.Danger,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		user_ticket: {
			type: TicketDisplayMode.Text,
			embed: embeds.user_ticket,
			components: [
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.TextDisplay, // TextDisplay
							text: '# 🎫 Ticket Created Successfully!\n\nYour ticket #{ticket_id} has been created.\n\nPlease click here to view: {channel_id}',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		closed_ticket: {
			type: TicketDisplayMode.Text,
			embed: embeds.closed_ticket,
			components: [
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.TextDisplay, // TextDisplay
							text: '# ✅ Ticket Closed\n\nThis ticket has been closed by {closed_by}.\n\n## 📝 Resolution\n> **Reason:** {reason}\n> **Closed at:** {close_time}\n\nThank you for using our support system!',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		confirm_close_ticket: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# ❓ Close Confirmation\n\nPlease confirm that you want to close this ticket.\n\n*This action will lock the thread and save a transcript.*',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.Button,
							customId: 'confirm_close_ticket',
							label: 'Confirm Close',
							style: Discord.ButtonStyle.Success,
						} as API.Button,
						{
							type: Discord.ComponentType.Button,
							customId: 'cancel_close_ticket',
							label: 'Cancel',
							style: Discord.ButtonStyle.Secondary,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		admin_ticket: {
			type: TicketDisplayMode.Text,
			embed: embeds.admin_ticket,
			components: [
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.TextDisplay, // TextDisplay
							text: '# 📬 New Ticket - #{ticket_id}\n\n## Ticket Information\n**Opened by:** {opened_by}\n**Category:** {category}\n**Claimed by:** {claimed_by}\n\n*Click the buttons below to manage this ticket*',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.Button, // Button
							customId: 'claim_ticket',
							label: 'Claim Ticket',
							style: Discord.ButtonStyle.Primary,
						} as API.Button,
						{
							type: Discord.ComponentType.Button, // Button
							customId: 'join_ticket',
							label: 'Join Ticket',
							style: Discord.ButtonStyle.Secondary,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		transcript: {
			type: TicketDisplayMode.Text,
			embed: embeds.transcript,
			components: [
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.TextDisplay, // TextDisplay
							text: '# 🎫 Ticket #{ticket_id} - {category}\n\n## 📋 Ticket Information\n> **Opened by:** {opened_by}\n> **Opened at:** {open_time}\n\n## 👥 Handling\n> **Claimed by:** {claimed_by}\n> **Closed by:** {closed_by}\n> **Closed at:** {close_time}\n\n## 📝 Resolution\n> **Reason:** {reason}\n> **Rating:** {rating}\n\n---\n*Click the button below to view the full ticket conversation:*',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
				{
					type: Discord.ComponentType.ActionRow, // ActionRow
					components: [
						{
							type: Discord.ComponentType.Button, // Button
							customId: 'open_thread',
							label: 'View Ticket',
							style: Discord.ButtonStyle.Link,
							url: 'https://discord.com/channels/{guild_id}/{thread_id}',
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		inactivity_notice: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# ⏰ Ticket Auto-Closed\n\nThis ticket has been automatically closed due to inactivity.\n\nIf you still need assistance, please open a new ticket.\n\n---\n*{reason}*',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		rating_survey: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# 📊 Support Ticket Feedback\n\nThanks for using our support system! Your ticket #{ticket_id} has been closed.\n\n## Please rate your experience:\n\n_Your feedback helps us improve our support services._',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		ticket_claimed: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# 🛡️ Ticket Claimed\n\n{claimed_by} has claimed this ticket and will be assisting you.',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		close_confirmation: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# ✅ Ticket Closed\n\nThis ticket has been closed by {closed_by}.',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		close_reason_modal: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# 📝 Close Reason\n\nPlease provide a reason for closing this ticket:',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		no_permission: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: "# ⛔ Access Denied\n\nYou don't have permission to perform this action. Only moderators or the ticket opener can perform this action.",
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		auto_close_warning: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# ⚠️ Inactivity Warning\n\nThis ticket has been inactive for some time. It will be automatically closed after {threshold} of inactivity.\n\nPlease respond if you still need assistance.',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
	}
}

function createTicketEmbeds() {
	return {
		open_ticket: {
			title: 'Click to open a ticket',
			description:
				'Click on the button corresponding to the type of ticket you wish to open',
			color: 2336090, // #23a55a - green
			buttons_map: [
				{
					unique_id: 'open_ticket_general',
					label: 'General Support',
					style: Discord.ButtonStyle.Primary,
				},
			],
		},
		user_ticket: {
			title: 'Ticket Opened',
			description: 'A new ticket: {channel_id} has been opened.',
			color: 2336090, // #23a55a - green
		},
		opened_ticket: {
			description:
				'Thank you for reaching out! {opened_by} A support representative will be with you shortly. \n\nPlease provide as much detail as possible to help us assist you better.',
			color: 2336090, // #23a55a - green
			buttons_map: [
				{
					unique_id: 'close_ticket',
					label: 'Close Ticket',
					style: Discord.ButtonStyle.Danger,
				},
				{
					unique_id: 'close_ticket_with_reason',
					label: 'Close Ticket with Reason',
					style: Discord.ButtonStyle.Danger,
				},
			],
		},
		confirm_close_ticket: {
			title: 'Close Confirmation',
			description: 'Please confirm that you want to close this ticket.',
			color: 2336090, // #23a55a - green
			buttons_map: [
				{
					unique_id: 'confirm_close_ticket',
					label: 'Confirm Close',
					style: Discord.ButtonStyle.Success,
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
				},
				{
					unique_id: 'join_ticket',
					label: 'Join Ticket',
					style: Discord.ButtonStyle.Secondary,
				},
			],
		},
		transcript: {
			title: 'Ticket Closed',
			color: Discord.Colors.Red,
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
					name: 'Claimed By',
					value: '{claimed_by}',
					inline: true,
				},
				{
					name: 'Rating',
					value: '{rating}',
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
					url: 'https://discord.com/channels/{guild_id}/{thread_id}',
				},
			],
			footer: {
				text: '{close_time}',
			},
		},
	}
}

const createWelcomeGoodbyeComponents = () => {
	return {
		welcome: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# 👋 Welcome to the server!\n\nWe are glad to have you here. Enjoy your stay!',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
		goodbye: {
			type: TicketDisplayMode.Text,
			components: [
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							text: '# 👋 Goodbye!\n\nWe hope to see you again soon!',
						} as unknown as API.TextDisplay,
					],
				} as API.ActionRow,
			],
		},
	}
}

const default_configs: DefaultConfigs = {
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
		auto_close: [
			{
				enabled: false,
				threshold: 72 * 60 * 60 * 1000, //72 hours
				reason:
					'Tickets are automatically closed after {threshold} of inactivity to help us manage support requests efficiently.',
			},
		],
		components: createTicketComponents(),
		// embeds: createTicketEmbeds(),
		counter: 1,
		mods_role_ids: [],
		role_time_limits: [],
	},
	welcome_goodbye: {
		enabled: false,
		type: 'text',
		welcome_channel_id: null,
		leave_channel_id: null,
		components: createWelcomeGoodbyeComponents(),
		embed_welcome: {
			title: '{username} has joined the server!',
			description: 'We are glad to have you here. Enjoy your stay!',
			color: 5793266,
			thumbnail: {
				url: '{avatar}',
			},
		},
		embed_leave: {
			title: '{username} has left the server!',
			color: 5793266,
			thumbnail: {
				url: '{avatar}',
			},
		},
		join_role_ids: [],
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
	economy: {
		enabled: false,
		currency_name: 'Coins',
		currency_symbol: '💰',
		currency_emoji: '💰',
		is_custom_emoji: false,
		starting_balance: 100,
		multipliers: {
			enabled: true,
			default: 1,
			roles: [],
		},
		leaderboard: {
			enabled: true,
			channel_id: null,
			update_interval: 60,
			top_count: 10,
		},
	},
}

/**
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @returns {Plugins} - The plugin name.
 */
function getDefaultConfig(plugin_name: keyof DefaultConfigs): Plugins {
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
		name: keyof DefaultConfigs
		config: DefaultConfigs[keyof DefaultConfigs]
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
						(plugin) => plugin.id === (plugin_name as keyof DefaultConfigs)
					)
			)

			if (missing_plugins.length > 0) {
				await saveGuildPlugins(
					client,
					guild.id,
					missing_plugins.map((plugin_name) => ({
						name: plugin_name as keyof DefaultConfigs,
						config: default_configs[plugin_name as keyof DefaultConfigs],
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
): Promise<PluginResponse<DefaultConfigs[keyof DefaultConfigs]>[]> {
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
	plugin_name: Plugins,
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
	plugin_name: Plugins,
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
async function getPluginConfig<T extends keyof DefaultConfigs>(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: T
): Promise<PluginResponse<DefaultConfigs[T]>> {
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
			const default_config = getDefaultConfig(plugin_name) as DefaultConfigs[T]
			await setPluginConfig(
				bot_id,
				guild_id,
				plugin_name as Plugins,
				default_config
			)

			// Log the success
			bunnyLog.database(
				`Initialized missing plugin ${plugin_name} for guild ${guild_id}`
			)

			// Return the default config
			return {
				id: plugin_name as Plugins,
				...default_config,
			} as PluginResponse<DefaultConfigs[T]>
		}
		throw error
	}

	// Return the plugin configuration
	return {
		id: plugin_name as Plugins,
		...data.config,
	} as PluginResponse<DefaultConfigs[T]>
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Plugins} plugin_name - The name of the plugin.
 */
async function enablePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: Plugins
): Promise<void> {
	await togglePlugin(bot_id, guild_id, plugin_name, true)
}

async function disablePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: Plugins
): Promise<void> {
	await togglePlugin(bot_id, guild_id, plugin_name, false)
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @param {object} config - The configuration object.
 */
async function updatePluginConfig<T extends keyof DefaultConfigs>(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: T,
	config: DefaultConfigs[T]
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

/**
 * Migrates legacy ticket embed configurations to the new component-based format
 * @param bot_id - The ID of the bot
 * @param guild_id - The ID of the guild to migrate
 * @returns A promise that resolves when the migration is complete
 */
async function migrateTicketEmbeds(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id']
): Promise<boolean> {
	try {
		// Get the current ticket plugin configuration
		const ticketConfig = await getPluginConfig(bot_id, guild_id, 'tickets')

		// If there's no embeds property or it's empty, there's nothing to migrate
		if (!ticketConfig.embeds) {
			bunnyLog.info('No legacy embeds found to migrate', {
				guild_id,
				bot_id,
			})
			return false
		}

		// Initialize the components property if it doesn't exist
		if (!ticketConfig.components) {
			ticketConfig.components = {} as TicketTemplates
		}

		// Migration flag to track if any changes were made
		let migrated = false

		// List of template keys to migrate
		const templateKeys = [
			'open_ticket',
			'opened_ticket',
			'user_ticket',
			'closed_ticket',
			'confirm_close_ticket',
			'admin_ticket',
			'transcript',
		] as const

		// Migrate each template that has a legacy embed configuration
		for (const key of templateKeys) {
			if (ticketConfig.embeds[key] && !ticketConfig.components[key]) {
				// Create a new component-based template that preserves the embed
				ticketConfig.components[key] = {
					type: TicketDisplayMode.Embed, // Keep the embed type to display as an embed
					embed: ticketConfig.embeds[key], // Include the original embed
					components: [], // Initialize with empty components
				}

				// Convert buttons_map to component-based buttons if they exist
				if (ticketConfig.embeds[key].buttons_map?.length) {
					// For each button in the embed's button map, create a component
					const actionRow: API.ActionRow = {
						type: Discord.ComponentType.ActionRow,
						components: [],
					}

					for (const button of ticketConfig.embeds[key].buttons_map) {
						actionRow.components.push({
							type: Discord.ComponentType.Button,
							customId: button.unique_id,
							label: button.label,
							style: button.style,
							url: button.url,
							disabled: button.disabled,
						} as API.Button)
					}

					ticketConfig.components[key].components.push(actionRow)
				}

				migrated = true
				bunnyLog.info(`Migrated ${key} template to component-based format`, {
					guild_id,
					template: key,
				})
			}
		}

		// If migrations were performed, update the config
		if (migrated) {
			// Set the display_type if not already set, default to 'embed'
			// This ensures existing embeds continue to display as embeds
			if (!ticketConfig.display_type) {
				ticketConfig.display_type = TicketDisplayMode.Embed
			}

			// Update the config in the database
			await updatePluginConfig(bot_id, guild_id, 'tickets', ticketConfig)

			bunnyLog.info(
				'Successfully migrated ticket embeds to component-based format',
				{
					guild_id,
				}
			)

			return true
		}

		bunnyLog.info('No ticket embeds needed migration', { guild_id })
		return false
	} catch (error) {
		bunnyLog.error('Error migrating ticket embeds', {
			guild_id,
			error,
		})
		return false
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
	migrateTicketEmbeds,
}
