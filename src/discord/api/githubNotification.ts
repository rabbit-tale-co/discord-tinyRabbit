import * as Discord from 'discord.js';
import { Routes } from 'discord.js';
import { StatusLogger } from '@/utils/bunnyLogger.js';
import { setCorsHeaders } from '@/utils/cors.js';

/**
 * Wysyła powiadomienie do użytkownika Discord po pomyślnym połączeniu konta GitHub
 */
export async function sendGitHubConnectionNotification(
  channelId: string,
  discordUserId: string,
  githubUsername: string,
  success: boolean
): Promise<boolean> {
  try {
    // Pobierz token bota ze zmiennych środowiskowych
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      StatusLogger.error('[GitHub Notification] Brak BOT_TOKEN w zmiennych środowiskowych');
      return false;
    }

    // Utwórz klienta REST API Discord
    const rest = new Discord.REST({ version: '10' }).setToken(botToken);

    // Przygotuj treść wiadomości
    let content = '';
    if (success) {
      content = `✅ Konto GitHub **${githubUsername}** zostało pomyślnie połączone z Twoim kontem Discord!`;
    } else {
      content = `❌ Wystąpił błąd podczas próby połączenia konta GitHub **${githubUsername}** z Twoim kontem Discord.`;
    }

    // Wyślij wiadomość do kanału
    await rest.post(Routes.channelMessages(channelId), {
      body: {
        content,
        flags: Discord.MessageFlags.SuppressEmbeds
      }
    });

    StatusLogger.info(`[GitHub Notification] Wysłano powiadomienie o ${success ? 'pomyślnym' : 'nieudanym'} połączeniu konta GitHub dla użytkownika ${discordUserId}`);
    return true;
  } catch (error) {
    StatusLogger.error(`[GitHub Notification] Błąd wysyłania powiadomienia: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Handler dla endpointu powiadomień GitHub
 */
export async function handleGitHubNotification(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    
    // Pobierz parametry z URL
    const channelId = params.get('channelId');
    const discordUserId = params.get('userId');
    const githubUsername = params.get('githubUsername');
    const success = params.get('success') === 'true';
    
    // Sprawdź, czy wszystkie wymagane parametry są dostępne
    if (!channelId || !discordUserId || !githubUsername) {
      StatusLogger.error(`[GitHub Notification] Brakujące parametry: channelId=${channelId}, userId=${discordUserId}, githubUsername=${githubUsername}`);
      return new Response('Missing required parameters', {
        status: 400,
        headers: setCorsHeaders()
      });
    }
    
    // Wyślij powiadomienie
    await sendGitHubConnectionNotification(channelId, discordUserId, githubUsername, success);
    
    return new Response('Notification sent', {
      status: 200,
      headers: setCorsHeaders()
    });
  } catch (error) {
    StatusLogger.error(`[GitHub Notification] Błąd w handleGitHubNotification: ${error instanceof Error ? error.message : String(error)}`);
    return new Response('Internal Server Error', {
      status: 500,
      headers: setCorsHeaders()
    });
  }
}