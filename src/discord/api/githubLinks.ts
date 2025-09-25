import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq } from 'drizzle-orm'
import { StatusLogger } from '@/utils/bunnyLogger.js'

/**
 * Find a GitHub-Discord linked account by GitHub username
 * @param {string} githubUsername - The GitHub username to search for
 * @returns The linked account if found, otherwise null
 */
export async function findLinkedGitHubAccount(githubUsername: string) {
  try {
    const linkedAccount = await db.query.githubDiscordLinks.findFirst({
      where: eq(githubDiscordLinks.github_username, githubUsername)
    })

    return linkedAccount
  } catch (error) {
    StatusLogger.error(
      `Error finding linked GitHub account: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

/**
 * Create or update a GitHub-Discord link
 * @param {string} botId - The bot ID
 * @param {string} discordUserId - The Discord user ID
 * @param {string} githubUsername - The GitHub username
 * @returns The created or updated link
 */
export async function createOrUpdateGitHubLink(
  botId: string,
  discordUserId: string,
  githubUsername: string
) {
  try {
    // Check if link already exists
    const existingLink = await db.query.githubDiscordLinks.findFirst({
      where: eq(githubDiscordLinks.discord_user_id, discordUserId)
    })

    if (existingLink) {
      // Update existing link
      await db
        .update(githubDiscordLinks)
        .set({
          github_username: githubUsername,
          updated_at: new Date()
        })
        .where(eq(githubDiscordLinks.discord_user_id, discordUserId))

      return {
        ...existingLink,
        github_username: githubUsername,
        updated_at: new Date()
      }
    } else {
      // Create new link
      const newLink = {
        bot_id: botId,
        discord_user_id: discordUserId,
        github_username: githubUsername,
        created_at: new Date(),
        updated_at: new Date()
      }

      await db.insert(githubDiscordLinks).values(newLink)
      return newLink
    }
  } catch (error) {
    StatusLogger.error(
      `Error creating/updating GitHub link: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }
}

/**
 * Remove a GitHub-Discord link
 * @param {string} discordUserId - The Discord user ID
 * @returns True if successful, false otherwise
 */
export async function removeGitHubLink(discordUserId: string) {
  try {
    await db
      .delete(githubDiscordLinks)
      .where(eq(githubDiscordLinks.discord_user_id, discordUserId))

    return true
  } catch (error) {
    StatusLogger.error(
      `Error removing GitHub link: ${error instanceof Error ? error.message : String(error)}`
    )
    return false
  }
}
