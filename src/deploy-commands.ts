import { REST } from '@discordjs/rest'
import { BunnyLogger } from 'bunny-log'
import { Routes } from 'discord-api-types/v10'
import { env } from 'node:process'

const { BOT_TOKEN, BOT_CLIENT_ID } = env
const bunLog = new BunnyLogger(false).hex('discord', '#5865f2')


if (!BOT_TOKEN || !BOT_CLIENT_ID) {
	bunLog.log('error', 'Missing BOT_TOKEN or CLIENT_ID in .env file')
	process.exit(1)
}

const commands = [
	{
		name: 'level',
		description: 'Manage user levels',
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'show',
				description: "Show a user's level",
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'User to check',
						required: false,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'set',
				description: 'Set user level (Admin only)',
				default_member_permissions: '0',
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'User to modify',
						required: true,
					},
					{
						type: 10, // NUMBER
						name: 'xp',
						description: 'XP value to set',
						required: true,
					},
					{
						type: 10, // NUMBER
						name: 'level',
						description: 'Level to set',
						required: true,
					},
				],
			},
		],
	},
	{
		name: 'eco',
		description: 'Manage the server economy',
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'balance',
				description: 'Check your balance',
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'The user to check balance for',
						required: false,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'pay',
				description: 'Pay another user',
				options: [
					{
						type: 6, // USER
						name: 'user',
						description: 'The user to pay',
						required: true,
					},
					{
						type: 10, // NUMBER
						name: 'amount',
						description: 'The amount to pay',
						required: true,
						min_value: 1,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'leaderboard',
				description: 'Show the wealth leaderboard',
			},
		],
	},
	{
		name: 'ticket',
		description: 'Manage the ticket system',
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'config',
				description: 'Configure ticket settings',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'manage',
				description: 'Manage tickets',
				options: [
					{
						type: 3, // STRING
						name: 'action',
						description: 'Action to perform on the ticket',
						required: true,
						choices: [
							{
								name: 'Close',
								value: 'close',
							},
							{
								name: 'Claim',
								value: 'claim',
							},
							{
								name: 'Join',
								value: 'join',
							},
							{
								name: 'Add User',
								value: 'add',
							},
							{
								name: 'Remove User',
								value: 'remove',
							},
						],
					},
					{
						type: 3, // STRING
						name: 'reason',
						description:
							'Reason for closing the ticket (when using close action)',
						required: false,
					},
					{
						type: 6, // USER
						name: 'user',
						description:
							'User to add or remove (when using add/remove actions)',
						required: false,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'list',
				description: 'List all active tickets',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'send_panel',
				description: 'Send a ticket panel in the specified channel',
				options: [
					{
						type: 7, // CHANNEL
						name: 'channel',
						description: 'The channel to send the ticket panel to',
						required: true,
					},
				],
			},
		],
	},
	{
		name: 'bday',
		description: 'Manage birthday information',
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'set',
				description: 'Set your birthday',
				options: [
					{
						type: 4, // INTEGER
						name: 'day',
						description: 'Birthday day (1-31)',
						required: true,
						min_value: 1,
						max_value: 31,
					},
					{
						type: 4, // INTEGER
						name: 'month',
						description: 'Birthday month (1-12)',
						required: true,
						min_value: 1,
						max_value: 12,
					},
					{
						type: 4, // INTEGER
						name: 'year',
						description: 'Birth year',
						required: true,
						min_value: new Date().getFullYear() - 100,
						max_value: new Date().getFullYear(),
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'show',
				description: 'Show your birthday information',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'remove',
				description: 'Remove your birthday information',
			},
		],
	},
	{
		name: 'music',
		description: 'Manage music playback',
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'play',
				description: 'Play a song',
				options: [
					{
						type: 3, // STRING
						name: 'query',
						description: 'url of the song to play',
						required: true,
					},
				],
			},
			{
				type: 1, // SUB_COMMAND
				name: 'pause',
				description: 'Pause the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'resume',
				description: 'Resume the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'skip',
				description: 'Skip the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'stop',
				description: 'Stop the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'queue',
				description: 'Show the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'clear',
				description: 'Clear the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'remove',
				description: 'Remove a song from the queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'shuffle',
				description: 'Shuffle the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'loop',
				description: 'Loop the current song queue',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'volume',
				description: 'Set the volume of the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'nowplaying',
				description: 'Show the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'lyrics',
				description: 'Show the lyrics of the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'search',
				description: 'Search for a song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'playlist',
				description: 'Manage your playlists',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'history',
				description: 'Show the history of the current song',
			},
			{
				type: 1, // SUB_COMMAND
				name: 'help',
				description: 'Show the help menu',
			},
		],
	},
	// 	name: 'plugin',
	// 	description: 'Manage your Minecraft account',
	// 	options: [

	// 		{
	// 			type: 1, // SUB_COMMAND
	// 			name: 'game',
	// 			description: 'Manage your game plugins',
	// 			options: [
	// 				{
	// 					type: 3, // STRING
	// 					name: 'minecraft',
	// 					description: 'The name of the game to manage',
	// 					required: true,
	// 				},
	// 			],
	// 		},
	// 		{
	// 			type: 1, // SUB_COMMAND
	// 			name: 'info',
	// 			description: 'Get info about a specified game plugin',
	// 			options: [
	// 				{
	// 					type: 3, // STRING
	// 					name: 'plugin_name',
	// 					description: 'The name of the game plugin to get info about',
	// 					required: true,
	// 				},
	// 			],
	// 		},
	// 	],
	// },
]

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN)
;(async () => {
	try {
		bunLog.log('discord', 'Started refreshing application (/) commands.')

		await rest.put(Routes.applicationCommands(BOT_CLIENT_ID), {
			body: commands,
		})

		bunLog.log('success', 'Successfully reloaded application (/) commands.')
	} catch (error) {
		bunLog.log('error', error)
	}
})()
