import type * as Discord from 'discord.js'
import { handleGitHubSponsorsEvent } from '@/discord/events/supportProviders.js'
import { client } from '@/server.js'
import { APILogger } from '@/utils/bunnyLogger.js'
import crypto from 'crypto'

/**
 * Handle GitHub Sponsors webhook events
 * @param {Request} req - The incoming request
 * @returns {Promise<Response>} - The response
 */
export async function handleGitHubSponsorsWebhook(req: Request): Promise<Response> {
	try {
		const body = await req.text()
		const signature = req.headers.get('x-hub-signature-256')

		// Validate the webhook signature
		if (!signature || !process.env.GITHUB_WEBHOOK_SECRET) {
			APILogger.error('Missing GitHub webhook signature or secret')
			return new Response('Unauthorized', { status: 401 })
		}

		// Verify the signature
		const expectedSignature = crypto
			.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
			.update(body)
			.digest('hex')

		const providedSignature = signature.replace('sha256=', '')

		if (!crypto.timingSafeEqual(
			Buffer.from(expectedSignature, 'hex'),
			Buffer.from(providedSignature, 'hex')
		)) {
			APILogger.error('Invalid GitHub webhook signature')
			return new Response('Unauthorized', { status: 401 })
		}

		const data = JSON.parse(body)

		// Handle GitHub ping events (webhook verification)
		if (data.zen) {
			APILogger.info('GitHub webhook ping received - webhook is working correctly')
			return new Response('OK', { status: 200 })
		}

		// Validate the webhook payload for sponsorship events
		if (!data.action || !data.sponsorship) {
			APILogger.error('Invalid webhook payload - missing action or sponsorship data')
			return new Response('Invalid webhook payload', { status: 400 })
		}

		// Extract sponsor information
		const sponsor = data.sponsorship.sponsor
		const sponsorDisplayName = sponsor.name || sponsor.login || 'Unknown Sponsor'
		const tier = data.sponsorship.tier?.name || 'sponsor'
		const guildId = data.repository?.owner?.id || data.organization?.id

		if (!guildId) {
			APILogger.error('No guild_id provided in GitHub Sponsors webhook')
			return new Response('Missing guild_id', { status: 400 })
		}

		// Get the guild
		const guild = client.guilds.cache.get(guildId as Discord.Snowflake)
		if (!guild) {
			APILogger.error(`Guild not found: ${guildId}`)
			return new Response('Guild not found', { status: 404 })
		}

		// Handle different event types
		switch (data.action) {
			case 'created':
				// New sponsor
				await handleGitHubSponsorsEvent(guild, sponsorDisplayName, tier, 'created')
				break

			case 'tier_changed':
				// Sponsor changed tier
				await handleGitHubSponsorsEvent(guild, sponsorDisplayName, tier, 'tier_changed')
				break

			case 'cancelled':
				// Sponsor cancelled
				await handleGitHubSponsorsEvent(guild, sponsorDisplayName, tier, 'cancelled')
				break

			default:
				APILogger.error(`Unhandled GitHub Sponsors event type: ${data.action}`)
		}

		return new Response('OK', { status: 200 })
	} catch (error) {
		APILogger.error('Error handling GitHub Sponsors webhook:', error)
		return new Response('Internal server error', { status: 500 })
	}
}

/**
 * Create a GitHub Sponsors webhook URL for a guild
 * @param {string} guildId - The guild ID
 * @param {string} webhookUrl - The GitHub webhook URL
 * @returns {Promise<boolean>} - Whether the webhook was created successfully
 */
export async function createGitHubSponsorsWebhook(
	guildId: string,
	webhookUrl: string
): Promise<boolean> {
	try {
		// This would typically involve calling GitHub's API to create a webhook
		// For now, we'll just log the webhook URL
		APILogger.save(
			`GitHub Sponsors webhook created for guild ${guildId}: ${webhookUrl}`
		)
		return true
	} catch (error) {
		APILogger.error('Error creating GitHub Sponsors webhook:', error)
		return false
	}
}
