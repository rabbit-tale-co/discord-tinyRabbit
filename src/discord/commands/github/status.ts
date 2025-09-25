import * as Discord from 'discord.js'
import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq } from 'drizzle-orm'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as utils from '@/utils/index.js'
import { APILogger } from '@/utils/index.js'
import { githubEvents, GitHubEventType } from '@/discord/events/githubEvents.js'

/**
 * Checks the connection status between GitHub account and Discord account
 */
export async function githubStatus(
  interaction: Discord.ChatInputCommandInteraction,
  skipDeferReply: boolean = false
): Promise<void> {
  // Set up event listeners for GitHub connection events
  const connectionSuccessListener = async (data: { channelId: string, userId: string, githubUsername: string }) => {
    // Only handle events for this user
    if (data.userId === interaction.user.id) {
      StatusLogger.info(`Received GitHub connection success event for user ${data.userId}, username: ${data.githubUsername}`)
      
      try {
        // Get GitHub user data
        const response = await fetch(`https://api.github.com/users/${data.githubUsername}`)
        
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
                content: `✅ **Connected to GitHub account**\n\n**Username**: ${data.githubUsername}\n**Name**: ${githubUser.name || 'Not provided'}\n**Profile**: [${data.githubUsername}](${githubUser.html_url})`
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
        
        // Update the message with success information
        await interaction.editReply({
          components,
          flags: Discord.MessageFlags.IsComponentsV2
        })
      } catch (error) {
        StatusLogger.error(`Error handling GitHub connection success event: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Remove the listeners after handling the event
      githubEvents.removeListener(GitHubEventType.CONNECTION_SUCCESS, connectionSuccessListener)
      githubEvents.removeListener(GitHubEventType.CONNECTION_FAILURE, connectionFailureListener)
    }
  }
  
  const connectionFailureListener = async (data: { channelId: string, userId: string, error: string }) => {
    // Only handle events for this user
    if (data.userId === interaction.user.id) {
      StatusLogger.info(`Received GitHub connection failure event for user ${data.userId}, error: ${data.error}`)
      
      try {
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
            content: `❌ **Failed to connect GitHub account**\n\nError: ${data.error}\n\nPlease try again.`
          },
          {
            type: Discord.ComponentType.ActionRow,
            components: [
              {
                type: Discord.ComponentType.Button,
                style: Discord.ButtonStyle.Primary,
                label: 'Try Again',
                custom_id: 'github_status'
              }
            ]
          }
        ]
        
        // Update the message with failure information
        await interaction.editReply({
          components,
          flags: Discord.MessageFlags.IsComponentsV2
        })
      } catch (error) {
        StatusLogger.error(`Error handling GitHub connection failure event: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Remove the listeners after handling the event
      githubEvents.removeListener(GitHubEventType.CONNECTION_SUCCESS, connectionSuccessListener)
      githubEvents.removeListener(GitHubEventType.CONNECTION_FAILURE, connectionFailureListener)
    }
  }
  
  // Register the event listeners
  githubEvents.on(GitHubEventType.CONNECTION_SUCCESS, connectionSuccessListener)
  githubEvents.on(GitHubEventType.CONNECTION_FAILURE, connectionFailureListener)
  
  // Set a timeout to automatically remove listeners after 10 minutes if no event is received
  const timeout = setTimeout(() => {
    githubEvents.removeListener(GitHubEventType.CONNECTION_SUCCESS, connectionSuccessListener)
    githubEvents.removeListener(GitHubEventType.CONNECTION_FAILURE, connectionFailureListener)
    StatusLogger.info(`Removed GitHub connection event listeners for user ${interaction.user.id} due to timeout`)
  }, 10 * 60 * 1000) // 10 minutes
  try {
    // Response is ephemeral, so it's only visible to the user
    if (!skipDeferReply && !interaction.deferred) {
      await interaction.deferReply({ flags: Discord.MessageFlags.Ephemeral })
    }
    
    // Clear the timeout if the function exits
    const clearEventListeners = () => {
      clearTimeout(timeout)
      githubEvents.removeListener(GitHubEventType.CONNECTION_SUCCESS, connectionSuccessListener)
      githubEvents.removeListener(GitHubEventType.CONNECTION_FAILURE, connectionFailureListener)
    }

    const discordUserId = interaction.user.id
    const botId = interaction.client.user.id

    // Check if the user has a connected GitHub account
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
        messageId: null, // Will be updated after we get the reply message ID
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

      const reply = await interaction.editReply({
        components,
        flags: Discord.MessageFlags.IsComponentsV2
      })

      // Now that we have the actual message ID, store it for future reference
      // This will help with debugging but won't affect the current flow
      StatusLogger.info(`GitHub login message ID: ${reply.id}`)

      // We need to update the OAuth URL with the correct message ID
      // Create a new state with the actual message ID
      const updatedStateData = {
        userId: discordUserId,
        botId,
        messageId: reply.id,
        channelId: interaction.channelId
      }

      const updatedState = Buffer.from(JSON.stringify(updatedStateData)).toString('base64')
      const updatedOauthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${updatedState}&scope=user:email`

      // Update the button URL with the new OAuth URL that includes the message ID
      const updatedComponents = [
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
              url: updatedOauthUrl
            }
          ]
        }
      ]

      // Update the message with the new button URL
      await interaction.editReply({
        components: updatedComponents,
        flags: Discord.MessageFlags.IsComponentsV2
      })

      StatusLogger.info(`Updated GitHub login button with message ID: ${reply.id}`)
      return
    }
    
    // Clear event listeners if we're returning early
    clearEventListeners()

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
