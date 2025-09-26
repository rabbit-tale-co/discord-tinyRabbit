import { EventEmitter } from 'events';
import { StatusLogger } from '@/utils/bunnyLogger';
import * as Discord from 'discord.js';
import { Routes } from 'discord.js';
import { client } from '../../server';

/**
 * Event emitter for GitHub-related events
 */
export const githubEvents = new EventEmitter();

// Event types
export enum GitHubEventType {
  CONNECTION_SUCCESS = 'github:connection:success',
  CONNECTION_FAILURE = 'github:connection:failure',
}

/**
 * Emit a GitHub connection success event
 * @param channelId - Discord channel ID
 * @param userId - Discord user ID
 * @param githubUsername - GitHub username
 */
export function emitGitHubConnectionSuccess(
  channelId: string,
  userId: string,
  githubUsername: string
): void {
  StatusLogger.info(`[GitHub Events] Emitting connection success event: userId=${userId}, githubUsername=${githubUsername}`);
  githubEvents.emit(GitHubEventType.CONNECTION_SUCCESS, {
    channelId,
    userId,
    githubUsername,
  });
}

/**
 * Emit a GitHub connection failure event
 * @param channelId - Discord channel ID
 * @param userId - Discord user ID
 * @param error - Error message
 */
export function emitGitHubConnectionFailure(
  channelId: string,
  userId: string,
  error: string
): void {
  StatusLogger.info(`[GitHub Events] Emitting connection failure event: userId=${userId}, error=${error}`);
  githubEvents.emit(GitHubEventType.CONNECTION_FAILURE, {
    channelId,
    userId,
    error,
  });
}

/**
 * Initialize GitHub event listeners
 * This function sets up listeners for GitHub-related events
 */
export function initGitHubEventListeners(): void {
  // Listen for GitHub connection success events
  githubEvents.on(GitHubEventType.CONNECTION_SUCCESS, async ({ channelId, userId, githubUsername }) => {
    try {
      StatusLogger.info(`[GitHub Events] Handling connection success event for user ${userId}`);
      
      // Get bot token from environment variables
      const botToken = process.env.BOT_TOKEN;
      if (!botToken) {
        StatusLogger.error('[GitHub Events] Missing BOT_TOKEN in environment variables');
        return;
      }

      // Create Discord REST API client
      const rest = new Discord.REST({ version: '10' }).setToken(botToken);

      // Prepare message content
      const content = `✅ GitHub account **${githubUsername}** has been successfully connected to your Discord account!`;

      try {
        // Try to send message to the channel
        await rest.post(Routes.channelMessages(channelId), {
          body: {
            content,
            flags: Discord.MessageFlags.SuppressEmbeds
          }
        });
        StatusLogger.info(`[GitHub Events] Sent connection success message to channel ${channelId} for user ${userId}`);
      } catch (channelError) {
        StatusLogger.error(`[GitHub Events] Error sending message to channel: ${channelError instanceof Error ? channelError.message : String(channelError)}`);
        
        // If sending to channel fails, try to send a DM to the user
        try {
          const user = await client.users.fetch(userId);
          await user.send({
            content: `✅ GitHub account **${githubUsername}** has been successfully connected to your Discord account!`
          });
          StatusLogger.info(`[GitHub Events] Sent connection success DM to user ${userId}`);
        } catch (dmError) {
          StatusLogger.error(`[GitHub Events] Error sending DM to user: ${dmError instanceof Error ? dmError.message : String(dmError)}`);
        }
      }
    } catch (error) {
      StatusLogger.error(`[GitHub Events] Error handling connection success event: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Listen for GitHub connection failure events
  githubEvents.on(GitHubEventType.CONNECTION_FAILURE, async ({ channelId, userId, error }) => {
    try {
      StatusLogger.info(`[GitHub Events] Handling connection failure event for user ${userId}`);
      
      // Get bot token from environment variables
      const botToken = process.env.BOT_TOKEN;
      if (!botToken) {
        StatusLogger.error('[GitHub Events] Missing BOT_TOKEN in environment variables');
        return;
      }

      // Create Discord REST API client
      const rest = new Discord.REST({ version: '10' }).setToken(botToken);

      // Prepare message content
      const content = `❌ An error occurred while trying to connect your GitHub account: ${error}`;

      try {
        // Try to send message to the channel
        await rest.post(Routes.channelMessages(channelId), {
          body: {
            content,
            flags: Discord.MessageFlags.SuppressEmbeds
          }
        });
        StatusLogger.info(`[GitHub Events] Sent connection failure message to channel ${channelId} for user ${userId}`);
      } catch (channelError) {
        StatusLogger.error(`[GitHub Events] Error sending message to channel: ${channelError instanceof Error ? channelError.message : String(channelError)}`);
        
        // If sending to channel fails, try to send a DM to the user
        try {
          const user = await client.users.fetch(userId);
          await user.send({
            content: `❌ An error occurred while trying to connect your GitHub account: ${error}`
          });
          StatusLogger.info(`[GitHub Events] Sent connection failure DM to user ${userId}`);
        } catch (dmError) {
          StatusLogger.error(`[GitHub Events] Error sending DM to user: ${dmError instanceof Error ? dmError.message : String(dmError)}`);
        }
      }
    } catch (error) {
      StatusLogger.error(`[GitHub Events] Error handling connection failure event: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  StatusLogger.info('[GitHub Events] GitHub event listeners initialized');
}