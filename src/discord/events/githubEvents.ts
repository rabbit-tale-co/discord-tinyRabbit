import { EventEmitter } from 'events';
import { StatusLogger } from '@/utils/bunnyLogger';

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