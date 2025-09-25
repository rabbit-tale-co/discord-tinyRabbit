import { db } from '@/db/index.js'
import { s3 } from '@/social/lib/media.js'
import { bunnyLog } from '@/utils/bunnyLogger.js'
import { sql } from 'drizzle-orm'

/**
 * Cleanup script to remove orphaned media files from storage
 * This script identifies and removes media files that don't have corresponding posts in the database
 */
async function cleanupOrphanedMedia() {
  try {
    bunnyLog.log('cleanup', 'Starting orphaned media cleanup process')
    
    // Get all valid media paths from the database
    // This query should be adjusted based on your actual database schema
    const validMediaResult = await db.execute(sql`
      SELECT path, thumbnail_path 
      FROM social_posts 
      WHERE path IS NOT NULL
    `)
    
    // Extract valid paths and thumbnail paths
    const validPaths = new Set<string>()
    for (const row of validMediaResult) {
      if (row.path) validPaths.add(row.path)
      if (row.thumbnail_path) validPaths.add(row.thumbnail_path)
    }
    
    bunnyLog.log('cleanup', `Found ${validPaths.size} valid media paths in database`)
    
    // List all files in the posts directory
    const mediaFiles = await listS3Files('posts/')
    bunnyLog.log('cleanup', `Found ${mediaFiles.length} total media files in storage`)
    
    // Identify orphaned files
    const orphanedFiles = mediaFiles.filter(file => !validPaths.has(file))
    bunnyLog.log('cleanup', `Identified ${orphanedFiles.length} orphaned media files`)
    
    // Delete orphaned files
    let deletedCount = 0
    for (const file of orphanedFiles) {
      try {
        await s3.remove(file)
        deletedCount++
        bunnyLog.log('cleanup', `Deleted orphaned file: ${file}`)
      } catch (error) {
        bunnyLog.error(`Failed to delete file ${file}: ${(error as Error).message}`)
      }
    }
    
    bunnyLog.log('cleanup', `Cleanup completed. Deleted ${deletedCount} orphaned files`)
    return { total: mediaFiles.length, orphaned: orphanedFiles.length, deleted: deletedCount }
  } catch (error) {
    bunnyLog.error(`Error during media cleanup: ${(error as Error).message}`)
    throw error
  }
}

/**
 * List all files in an S3 directory
 */
async function listS3Files(prefix: string): Promise<string[]> {
  try {
    // This implementation depends on your S3 client's capabilities
    // For now, we'll use a simple approach that works with most S3 clients
    const objects = await s3.list({ prefix })
    return objects.map(obj => obj.key)
  } catch (error) {
    bunnyLog.error(`Failed to list S3 files: ${(error as Error).message}`)
    return []
  }
}

// Export for use in cron job
export { cleanupOrphanedMedia }

// Allow running directly
if (import.meta.main) {
  cleanupOrphanedMedia()
    .then(result => {
      console.log('Cleanup completed:', result)
      process.exit(0)
    })
    .catch(error => {
      console.error('Cleanup failed:', error)
      process.exit(1)
    })
}