import { StatusLogger } from '@/utils/bunnyLogger.js'
import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq, and } from 'drizzle-orm'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord-api-types/v10'
import * as Discord from 'discord.js'

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
    
    StatusLogger.info(`[GitHub Callback] Otrzymano żądanie z parametrami: code=${code?.substring(0, 5)}..., state=${state?.substring(0, 10)}...`)

    if (!code || !state) {
      StatusLogger.error(`[GitHub Callback] Brakujące parametry: code=${!!code}, state=${!!state}`)
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
    StatusLogger.info(`[GitHub Callback] Wymiana kodu na token dostępu dla użytkownika ${discordUserId}`)
    const tokenResponse = await exchangeCodeForToken(code)
    if (!tokenResponse) {
      StatusLogger.error(`[GitHub Callback] Nie udało się uzyskać tokenu dostępu dla użytkownika ${discordUserId}`)
      return new Response('Failed to obtain access token', {
        status: 500,
        headers: setCorsHeaders()
      })
    }
    StatusLogger.info(`[GitHub Callback] Pomyślnie uzyskano token dostępu dla użytkownika ${discordUserId}`)

    // Get GitHub user data
    StatusLogger.info(`[GitHub Callback] Pobieranie danych użytkownika GitHub dla ${discordUserId}`)
    const githubUser = await fetchGitHubUser(tokenResponse.access_token)
    if (!githubUser) {
      StatusLogger.error(`[GitHub Callback] Nie udało się pobrać danych użytkownika GitHub dla ${discordUserId}`)
      return new Response('Failed to fetch GitHub user data', {
        status: 500,
        headers: setCorsHeaders()
      })
    }
    StatusLogger.info(`[GitHub Callback] Pomyślnie pobrano dane użytkownika GitHub: ${githubUser.login} dla użytkownika Discord ${discordUserId}`)

    // Save Discord to GitHub account link
    StatusLogger.info(`[GitHub Callback] Zapisywanie połączenia Discord-GitHub dla użytkownika ${discordUserId} z kontem GitHub ${githubUser.login}`)
    const saveResult = await createOrUpdateGitHubLink(
      botId,
      discordUserId,
      githubUser.login
    )

    if (!saveResult) {
      StatusLogger.error(`[GitHub Callback] Nie udało się zapisać połączenia GitHub dla użytkownika ${discordUserId}`)
      return new Response('Failed to save GitHub account link', {
        status: 500,
        headers: setCorsHeaders()
      })
    }
    StatusLogger.info(`[GitHub Callback] Pomyślnie zapisano połączenie GitHub dla użytkownika ${discordUserId}`)

    // Update Discord message if messageId and channelId are provided
    if (messageId && channelId) {
      StatusLogger.info(`[GitHub Callback] Próba aktualizacji wiadomości Discord: channelId=${channelId}, messageId=${messageId}`)
      try {
        const messageUpdated = await updateDiscordMessage(channelId, messageId, githubUser, discordUserId);
        if (messageUpdated) {
          StatusLogger.info(`[GitHub Callback] Wiadomość Discord zaktualizowana pomyślnie dla użytkownika ${discordUserId}`);
        } else {
          StatusLogger.warn(`[GitHub Callback] Aktualizacja wiadomości Discord nie powiodła się dla użytkownika ${discordUserId}`);
          // No longer trying to send a new message as it also fails with Missing Access
          StatusLogger.info(`[GitHub Callback] Konto GitHub ${githubUser.login} zostało pomyślnie połączone z kontem Discord ${discordUserId}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("Missing Access")) {
          StatusLogger.info(`[GitHub OAuth] Missing Access error - this is expected if the bot doesn't have permissions in the channel`);
          StatusLogger.info(`[GitHub OAuth] GitHub account ${githubUser.login} successfully connected to Discord user ${discordUserId}`);
        } else {
          StatusLogger.error(`[GitHub Callback] Błąd aktualizacji wiadomości Discord: ${errorMessage}`);
        }
      }
    } else {
      StatusLogger.warn(`[GitHub Callback] Brak messageId lub channelId, nie można zaktualizować wiadomości Discord: messageId=${messageId}, channelId=${channelId}`);
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
 */
export async function exchangeCodeForToken(code: string): Promise<{ access_token: string } | null> {
  try {
    const githubClientId = process.env.GITHUB_CLIENT_ID
    const githubClientSecret = process.env.GITHUB_SECRET_ID

    if (!githubClientId || !githubClientSecret) {
      StatusLogger.error('[GitHub OAuth] Brak GITHUB_CLIENT_ID lub GITHUB_SECRET_ID w zmiennych środowiskowych')
      return null
    }

    const tokenUrl = 'https://github.com/login/oauth/access_token'
    const redirectUri = `${process.env.API_BASE_URL}/github/v1/callback`
    
    StatusLogger.info(`[GitHub OAuth] Wysyłanie żądania o token do ${tokenUrl}`)
    
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
      StatusLogger.error(`[GitHub OAuth] Błąd wymiany kodu na token: ${response.status} ${response.statusText}`)
      const responseText = await response.text()
      StatusLogger.error(`[GitHub OAuth] Zawartość odpowiedzi: ${responseText}`)
      return null
    }

    const data = await response.json()
    if (!data.access_token) {
      StatusLogger.error(`[GitHub OAuth] Brak tokenu dostępu w odpowiedzi: ${JSON.stringify(data)}`)
      return null
    }
    
    StatusLogger.info(`[GitHub OAuth] Pomyślnie uzyskano token dostępu`)
    return data
  } catch (error) {
    StatusLogger.error(`Error exchanging code for token: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Fetch GitHub user data using access token
 */
export async function fetchGitHubUser(accessToken: string): Promise<{ login: string } | null> {
  try {
    StatusLogger.info(`[GitHub OAuth] Pobieranie danych użytkownika GitHub`)
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'Discord-Bot'
      }
    })

    if (!response.ok) {
      StatusLogger.error(`[GitHub OAuth] Błąd pobierania danych użytkownika GitHub: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()
    StatusLogger.info(`[GitHub OAuth] Pomyślnie pobrano dane użytkownika GitHub: ${data.login}`)
    return data
  } catch (error) {
    StatusLogger.error(`[GitHub OAuth] Błąd podczas pobierania danych użytkownika GitHub: ${error instanceof Error ? error.message : String(error)}`)
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
    StatusLogger.info(`[GitHub OAuth] Tworzenie/aktualizacja połączenia GitHub dla użytkownika Discord ${discordUserId} z kontem GitHub ${githubUsername}`)

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
      StatusLogger.info(`[GitHub OAuth] Aktualizacja istniejącego połączenia GitHub dla użytkownika Discord ${discordUserId}`)
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
      StatusLogger.info(`[GitHub OAuth] Tworzenie nowego połączenia GitHub dla użytkownika Discord ${discordUserId}`)
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
        // Don't attempt to send DM as that also fails with Missing Access
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
