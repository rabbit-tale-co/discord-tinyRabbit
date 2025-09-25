import * as Discord from 'discord.js';
import { Routes } from 'discord.js';
import { StatusLogger } from '@/utils/bunnyLogger.js';
import { setCorsHeaders } from '@/utils/cors.js';
import { emitGitHubConnectionSuccess } from '../events/githubEvents.js';

/**
 * Sends a notification to Discord user after GitHub account connection
 */
export async function sendGitHubConnectionNotification(
  channelId: string,
  discordUserId: string,
  githubUsername: string,
  success: boolean
): Promise<boolean> {
  try {
    // Get bot token from environment variables
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      StatusLogger.error('[GitHub Notification] Missing BOT_TOKEN in environment variables');
      return false;
    }

    // Create Discord REST API client
    const rest = new Discord.REST({ version: '10' }).setToken(botToken);

    // Prepare message content
    let content = '';
    if (success) {
      content = `✅ GitHub account **${githubUsername}** has been successfully connected to your Discord account!`;
    } else {
      content = `❌ An error occurred while trying to connect GitHub account **${githubUsername}** to your Discord account.`;
    }

    // Send message to channel
    await rest.post(Routes.channelMessages(channelId), {
      body: {
        content,
        flags: Discord.MessageFlags.SuppressEmbeds
      }
    });

    StatusLogger.info(`[GitHub Notification] Sent notification about ${success ? 'successful' : 'failed'} GitHub account connection for user ${discordUserId}`);
    return true;
  } catch (error) {
    StatusLogger.error(`[GitHub Notification] Error sending notification: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Handler for GitHub notification endpoint
 */
export async function handleGitHubNotification(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;
    
    // Get parameters from URL
    const channelId = params.get('channelId');
    const discordUserId = params.get('userId');
    const githubUsername = params.get('githubUsername');
    const success = params.get('success') === 'true';
    
    // Check if all required parameters are available
    if (!channelId || !discordUserId || !githubUsername) {
      StatusLogger.error(`[GitHub Notification] Missing parameters: channelId=${channelId}, userId=${discordUserId}, githubUsername=${githubUsername}`);
      return new Response('Missing required parameters', {
        status: 400,
        headers: setCorsHeaders()
      });
    }
    
    StatusLogger.info(`[GitHub Notification] Received notification: channelId=${channelId}, userId=${discordUserId}, githubUsername=${githubUsername}, success=${success}`);
    
    // Emit event instead of sending message directly
    if (success) {
      emitGitHubConnectionSuccess(channelId, discordUserId, githubUsername);
      StatusLogger.info(`[GitHub Notification] Emitted connection success event for user ${discordUserId}`);
    } else {
      // Send failure notification directly
      await sendGitHubConnectionNotification(channelId, discordUserId, githubUsername, false);
    }
    
    return new Response('Notification processed', {
      status: 200,
      headers: setCorsHeaders()
    });
  } catch (error) {
    StatusLogger.error(`[GitHub Notification] Error in handleGitHubNotification: ${error instanceof Error ? error.message : String(error)}`);
    return new Response('Internal Server Error', {
      status: 500,
      headers: setCorsHeaders()
    });
  }
}