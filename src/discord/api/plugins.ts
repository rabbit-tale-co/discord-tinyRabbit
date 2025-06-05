import * as Discord from 'discord.js'
import {
	DatabaseLogger,
	PluginLogger,
	StatusLogger,
} from '@/utils/bunnyLogger.js'
import supabase from '@/db/supabase.js'
import type { API, TicketTemplates, ComponentsV2 } from '@/types/plugins.js'
import type {
	PluginResponse,
	DefaultConfigs,
	Plugins,
} from '@/types/plugins.js'
import type {
	SectionComponent,
	TextDisplayComponent,
	SeparatorComponent,
} from 'discord.js'

// Define the ticket components structure using our type definitions
const createTicketComponents = (): TicketTemplates => {
	return {
		open_ticket: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 🎫 Support Tickets',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Click on the button below to open a support ticket.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.Button,
							custom_id: 'open_ticket_general',
							label: 'General Support',
							style: Discord.ButtonStyle.Primary,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		opened_ticket: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 🎫 Ticket #{ticket_id} - {topic}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '**👋 Welcome {display_name}!**',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Small,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Thank you for reaching out! A support representative will be with you shortly.\nPlease provide as much detail as possible to help us assist you better.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '-# You can close this ticket using the button below when your issue is resolved.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.Button,
							custom_id: 'close_ticket:{thread_id}',
							label: 'Close',
							style: Discord.ButtonStyle.Danger,
						} as API.Button,
						{
							type: Discord.ComponentType.Button,
							custom_id: 'close_ticket_reason:{thread_id}',
							label: 'Close With Reason',
							style: Discord.ButtonStyle.Danger,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		user_ticket: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 🎫 Ticket Created Successfully!',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Your ticket #{ticket_id} has been created.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Please click here to view: {channel_id}',
				} as unknown as API.TextDisplay,
			],
		},
		closed_ticket: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## ✅ Ticket Closed',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'This ticket has been closed by {closed_by}.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 📝 Resolution',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '> **Reason:** {reason}\n> **Closed at:** {close_time}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Thank you for using our support system!',
				} as unknown as API.TextDisplay,
			],
		},
		confirm_close_ticket: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## ❓ Close Confirmation',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '⚠️ **Are you sure you want to close this ticket?**',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '-# This action cannot be undone. The ticket will be archived and locked.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.Button,
							custom_id: 'confirm_close:{thread_id}',
							label: 'Yes',
							style: Discord.ButtonStyle.Success,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		admin_ticket: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 📬 New Ticket - #{ticket_id}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '{mod_ping}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '**Ticket Information**',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '>>> **Opened by:** {opened_by}\n**Topic:** {topic}\n**Claimed by:** {claimed_by}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '-# Click the buttons below to manage this ticket',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.Button,
							label: 'Claim Ticket',
							style: Discord.ButtonStyle.Primary,
							custom_id: 'claim_ticket:{thread_id}',
						} as API.Button,
						{
							type: Discord.ComponentType.Button,
							label: 'Join Ticket',
							style: Discord.ButtonStyle.Secondary,
							custom_id: 'join_ticket:{thread_id}',
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		transcript: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 🎟️ Ticket #{ticket_id} - {category}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '📌 **Ticket Information**',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '>>>🔹 **Opened by:** {opened_by}\n🕒 **Opened at:** {open_time}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Small,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '📥 **Handling:**',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '>>> 🔖 **Claimed by:** {claimed_by}\n🔒 **Closed by:** {closed_by}\n📅 **Closed at:** {close_time}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Small,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '✅ **Resolution Details:**',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '>>> ✏️ **Reason:** {reason}\n⭐ **Rating:** {rating}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Small,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '-# Click the button below to view the full ticket conversation:',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.Button,
							custom_id: 'open_thread',
							label: 'Open Thread',
							style: Discord.ButtonStyle.Link,
							url: 'https://discord.com/channels/{guild_id}/{thread_id}',
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		inactivity_notice: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## ⏰ Ticket Auto-Closed',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'This ticket has been automatically closed due to inactivity.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '*{reason}*',
				} as unknown as API.TextDisplay,
			],
		},
		rating_survey: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 📊 Support Ticket Feedback',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Thanks for using our support system! Your ticket #{ticket_id} has been closed.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '**Please rate your experience:**',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '-# Your feedback helps us improve our support services.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.ActionRow,
					components: [
						{
							type: Discord.ComponentType.Button,
							custom_id: '{rate_1_custom_id}',
							label: '⭐ 1',
							style: Discord.ButtonStyle.Danger,
						} as API.Button,
						{
							type: Discord.ComponentType.Button,
							custom_id: '{rate_2_custom_id}',
							label: '⭐ 2',
							style: Discord.ButtonStyle.Danger,
						} as API.Button,
						{
							type: Discord.ComponentType.Button,
							custom_id: '{rate_3_custom_id}',
							label: '⭐ 3',
							style: Discord.ButtonStyle.Secondary,
						} as API.Button,
						{
							type: Discord.ComponentType.Button,
							custom_id: '{rate_4_custom_id}',
							label: '⭐ 4',
							style: Discord.ButtonStyle.Success,
						} as API.Button,
						{
							type: Discord.ComponentType.Button,
							custom_id: '{rate_5_custom_id}',
							label: '⭐ 5',
							style: Discord.ButtonStyle.Success,
						} as API.Button,
					],
				} as API.ActionRow,
			],
		},
		ticket_claimed: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 🛡️ Ticket Claimed',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '{claimed_by} has claimed this ticket and will be assisting you.',
				} as unknown as API.TextDisplay,
			],
		},
		close_confirmation: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## ✅ Ticket Closed',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'This ticket has been closed by {closed_by}.',
				} as unknown as API.TextDisplay,
			],
		},
		close_reason_modal: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## 📝 Close Reason',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Please provide a reason for closing this ticket:',
				} as unknown as API.TextDisplay,
			],
		},
		no_permission: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## ⛔ Access Denied',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: "You don't have permission to perform this action. Only moderators or the ticket opener can perform this action.",
				} as unknown as API.TextDisplay,
			],
		},
		auto_close_warning: {
			components: [
				{
					type: Discord.ComponentType.TextDisplay,
					text: '## ⚠️ Inactivity Warning',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '{user}, this ticket has been inactive for some time. It will be automatically closed {threshold} due to inactivity.',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: '**Auto-close time:** {close_time}',
				} as unknown as API.TextDisplay,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Small,
				} as unknown as API.Separator,
				{
					type: Discord.ComponentType.TextDisplay,
					text: 'Please respond if you still need assistance.',
				} as unknown as API.TextDisplay,
			],
		},
	}
}

const createWelcomeGoodbyeComponents = () => {
	return {
		welcome: {
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

const createBirthdayComponents = () => {
	return {
		celebration_message: {
			components: [
				{
					type: Discord.ComponentType.Section,
					components: [
						{
							type: Discord.ComponentType.TextDisplay,
							content: '## 🎂 Birthday Celebration!',
						} as unknown as TextDisplayComponent,
						{
							type: Discord.ComponentType.TextDisplay,
							content:
								"Today we celebrate {user}'s birthday!\n\n*Wishing you a fantastic day filled with joy and happiness!* ✨",
						} as unknown as TextDisplayComponent,
					],
					accessory: {
						type: Discord.ComponentType.Thumbnail,
						media: {
							url: '{user_avatar}',
						},
					},
				} as unknown as SectionComponent,
				{
					type: Discord.ComponentType.Separator,
					divider: false,
					spacing: Discord.SeparatorSpacingSize.Large,
				} as unknown as SeparatorComponent,
				{
					type: Discord.ComponentType.TextDisplay,
					content:
						'🎁 **Next Birthday**: <t:{next_birthday}:D> (<t:{next_birthday}:R>)',
				} as unknown as TextDisplayComponent,
			] as ComponentsV2[],
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
		counter: 1,
		mods_role_ids: [],
		role_time_limits: {
			included: [],
			excluded: [],
		},
	},
	welcome_goodbye: {
		enabled: false,
		welcome_channel_id: null,
		leave_channel_id: null,
		components: createWelcomeGoodbyeComponents(),
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
		components: createBirthdayComponents(),
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
 * @returns {DefaultConfigs[keyof DefaultConfigs]} - The plugin configuration.
 */
function getDefaultConfig<T extends keyof DefaultConfigs>(
	plugin_name: T
): DefaultConfigs[T] {
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
	} catch (error) {
		DatabaseLogger.error(
			`Error saving guild plugins: ${error instanceof Error ? error.message : String(error)}`
		)
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

	// Only log if there were actual updates, otherwise it's just noise
	if (updatedCount > 0) {
		DatabaseLogger.connect()
	}
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
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @param {boolean} enabled - Whether the plugin is enabled.
 */
async function togglePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: keyof DefaultConfigs,
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
		PluginLogger.error(
			String(plugin_name),
			error instanceof Error ? error : new Error(String(error))
		)
		throw error
	}
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 * @param {object} config - The configuration object.
 */
async function setPluginConfig<T extends keyof DefaultConfigs>(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: T,
	config: DefaultConfigs[T]
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
	try {
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
			// If the error is because the plugin doesn't exist, return the default config
			// without saving it to the database (initialization should only happen at bot start)
			if (error.code === 'PGRST116') {
				const default_config = getDefaultConfig(
					plugin_name
				) as DefaultConfigs[T]
				StatusLogger.warn(
					`Plugin ${plugin_name} not found for guild ${guild_id}, using default config`
				)
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
	} catch (error) {
		PluginLogger.error(
			String(plugin_name),
			error instanceof Error ? error : new Error(String(error))
		)
		// Return default config as fallback
		const default_config = getDefaultConfig(plugin_name) as DefaultConfigs[T]
		return {
			id: plugin_name as Plugins,
			...default_config,
		} as PluginResponse<DefaultConfigs[T]>
	}
}

/**
 * @param {Discord.ClientUser['id']} bot_id - The ID of the bot user.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {keyof DefaultConfigs} plugin_name - The name of the plugin.
 */
async function enablePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: keyof DefaultConfigs
): Promise<void> {
	await togglePlugin(bot_id, guild_id, plugin_name, true)
}

async function disablePlugin(
	bot_id: Discord.ClientUser['id'],
	guild_id: Discord.Guild['id'],
	plugin_name: keyof DefaultConfigs
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
		StatusLogger.success('Plugin configuration updated successfully')
	} catch (error) {
		PluginLogger.error(
			String(plugin_name),
			error instanceof Error ? error : new Error(String(error))
		)
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
			StatusLogger.info('No legacy embeds found to migrate')
			return false
		}

		// Initialize the components property if it doesn't exist
		if (!ticketConfig.components) {
			ticketConfig.components = {} as TicketTemplates
		}

		// Migration flag to track if any changes were made
		let migrated = false

		// Since Discord no longer uses legacy embeds, we'll remove the embeds property
		// and ensure components are properly initialized
		if (ticketConfig.embeds) {
			// Remove the legacy embeds property using destructuring
			const { embeds, ...cleanConfig } = ticketConfig

			// Update the ticketConfig to the clean version
			Object.assign(ticketConfig, cleanConfig)

			migrated = true
			StatusLogger.info(
				'Removed legacy embeds property from ticket configuration'
			)
		}

		// If migrations were performed, update the config
		if (migrated) {
			// Update the config in the database
			await updatePluginConfig(bot_id, guild_id, 'tickets', ticketConfig)

			StatusLogger.success(
				'Successfully migrated ticket configuration to remove legacy embeds'
			)
			return true
		}

		StatusLogger.info('No ticket embeds needed migration')
		return false
	} catch (error) {
		StatusLogger.error(
			`Error migrating ticket embeds: ${error instanceof Error ? error.message : String(error)}`
		)
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
