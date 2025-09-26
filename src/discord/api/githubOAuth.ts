import { StatusLogger } from '@/utils/bunnyLogger.js'
import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq, and } from 'drizzle-orm'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v10'
import * as Discord from 'discord.js'
import { createGitHubOAuthMessage } from '@/db/queries.js'
import { githubEvents, GitHubEventType } from '@/discord/events/githubEvents.js'

/**
 * Set CORS headers for API responses
 */
function setCorsHeaders(additionalHeaders = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...additionalHeaders
  }
}

/**
 * Handle GitHub OAuth
 * Redirects user to GitHub authorization page
 */
export async function handleGitHubOAuth(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    const botId = url.searchParams.get('botId')

    if (!userId || !botId) {
      return new Response('Missing parameters: userId or botId', {
        status: 400,
        headers: setCorsHeaders()
      })
    }

    // Create session state
    const state = Buffer.from(JSON.stringify({ userId, botId })).toString('base64')

    // Get GitHub client ID from environment variables
    const githubClientId = process.env.GITHUB_CLIENT_ID
    if (!githubClientId) {
      return new Response('Missing GITHUB_CLIENT_ID in environment variables', {
        status: 500,
        headers: setCorsHeaders()
      })
    }

    const redirectUri = `${process.env.API_BASE_URL}/github/v1/callback`
    const authUrl = new URL('https://github.com/login/oauth/authorize')
    authUrl.searchParams.append('client_id', githubClientId)
    authUrl.searchParams.append('redirect_uri', redirectUri)
    authUrl.searchParams.append('state', state)
    authUrl.searchParams.append('scope', 'read:user')

    // Redirect user to GitHub
    return Response.redirect(authUrl.toString(), 302)
  } catch (error) {
    StatusLogger.error(`Error handling GitHub OAuth: ${error instanceof Error ? error.message : String(error)}`)
    return new Response('An error occurred during authorization', {
      status: 500,
      headers: setCorsHeaders()
    })
  }
}

/**
 * Handle GitHub OAuth callback
 * Receives authorization code and exchanges it for an access token
 */
export async function handleGitHubOAuthCallback(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    StatusLogger.info(`[GitHub Callback] Received request with parameters: code=${code?.substring(0, 5)}..., state=${state?.substring(0, 10)}...`)

    if (!code || !state) {
      StatusLogger.error(`[GitHub Callback] Missing parameters: code=${!!code}, state=${!!state}`)
      return new Response('Missing parameters: code or state', {
        status: 400,
        headers: setCorsHeaders()
      })
    }

    // Decode session state
    let stateData: {
      userId?: string,
      discordUserId?: string,
      botId: string,
      messageId?: string,
      channelId?: string
    }

    try {
      const decodedState = Buffer.from(state, 'base64').toString()
      StatusLogger.info(`Decoded state: ${decodedState}`)
      stateData = JSON.parse(decodedState)
      StatusLogger.info(`Parsed state data: ${JSON.stringify(stateData)}`)
    } catch (error) {
      StatusLogger.error(`Error decoding state: ${error instanceof Error ? error.message : String(error)}`)
      return new Response('Invalid state format', {
        status: 400,
        headers: setCorsHeaders()
      })
    }

    // Handle different state formats
    const discordUserId = stateData.discordUserId || stateData.userId;
    const botId = stateData.botId;
    const messageId = stateData.messageId;
    const channelId = stateData.channelId;

    if (!discordUserId || !botId) {
      StatusLogger.error(`Missing user ID or bot ID in state data: ${JSON.stringify(stateData)}`)
      return new Response('Invalid state data: missing user ID or bot ID', {
        status: 400,
        headers: setCorsHeaders()
      })
    }

    // Exchange code for access token
    StatusLogger.info(`[GitHub Callback] Exchanging code for access token for user ${discordUserId}`)
    const tokenResponse = await exchangeCodeForToken(code)
    if (!tokenResponse) {
      StatusLogger.error(`[GitHub Callback] Failed to obtain access token for user ${discordUserId}`)
      return new Response('Failed to obtain access token', {
        status: 500,
        headers: setCorsHeaders()
      })
    }
    StatusLogger.info(`[GitHub Callback] Successfully obtained access token for user ${discordUserId}`)

    // Get GitHub user data
    StatusLogger.info(`[GitHub Callback] Retrieving GitHub user data for ${discordUserId}`)
    const githubUser = await fetchGitHubUser(tokenResponse)
    if (!githubUser) {
      StatusLogger.error(`[GitHub Callback] Failed to fetch GitHub user data for ${discordUserId}`)
      return new Response('Failed to fetch GitHub user data', {
        status: 500,
        headers: setCorsHeaders()
      })
    }
    StatusLogger.info(`[GitHub Callback] Successfully retrieved GitHub user data: ${githubUser.login} for Discord user ${discordUserId}`)

    // Save Discord to GitHub account link
    StatusLogger.info(`[GitHub Callback] Saving Discord-GitHub connection for user ${discordUserId} with GitHub account ${githubUser.login}`)
    const saveResult = await createOrUpdateGitHubLink(
      botId,
      discordUserId,
      githubUser.login
    )

    if (!saveResult) {
      StatusLogger.error(`[GitHub Callback] Failed to save GitHub connection for user ${discordUserId}`)
      return new Response('Failed to save GitHub account link', {
        status: 500,
        headers: setCorsHeaders()
      })
    }
    StatusLogger.info(`[GitHub Callback] Successfully saved GitHub connection for user ${discordUserId}`)

    // Update Discord message if messageId and channelId are provided
    if (messageId && channelId) {
      StatusLogger.info(`[GitHub Callback] Attempting to update Discord message: channelId=${channelId}, messageId=${messageId}`)
      try {
        // Store message info in database
        await createGitHubOAuthMessage(botId, discordUserId, channelId, messageId);

        // Emit success event instead of directly updating message
        githubEvents.emit(GitHubEventType.CONNECTION_SUCCESS, {
          userId: discordUserId,
          channelId: channelId,
          messageId: messageId,
          githubUsername: githubUser.login
        });

        StatusLogger.info(`[GitHub Callback] GitHub connection success event emitted for user ${discordUserId}`);
      } catch (error) {
        StatusLogger.error(`[GitHub Callback] Error handling GitHub connection: ${error instanceof Error ? error.message : String(error)}`);

        // Emit failure event
        githubEvents.emit(GitHubEventType.CONNECTION_FAILURE, {
          userId: discordUserId,
          channelId: channelId,
          messageId: messageId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    } else {
      StatusLogger.warn(`[GitHub Callback] Missing messageId or channelId, cannot update Discord message: messageId=${messageId}, channelId=${channelId}`);
    }

    // Return minimal HTML page that immediately closes itself
    const successHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>GitHub Connection Successful</title>
      <script>
        // Close the window immediately
        window.onload = function() {
          window.close();
        };
      </script>
    </head>
    <body>
      <p>Connection successful. This window will close automatically.</p>
    </body>
    </html>
    `;

    return new Response(successHtml, {
      status: 200,
      headers: setCorsHeaders({
        'Content-Type': 'text/html'
      })
    })
  } catch (error) {
    StatusLogger.error(`Error handling GitHub OAuth callback: ${error instanceof Error ? error.message : String(error)}`)
    return new Response('An error occurred during authorization', {
      status: 500,
      headers: setCorsHeaders()
    })
  }
}

/**
 * Exchange authorization code for access token
 * @param code - Authorization code from GitHub
 * @returns Access token or null if exchange failed
 */
export async function exchangeCodeForToken(code: string): Promise<string | null> {
  try {
    const githubClientId = process.env.GITHUB_CLIENT_ID
    const githubClientSecret = process.env.GITHUB_CLIENT_SECRET

    if (!githubClientId || !githubClientSecret) {
      StatusLogger.error('[GitHub OAuth] Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET in environment variables')
      return null
    }

    const tokenUrl = 'https://github.com/login/oauth/access_token'
    const redirectUri = `${process.env.API_BASE_URL}/github/v1/callback`

    StatusLogger.info(`[GitHub OAuth] Sending token request to ${tokenUrl}`)

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: githubClientId,
        client_secret: githubClientSecret,
        code,
        redirect_uri: redirectUri
      })
    })

    if (!response.ok) {
      StatusLogger.error(`[GitHub OAuth] Error exchanging code for token: ${response.status} ${response.statusText}`)
      const responseText = await response.text()
      StatusLogger.error(`[GitHub OAuth] Response content: ${responseText}`)
      return null
    }

    const data = await response.json()
    if (!data.access_token) {
      StatusLogger.error(`[GitHub OAuth] No access token in response: ${JSON.stringify(data)}`)
      return null
    }

    StatusLogger.info(`[GitHub OAuth] Successfully obtained access token`)
    return data.access_token
  } catch (error) {
    StatusLogger.error(`[GitHub OAuth] Error exchanging code for token: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Fetch GitHub user data using access token
 */
export async function fetchGitHubUser(accessToken: string): Promise<{ login: string } | null> {
  try {
    StatusLogger.info(`[GitHub OAuth] Retrieving GitHub user data`)
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'User-Agent': 'RabbitTale-Bot'
      }
    })

    if (!response.ok) {
      StatusLogger.error(`[GitHub OAuth] Error retrieving GitHub user data: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()
    StatusLogger.info(`[GitHub OAuth] Successfully retrieved GitHub user data: ${data.login}`)
    return data
  } catch (error) {
    StatusLogger.error(`[GitHub OAuth] Error retrieving GitHub user data: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Create or update GitHub link in database
 */
export async function createOrUpdateGitHubLink(
  botId: string,
  discordUserId: string,
  githubUsername: string
): Promise<boolean> {
  try {
    StatusLogger.info(`[GitHub OAuth] Creating/updating GitHub link for Discord user ${discordUserId} with GitHub account ${githubUsername}`)

    // Check if link already exists
    const existingLinks = await db.select()
      .from(githubDiscordLinks)
      .where(
        and(
          eq(githubDiscordLinks.discord_user_id, discordUserId),
          eq(githubDiscordLinks.bot_id, botId)
        )
      )

    if (existingLinks.length > 0) {
      // Update existing link
      StatusLogger.info(`[GitHub OAuth] Updating existing GitHub link for Discord user ${discordUserId}`)
      await db.update(githubDiscordLinks)
        .set({
          github_username: githubUsername,
          updated_at: new Date()
        })
        .where(
          and(
            eq(githubDiscordLinks.discord_user_id, discordUserId),
            eq(githubDiscordLinks.bot_id, botId)
          )
        )
    } else {
      // Create new link
      StatusLogger.info(`[GitHub OAuth] Creating new GitHub link for Discord user ${discordUserId}`)
      await db.insert(githubDiscordLinks)
        .values({
          bot_id: botId,
          discord_user_id: discordUserId,
          github_username: githubUsername,
          created_at: new Date(),
          updated_at: new Date()
        })
    }

    return true
  } catch (error) {
    StatusLogger.error(`[GitHub OAuth] Error creating/updating GitHub link: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * Find linked Discord account for GitHub username
 */
export async function findLinkedDiscordAccount(
  botId: string,
  githubUsername: string
): Promise<string | null> {
  try {
    const links = await db.select()
      .from(githubDiscordLinks)
      .where(
        and(
          eq(githubDiscordLinks.github_username, githubUsername),
          eq(githubDiscordLinks.bot_id, botId)
        )
      )

    if (links.length === 0) {
      return null
    }

    return links[0].discord_user_id
  } catch (error) {
    StatusLogger.error(`Error finding linked Discord account: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Updates Discord message after successful GitHub account connection
 */
export async function updateDiscordMessage(
  channelId: string,
  messageId: string,
  githubUser: any,
  discordUserId: string
): Promise<boolean> {
  try {
    // Validate inputs
    if (!channelId || !messageId) {
      StatusLogger.warn(`[GitHub OAuth] Cannot update Discord message: Missing channelId (${channelId}) or messageId (${messageId}) for user ${discordUserId}`);
      return false;
    }

    // Get bot token from environment variables
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      StatusLogger.error('[GitHub OAuth] Missing BOT_TOKEN in environment variables');
      return false;
    }

    // Create Discord REST API client
    const rest = new REST({ version: '10' }).setToken(botToken);

    // Prepare message components
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
            content: `✅ **Successfully connected GitHub account**\n\n**Username**: ${githubUser.login}\n**Name**: ${githubUser.name || 'Not provided'}\n**Profile**: [${githubUser.login}](${githubUser.html_url})`
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
    ];

    // Update the message
    try {
      await rest.patch(Routes.channelMessage(channelId, messageId), {
        body: {
          components,
          flags: Discord.MessageFlags.IsComponentsV2
        }
      });

      StatusLogger.info(`[GitHub OAuth] Discord message updated successfully for user ${discordUserId} (GitHub: ${githubUser.login})`);
      return true;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        StatusLogger.error(`[GitHub OAuth] Error updating Discord message: ${errorMessage}`);

        // If we get a Missing Access error, try to send a new message to the user via DM
        if (errorMessage.includes('Missing Access')) {
          StatusLogger.info(`[GitHub OAuth] Missing Access error - this is expected if the bot doesn't have permissions in the channel`);

          // Próba wysłania nowej wiadomości do kanału
          try {
            const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN || '');
            await rest.post(Routes.channelMessages(channelId), {
              body: {
                content: `Konto GitHub **${githubUser.login}** zostało pomyślnie połączone z kontem Discord <@${discordUserId}>!`,
                flags: Discord.MessageFlags.SuppressEmbeds
              }
            });
            StatusLogger.info(`[GitHub OAuth] Wysłano nową wiadomość o pomyślnym połączeniu konta GitHub dla użytkownika ${discordUserId}`);
          } catch (msgError) {
            StatusLogger.error(`[GitHub OAuth] Nie udało się wysłać nowej wiadomości: ${msgError instanceof Error ? msgError.message : String(msgError)}`);
          }

          // Just log the successful connection
          StatusLogger.info(`[GitHub OAuth] GitHub account ${githubUser.login} successfully connected to Discord user ${discordUserId}`);
        }

        // Don't fail the entire process if we can't update the message
        // The GitHub account is still connected successfully
        return true;
    }
  } catch (error) {
    StatusLogger.error(`[GitHub OAuth] Error in updateDiscordMessage: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Sends a new success message to Discord channel after GitHub account connection
 */
export async function sendSuccessMessage(
  channelId: string,
  discordUserId: string,
  githubUser: any
): Promise<boolean> {
  try {
    // Get bot token from environment variables
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      StatusLogger.error('Missing BOT_TOKEN in environment variables');
      return false;
    }

    // Create Discord REST API client
    const rest = new REST({ version: '10' }).setToken(botToken);

    // Prepare message components
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
            content: `✅ **Successfully connected GitHub account**\n\n**Username**: ${githubUser.login}\n**Name**: ${githubUser.name || 'Not provided'}\n**Profile**: [${githubUser.login}](${githubUser.html_url})`
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
            label: 'Rozłącz konto',
            custom_id: 'github_disconnect'
          }
        ]
      }
    ];

    // Send new message
    try {
      await rest.post(Routes.channelMessages(channelId), {
        body: {
          content: `<@${discordUserId}> Twoje konto GitHub zostało połączone!`,
          components,
          flags: Discord.MessageFlags.IsComponentsV2
        }
      });

      StatusLogger.info(`Discord success message sent for user ${discordUserId}`);
      return true;
    } catch (error) {
      StatusLogger.error(`Error sending success message: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  } catch (error) {
    StatusLogger.error(`Error in sendSuccessMessage: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
