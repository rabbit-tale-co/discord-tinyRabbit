import { db } from '@/db/index.js'
import { bots } from '@/db/schema.js'
import { eq } from 'drizzle-orm'
import { StatusLogger } from '@/utils/bunnyLogger.js'

/**
 * Get bot token by bot ID from database
 * @param botId - Bot ID
 * @returns Bot token or null if not found
 */
export async function getBotTokenById(botId: string): Promise<string | null> {
  try {
    const [botData] = await db
      .select({ token: bots.bot_token })
      .from(bots)
      .where(eq(bots.bot_id, botId))
      .limit(1)

    return botData?.token ?? null
  } catch (error) {
    StatusLogger.error(`[getBotTokenById] Error getting bot token: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}