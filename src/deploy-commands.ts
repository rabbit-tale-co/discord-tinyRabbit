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
		description: 'Shows the XP level of a user',
		options: [
			{
				type: 6, // Corresponds to the USER type
				name: 'user',
				description: 'The user whose XP level you want to check',
				required: false,
			},
		],
	},
	{
		name: 'set_level',
		description: 'Sets the XP level of a user (Admin only)',
		options: [
			{
				type: 6, // USER type
				name: 'user',
				description: 'The user whose XP level you want to set',
				required: true,
			},
			{
				type: 10, // NUMBER type
				name: 'xp',
				description: 'The amount of XP to set for the user',
				required: true,
			},
			{
				type: 10, // NUMBER type
				name: 'level',
				description: 'The level to set for the user',
				required: true,
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
		description: 'Set your birthday',
		options: [
			{
				type: 4, // INTEGER type
				name: 'day',
				description: 'Day of your birthday',
				required: true,
			},
			{
				type: 4, // INTEGER type
				name: 'month',
				description: 'Month of your birthday',
				required: true,
			},
			{
				type: 4, // INTEGER type
				name: 'year',
				description: 'Year of your birthday',
				required: true,
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
