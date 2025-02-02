import * as Discord from 'discord.js'
import { bunnyLog } from 'bunny-log'

/**
 * Generates a random string of given length using the given characters.
 */
function getRandomString(length: number, chars: string): string {
	let result = ''
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

/**
 * Generates a license key with the pattern: 4-4-4-2.
 * The first group uses the plugin prefix (2 letters) + 2 random characters.
 * For example, for "LuckyRabbit", if the prefix is "LR", a key may be "LR01-92F9-165D-69".
 */
function generateLicenseKey(prefix: string): string {
	// Define the character set for digits and uppercase letters.
	const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
	// First group: plugin prefix (2 letters) + 2 random characters.
	const group1 = prefix + getRandomString(2, chars)
	// Second group: 4 random characters.
	const group2 = getRandomString(4, chars)
	// Third group: 4 random characters.
	const group3 = getRandomString(4, chars)
	// Fourth group: 2 random characters.
	const group4 = getRandomString(2, chars)
	return `${group1}-${group2}-${group3}-${group4}`
}

export async function execute(
	interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
	const pluginNameInput = interaction.options.getString('plugin_name')
	// Convert plugin name to uppercase for lookup in our map.
	const pluginKey = pluginNameInput ? pluginNameInput.toUpperCase() : ''

	// Plugin configuration map.
	const pluginConfigMap: Record<
		string,
		{
			prefix: string
			types: { [key: string]: number }
			description: string
			activationInstructions: string
		}
	> = {
		LUCKYRABBIT: {
			prefix: 'LR',
			types: { standard: 1, premium: 5, enterprise: 10 },
			description:
				'Advanced Lootbox System by RabbitTale Studio. \n Do not share your license key with anyone.',
			activationInstructions:
				'Add the license key to your config.yml or use the command: /lb config license-key add <key>',
		},
		// You can add other plugin configurations here.
	}

	// Lookup the configured plugin or set default.
	const config = pluginConfigMap[pluginKey] || {
		prefix: 'XX',
		types: { premium: 1 },
		description: 'No description available.',
		activationInstructions:
			'Refer to documentation for activation instructions.',
	}

	try {
		// Generate license key using the configured prefix.
		const licenseKey = generateLicenseKey(config.prefix)
		const serverCapacity = config.types.standard // Example: use the "standard" license capacity

		// Build a nicely formatted DM message.
		const dmMessage = `**License Key Generated for Plugin "${pluginNameInput}"**\n
**License Key:** \`||${licenseKey}||\`\n
**Server Capacity:** Your license can handle up to ${serverCapacity} servers.
**Plugin Description:** ${config.description}\n
**Activation Instructions:** ${config.activationInstructions}\n
		`

		// Send the generated license key via DM.
		await interaction.user.send({ content: dmMessage })

		// Reply ephemeral to the command to inform the user to check their DMs.
		await interaction.reply({
			content:
				'I have sent you a DM with your license key and activation instructions.',
			ephemeral: true,
		})
	} catch (error) {
		bunnyLog.error('Error creating license key:', error)
		await interaction.reply({
			content: 'Failed to create a license key.',
			ephemeral: true,
		})
	}
}
