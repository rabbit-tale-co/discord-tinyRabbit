import * as utils from '@/utils/index.js'
import * as api from '@/discord/api/index.js'
import type { Level, LevelStatus } from '@/types/levels.js'
import type { Channel, Guild, Message, User } from 'discord.js'
import { client } from '@/server.js'
import { LevelUpResult } from '@/utils/index.js'
import * as services from '@/discord/services/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'

const userMessages: Record<
	string,
	{ channel: { id: string }; content: string }[]
> = {}

/**
 * Stores message history for a user.
 * TODO: Use AI for quality control and spam detection.
 * @param {User['id']} author_id - The ID of the user.
 * @param {Channel['id']} channel_id - The ID of the channel where the message was sent.
 * @param {string} content - The content of the message.
 */
function storeMessageHistory(
	author_id: User['id'],
	channel_id: Channel['id'],
	content: string
) {
	// Initialize userMessages if it doesn't exist
	if (!userMessages[author_id]) userMessages[author_id] = []

	// Add the message to the user's message history
	userMessages[author_id].push({ channel: { id: channel_id }, content })

	// If the user has more than 5 messages, remove the oldest one
	if (userMessages[author_id].length > 5) userMessages[author_id].shift()
}

/**
 * Initializes user data if not found in the database.
 * @param {Discord.Guild['id']} guild_id - The ID of the guild.
 * @param {Discord.User['id']} author_id - The ID of the user.
 * @returns {Promise<Level>} - The user's level data.
 */
async function initializeUserData(
	guild_id: Guild['id'],
	author_id: User['id']
): Promise<Level> {
	try {
		const data = await api.getUser(client.user?.id ?? '', guild_id, author_id)
		// bunnyLog.api(`Fetched user data for ${author_id}:`, JSON.stringify(data, null, 2))
		if (data) return data

		// If user not found, initialize with default values
		// bunnyLog.api(`Initializing new user data for ${author_id}`)
		return { xp: 0, level: 0 }
	} catch (error) {
		StatusLogger.error('Error fetching user data', error as Error)
		return { xp: 0, level: 0 }
	}
}

/**
 * Processes a user's message to calculate and update their Xp and Roles.
 * @param {Message} message - The message object from Discord.
 */
async function assignXP(message: Message) {
	const { guild, member, author, channel, content } = message

	// Initialize user data
	const user_data = await initializeUserData(guild?.id ?? '', author.id)

	// Store the message history for the user
	storeMessageHistory(author.id, channel.id, content)

	const config = await api.getPluginConfig(
		client.user?.id ?? '',
		guild?.id ?? '',
		'levels'
	)

	if (!member) return

	// Get boost roles from new boost_roles structure, with legacy fallback
	const boostRoles = config?.boost_roles || { x2: [], x3: [], x5: [] }

	// Get role IDs for each boost level (now they are already strings)
	const x2RoleIds = boostRoles.x2 || []
	const x3RoleIds = boostRoles.x3 || []
	const x5RoleIds = boostRoles.x5 || []

	// Get Discord Boost role ID
	const discordBoostRoleId = guild?.roles.premiumSubscriberRole?.id

	// Determine boost multiplier (highest wins)
	let boost_multiplier = 1

	if (member.roles.cache.some((role) => x5RoleIds.includes(role.id))) {
		boost_multiplier = 5
		// bunnyLog.info(`${member.id} has 5x boost roles`)
	} else if (member.roles.cache.some((role) => x3RoleIds.includes(role.id))) {
		boost_multiplier = 3
		// bunnyLog.info(`${member.id} has 3x boost roles`)
	} else if (
		member.roles.cache.some((role) => x2RoleIds.includes(role.id)) ||
		(discordBoostRoleId && member.roles.cache.has(discordBoostRoleId))
	) {
		boost_multiplier = 2
		// bunnyLog.info(`${member.id} has 2x boost roles`)
	}

	// Update points and level for the user
	const updatedUserData = utils.updateUserXpAndLevel(
		user_data,
		0,
		boost_multiplier
	) as LevelStatus

	// Add or update user in Firestore
	await api.addOrUpdateUserLevel(
		client.user?.id ?? '',
		guild?.id ?? '',
		author,
		updatedUserData
	)

	// Check if the user leveled up and update roles if necessary
	if (updatedUserData.levelChangeStatus !== LevelUpResult.NoChange) {
		await services.updateMemberRoles(
			client.user?.id ?? '',
			guild as Guild,
			author,
			updatedUserData
		)
	}
}

export { assignXP }
