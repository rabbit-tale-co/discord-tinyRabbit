import * as Discord from 'discord.js'
import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq } from 'drizzle-orm'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as utils from '@/utils/index.js'
import { APILogger } from '@/utils/index.js'

/**
 * Checks the connection status between GitHub account and Discord account
 */
export async function githubStatus(
  interaction: Discord.ChatInputCommandInteraction,
  skipDeferReply: boolean = false
): Promise<void> {
  try {
    // Response is ephemeral, so it's only visible to the user
    if (!skipDeferReply && !interaction.deferred) {
      await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })
    }

    const discordUserId = interaction.user.id
    const botId = interaction.client.user.id

    // Sprawdź, czy użytkownik ma połączone konto GitHub
    const links = await db.select()
      .from(githubDiscordLinks)
      .where(
        eq(githubDiscordLinks.discord_user_id, discordUserId)
      )

    if (links.length === 0) {
      // User doesn't have a connected GitHub account
      // Create OAuth authorization URL directly to GitHub
      const clientId = process.env.GITHUB_CLIENT_ID
      APILogger.info(`GITHUB_CLIENT_ID: ${clientId}`)

      const redirectUri = encodeURIComponent(`${process.env.API_BASE_URL || 'https://api.rabbittale.co'}/github/v1/callback`)
      APILogger.info(`Redirect URI: ${redirectUri}`)

      const stateData = {
        userId: discordUserId,
        botId,
        messageId: interaction.id,
        channelId: interaction.channelId
      }
      APILogger.info(`State data: ${JSON.stringify(stateData)}`)

      const state = Buffer.from(JSON.stringify(stateData)).toString('base64')
      APILogger.info(`Encoded state: ${state}`)

      const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=user:email`
      APILogger.info(`Full OAuth URL: ${oauthUrl}`)

      const components = [
        {
          type: Discord.ComponentType.TextDisplay,
          content: '## GitHub Connection Status'
        },
        {
          type: Discord.ComponentType.Separator,
          divider: true,
          spacing: Discord.SeparatorSpacingSize.Large
        },
        {
          type: Discord.ComponentType.TextDisplay,
          content: 'Click the button below to connect your Discord account with GitHub:'
        },
        {
          type: Discord.ComponentType.ActionRow,
          components: [
            {
              type: Discord.ComponentType.Button,
              style: Discord.ButtonStyle.Link,
              label: 'Login with GitHub',
              url: oauthUrl
            }
          ]
        }
      ]

      await interaction.editReply({
        components,
        flags: Discord.MessageFlags.IsComponentsV2
      })
      return
    }

    // User has a connected GitHub account
    const githubUsername = links[0].github_username

    try {
      // Get GitHub user data
      const response = await fetch(`https://api.github.com/users/${githubUsername}`)

      if (!response.ok) {
        throw new Error(`Error while fetching data from GitHub: ${response.status}`)
      }

      const githubUser = await response.json()

      const components = [
        {
          type: Discord.ComponentType.Section,
          components: [
            {
              type: Discord.ComponentType.TextDisplay,
              content: '## GitHub Connection Status'
            },
            {
              type: Discord.ComponentType.TextDisplay,
              content: `✅ **Connected to GitHub account**\n\n**Username**: ${githubUsername}\n**Name**: ${githubUser.name || 'Not provided'}\n**Profile**: [${githubUsername}](${githubUser.html_url})`
            }
          ],
          accessory: {
            type: Discord.ComponentType.Thumbnail,
            media: {
              url: githubUser.avatar_url
            }
          }
        },
        {
          type: Discord.ComponentType.Separator,
          divider: true,
          spacing: Discord.SeparatorSpacingSize.Large
        },
        {
          type: Discord.ComponentType.ActionRow,
          components: [
            {
              type: Discord.ComponentType.Button,
              style: Discord.ButtonStyle.Danger,
              label: 'Disconnect account',
              custom_id: 'github_disconnect'
            }
          ]
        }
      ]

      await interaction.editReply({
        components,
        flags: Discord.MessageFlags.IsComponentsV2
      })
    } catch (error) {
      StatusLogger.error(`Error while fetching data from GitHub: ${error instanceof Error ? error.message : String(error)}`)

      // Display basic information without GitHub API data
      const components = [
        {
          type: Discord.ComponentType.TextDisplay,
          content: '## GitHub Connection Status'
        },
        {
          type: Discord.ComponentType.Separator,
          divider: true,
          spacing: Discord.SeparatorSpacingSize.Large
        },
        {
          type: Discord.ComponentType.TextDisplay,
          content: `✅ **Connected to GitHub account**\n\n**Username**: ${githubUsername}`
        },
        {
          type: Discord.ComponentType.ActionRow,
          components: [
            {
              type: Discord.ComponentType.Button,
              style: Discord.ButtonStyle.Danger,
              label: 'Disconnect account',
              custom_id: 'github_disconnect'
            }
          ]
        }
      ]

      await interaction.editReply({
        components,
        flags: Discord.MessageFlags.IsComponentsV2
      })
    }
  } catch (error) {
    await utils.handleResponse(interaction, 'error', error.message, {
      code: 'GITHUB001',
      ephemeral: true
    })
  }
}
