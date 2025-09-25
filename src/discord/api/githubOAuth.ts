import { StatusLogger } from '@/utils/bunnyLogger.js'
import { setCorsHeaders } from '@/utils/cors.js'
import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq } from 'drizzle-orm'

// Interfaces for OAuth responses
interface GitHubOAuthTokenResponse {
  access_token: string
  token_type: string
  scope: string
}

interface GitHubUserResponse {
  login: string
  id: number
  name: string
  email: string
}

/**
 * Handle GitHub OAuth authorization request
 * Redirects the user to GitHub login page
 */
export async function handleGitHubOAuth(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const discordUserId = url.searchParams.get('discord_user_id')
    const botId = url.searchParams.get('bot_id')

    if (!discordUserId || !botId) {
      return new Response('Missing parameters: discord_user_id or bot_id', {
        status: 400,
        headers: setCorsHeaders()
      })
    }

    // Save session state for verification in callback
    const state = Buffer.from(JSON.stringify({ discordUserId, botId })).toString('base64')

    // Create GitHub authorization URL
    const githubClientId = process.env.GITHUB_CLIENT_ID
    if (!githubClientId) {
      StatusLogger.error('Missing GITHUB_CLIENT_ID in environment variables')
      return new Response('Server configuration error', {
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
    let stateData: { discordUserId: string, botId: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    } catch (error) {
      return new Response('Invalid state format', {
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
    await createOrUpdateGitHubLink(
      stateData.botId,
      stateData.discordUserId,
      githubUser.login
    )

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
 * Exchanges authorization code for an access token
 */
async function exchangeCodeForToken(code: string): Promise<GitHubOAuthTokenResponse | null> {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      StatusLogger.error('Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET in environment variables')
      return null
    }

    StatusLogger.info(`Exchanging code for token with client ID: ${clientId}`)
    
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: `${process.env.API_BASE_URL}/github/v1/callback`
      })
    })

    if (!response.ok) {
      const responseText = await response.text();
      StatusLogger.error(`GitHub API error: ${response.status} ${response.statusText} - ${responseText}`)
      return null
    }

    const data = await response.json();
    StatusLogger.info('Successfully obtained GitHub access token');
    return data;
  } catch (error) {
    StatusLogger.error(`Error exchanging code for token: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Pobiera dane użytkownika GitHub za pomocą tokenu dostępu
 */
async function fetchGitHubUser(accessToken: string): Promise<GitHubUserResponse | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    })

    if (!response.ok) {
      StatusLogger.error(`GitHub API error: ${response.status} ${response.statusText}`)
      return null
    }

    return await response.json()
  } catch (error) {
    StatusLogger.error(`Błąd podczas pobierania danych użytkownika GitHub: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Tworzy lub aktualizuje powiązanie konta Discord z GitHub
 */
export async function createOrUpdateGitHubLink(
  botId: string,
  discordUserId: string,
  githubUsername: string
): Promise<boolean> {
  try {
    // Sprawdź, czy powiązanie już istnieje
    const existingLinks = await db.select()
      .from(githubDiscordLinks)
      .where(
        eq(githubDiscordLinks.discord_user_id, discordUserId)
      )

    if (existingLinks.length > 0) {
      // Aktualizuj istniejące powiązanie
      await db.update(githubDiscordLinks)
        .set({
          github_username: githubUsername,
          updated_at: new Date()
        })
        .where(
          eq(githubDiscordLinks.discord_user_id, discordUserId)
        )
    } else {
      // Utwórz nowe powiązanie
      await db.insert(githubDiscordLinks)
        .values({
          bot_id: botId,
          discord_user_id: discordUserId,
          github_username: githubUsername
        })
    }

    return true
  } catch (error) {
    StatusLogger.error(`Błąd podczas zapisywania powiązania GitHub: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * Znajduje powiązane konto Discord dla nazwy użytkownika GitHub
 */
export async function findLinkedDiscordAccount(githubUsername: string): Promise<string | null> {
  try {
    const links = await db.select()
      .from(githubDiscordLinks)
      .where(
        eq(githubDiscordLinks.github_username, githubUsername)
      )

    if (links.length > 0) {
      return links[0].discord_user_id
    }

    return null
  } catch (error) {
    StatusLogger.error(`Błąd podczas wyszukiwania powiązanego konta Discord: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
