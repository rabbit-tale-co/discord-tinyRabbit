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

    if (!code || !state) {
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
    const tokenResponse = await exchangeCodeForToken(code)
    if (!tokenResponse) {
      return new Response('Failed to obtain access token', {
        status: 500,
        headers: setCorsHeaders()
      })
    }

    // Get GitHub user data
    const githubUser = await fetchGitHubUser(tokenResponse.access_token)
    if (!githubUser) {
      return new Response('Failed to fetch GitHub user data', {
        status: 500,
        headers: setCorsHeaders()
      })
    }

    // Save Discord to GitHub account link
    const saveResult = await createOrUpdateGitHubLink(
      botId,
      discordUserId,
      githubUser.login
    )
    
    if (!saveResult) {
      StatusLogger.error(`Failed to save GitHub link for user ${discordUserId}`)
      return new Response('Failed to save GitHub account link', {
        status: 500,
        headers: setCorsHeaders()
      })
    }

    // Aktualizuj wiadomość Discord, jeśli podano messageId i channelId
    if (messageId && channelId) {
      try {
        await updateDiscordMessage(botId, channelId, messageId, discordUserId, githubUser);
        StatusLogger.info(`Discord message updated successfully for user ${discordUserId}`);
      } catch (error) {
        StatusLogger.error(`Failed to update Discord message: ${error instanceof Error ? error.message : String(error)}`);
        // Kontynuuj mimo błędu aktualizacji wiadomości
      }
    }

    // Return simple success message
    return new Response('GitHub account connected successfully. You can now close this window and return to Discord.', {
      status: 200,
      headers: setCorsHeaders()
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
      StatusLogger.error('Missing GITHUB_CLIENT_ID or GITHUB_SECRET_ID in environment variables')
      return null
    }

    const tokenUrl = 'https://github.com/login/oauth/access_token'
    const redirectUri = `${process.env.API_BASE_URL}/github/v1/callback`

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
      StatusLogger.error(`Failed to exchange code for token: ${response.status} ${response.statusText}`)
      const responseText = await response.text()
      StatusLogger.error(`Response content: ${responseText}`)
      return null
    }

    const data = await response.json()
    if (!data.access_token) {
      StatusLogger.error(`No access token in response: ${JSON.stringify(data)}`)
      return null
    }

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
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'Discord-Bot'
      }
    })

    if (!response.ok) {
      StatusLogger.error(`Failed to fetch GitHub user: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()
    return data
  } catch (error) {
    StatusLogger.error(`Error fetching GitHub user: ${error instanceof Error ? error.message : String(error)}`)
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
    StatusLogger.info(`Creating/updating GitHub link for Discord user ${discordUserId} with GitHub username ${githubUsername}`)

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
      StatusLogger.info(`Updating existing GitHub link for Discord user ${discordUserId}`)
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
      StatusLogger.info(`Creating new GitHub link for Discord user ${discordUserId}`)
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
    StatusLogger.error(`Error creating/updating GitHub link: ${error instanceof Error ? error.message : String(error)}`)
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
 * Aktualizuje wiadomość Discord po pomyślnym połączeniu konta GitHub
 */
export async function updateDiscordMessage(
  botId: string,
  channelId: string,
  messageId: string,
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
    
    // Utwórz klienta REST API Discord
    const rest = new REST({ version: '10' }).setToken(botToken);
    
    // Przygotuj komponenty wiadomości
    const components = [
      {
        type: Discord.ComponentType.Section,
        components: [
          {
            type: Discord.ComponentType.TextDisplay,
            content: '## Status połączenia z GitHub'
          },
          {
            type: Discord.ComponentType.TextDisplay,
            content: `✅ **Połączono z kontem GitHub**\n\n**Nazwa użytkownika**: ${githubUser.login}\n**Imię**: ${githubUser.name || 'Nie podano'}\n**Profil**: [${githubUser.login}](${githubUser.html_url})`
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
    
    // Aktualizuj wiadomość
    await rest.patch(Routes.channelMessage(channelId, messageId), {
      body: {
        components,
        flags: Discord.MessageFlags.IsComponentsV2
      }
    });
    
    return true;
  } catch (error) {
    StatusLogger.error(`Error updating Discord message: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
