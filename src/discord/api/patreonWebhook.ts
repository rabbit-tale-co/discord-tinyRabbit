import type * as Discord from 'discord.js'
import { APILogger } from '@/utils/bunnyLogger.js'
import { handlePatreonEvent } from '@/discord/events/supportProviders.js'
import { client } from '@/server.js'

/**
 * Handle Patreon webhook events
 * @param {Request} req - The incoming request
 * @returns {Promise<Response>} - The response
 */
export async function handlePatreonWebhook(req: Request): Promise<Response> {
	try {
		const body = await req.json()

		// Validate the webhook signature (you should implement proper signature validation)
		// For now, we'll just check if the request has the required fields
		if (!body.event_type || !body.data) {
			return new Response('Invalid webhook payload', { status: 400 })
		}

		// Extract supporter information
		const supporterName =
			body.data.attributes?.full_name ||
			body.data.attributes?.name ||
			'Unknown Supporter'
		const tier = body.data.attributes?.patron_status || 'supporter'
		const guildId = body.metadata?.guild_id

		if (!guildId) {
			APILogger.error('No guild_id provided in Patreon webhook')
			return new Response('Missing guild_id', { status: 400 })
		}

		// Get the guild
		const guild = client.guilds.cache.get(guildId as Discord.Snowflake)
		if (!guild) {
			APILogger.error(`Guild not found: ${guildId}`)
			return new Response('Guild not found', { status: 404 })
		}

		// Handle different event types
		switch (body.event_type) {
			case 'members:pledge:create':
			case 'members:pledge:update':
				// New supporter or updated pledge
				await handlePatreonEvent(guild, supporterName, tier)
				break

			case 'members:pledge:delete':
				// Supporter cancelled (optional - you might want to handle this differently)
				APILogger.info(
					`Patreon supporter cancelled: ${supporterName} in ${guild.name}`
				)
				break

			default:
				APILogger.info(`Unhandled Patreon event type: ${body.event_type}`)
		}

		return new Response('OK', { status: 200 })
	} catch (error) {
		APILogger.error('Error handling Patreon webhook:', error)
		return new Response('Internal server error', { status: 500 })
	}
}

/**
 * Create a Patreon webhook URL for a guild
 * @param {string} guildId - The guild ID
 * @param {string} webhookUrl - The Patreon webhook URL
 * @returns {Promise<boolean>} - Whether the webhook was created successfully
 */
export async function createPatreonWebhook(
	guildId: string,
	webhookUrl: string
): Promise<boolean> {
	try {
		// This would typically involve calling Patreon's API to create a webhook
		// For now, we'll just log the webhook URL
		APILogger.info(
			`Patreon webhook created for guild ${guildId}: ${webhookUrl}`
		)
		return true
	} catch (error) {
		APILogger.error('Error creating Patreon webhook:', error)
		return false
	}
}
