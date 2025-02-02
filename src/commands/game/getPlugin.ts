import * as Discord from 'discord.js'
import { getGamePluginInfo } from '@/api/gamePlugins.js'
import { bunnyLog } from 'bunny-log'

export const data = new Discord.SlashCommandBuilder()
	.setName('plugin')
	.setDescription('Manage game plugins')
	.addSubcommand((subcommand) =>
		subcommand
			.setName('get')
			.setDescription('Get info about a specified game plugin')
			.addStringOption((option) =>
				option
					.setName('plugin_name')
					.setDescription('Name of the game plugin (e.g. minecraft)')
					.setRequired(true)
			)
	)

export async function execute(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	// Retrieve plugin_name option value
	const pluginName = interaction.options.getString('plugin_name')
	try {
		// Get game plugin info via the game plugin API
		const pluginInfo = await getGamePluginInfo(pluginName)
		await interaction.reply({
			content: `Game plugin "${pluginName}" information:\n\`\`\`json\n${JSON.stringify(
				pluginInfo,
				null,
				2
			)}\n\`\`\``,
			ephemeral: false,
		})
	} catch (error) {
		bunnyLog.error('Error fetching game plugin information:', error)
		await interaction.reply({
			content: 'Failed to fetch game plugin information.',
			ephemeral: true,
		})
	}
}
