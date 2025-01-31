import { REST } from '@discordjs/rest'
import { bunnyLog } from 'bunny-log'
import { Routes } from 'discord-api-types/v10'
import { env } from 'node:process'

const { BOT_TOKEN, BOT_CLIENT_ID } = env

if (!BOT_TOKEN || !BOT_CLIENT_ID) {
	bunnyLog.error('Missing BOT_TOKEN or CLIENT_ID in .env file')
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
		name: 'send_embed',
		description: 'Send an embed message with buttons',
		options: [
			{
				type: 7, // Corresponds to the CHANNEL type
				name: 'channel',
				description: 'The channel to send the embed message to',
				required: true,
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
]

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN)
;(async () => {
	try {
		bunnyLog.info('Started refreshing application (/) commands.')

		await rest.put(Routes.applicationCommands(BOT_CLIENT_ID), {
			body: commands,
		})

		bunnyLog.success('Successfully reloaded application (/) commands.')
	} catch (error) {
		bunnyLog.error(error)
	}
})()
