import { StatusLogger } from '@/utils/bunnyLogger.js'
import { setCorsHeaders } from '@/utils/cors.js'
import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq } from 'drizzle-orm'

// Interfejsy dla odpowiedzi OAuth
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
 * Obsługa żądania autoryzacji GitHub OAuth
 * Przekierowuje użytkownika do strony logowania GitHub
 */
export async function handleGitHubOAuth(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const discordUserId = url.searchParams.get('discord_user_id')
    const botId = url.searchParams.get('bot_id')
    
    if (!discordUserId || !botId) {
      return new Response('Brakujące parametry: discord_user_id lub bot_id', { 
        status: 400,
        headers: setCorsHeaders()
      })
    }
    
    // Zapisz stan sesji do weryfikacji w callbacku
    const state = Buffer.from(JSON.stringify({ discordUserId, botId })).toString('base64')
    
    // Utwórz URL autoryzacji GitHub
    const githubClientId = process.env.GITHUB_CLIENT_ID
    if (!githubClientId) {
      StatusLogger.error('Brak GITHUB_CLIENT_ID w zmiennych środowiskowych')
      return new Response('Błąd konfiguracji serwera', { 
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
    
    // Przekieruj użytkownika do GitHub
    return Response.redirect(authUrl.toString(), 302)
  } catch (error) {
    StatusLogger.error(`Błąd podczas obsługi GitHub OAuth: ${error instanceof Error ? error.message : String(error)}`)
    return new Response('Wystąpił błąd podczas autoryzacji', { 
      status: 500,
      headers: setCorsHeaders()
    })
  }
}

/**
 * Obsługa callbacku GitHub OAuth
 * Odbiera kod autoryzacji i wymienia go na token dostępu
 */
export async function handleGitHubOAuthCallback(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    
    if (!code || !state) {
      return new Response('Brakujące parametry: code lub state', { 
        status: 400,
        headers: setCorsHeaders()
      })
    }
    
    // Dekoduj stan sesji
    let stateData: { discordUserId: string, botId: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    } catch (error) {
      return new Response('Nieprawidłowy format state', { 
        status: 400,
        headers: setCorsHeaders()
      })
    }
    
    // Wymień kod na token dostępu
    const tokenResponse = await exchangeCodeForToken(code)
    if (!tokenResponse) {
      return new Response('Nie udało się uzyskać tokenu dostępu', { 
        status: 500,
        headers: setCorsHeaders()
      })
    }
    
    // Pobierz dane użytkownika GitHub
    const githubUser = await fetchGitHubUser(tokenResponse.access_token)
    if (!githubUser) {
      return new Response('Nie udało się pobrać danych użytkownika GitHub', { 
        status: 500,
        headers: setCorsHeaders()
      })
    }
    
    // Zapisz powiązanie konta Discord z GitHub
    await createOrUpdateGitHubLink(
      stateData.botId,
      stateData.discordUserId,
      githubUser.login
    )
    
    // Przekieruj do strony sukcesu
    const successUrl = new URL(`${process.env.FRONTEND_URL || 'https://discord.com'}/oauth/success`)
    successUrl.searchParams.append('provider', 'github')
    successUrl.searchParams.append('username', githubUser.login)
    
    return Response.redirect(successUrl.toString(), 302)
  } catch (error) {
    StatusLogger.error(`Błąd podczas obsługi GitHub OAuth callback: ${error instanceof Error ? error.message : String(error)}`)
    return new Response('Wystąpił błąd podczas autoryzacji', { 
      status: 500,
      headers: setCorsHeaders()
    })
  }
}

/**
 * Wymienia kod autoryzacji na token dostępu
 */
async function exchangeCodeForToken(code: string): Promise<GitHubOAuthTokenResponse | null> {
  try {
    const clientId = process.env.GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET
    
    if (!clientId || !clientSecret) {
      StatusLogger.error('Brak GITHUB_CLIENT_ID lub GITHUB_CLIENT_SECRET w zmiennych środowiskowych')
      return null
    }
    
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
      StatusLogger.error(`GitHub API error: ${response.status} ${response.statusText}`)
      return null
    }
    
    return await response.json()
  } catch (error) {
    StatusLogger.error(`Błąd podczas wymiany kodu na token: ${error instanceof Error ? error.message : String(error)}`)
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