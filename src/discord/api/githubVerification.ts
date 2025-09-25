import { StatusLogger } from '@/utils/bunnyLogger.js'

/**
 * Verify GitHub username ownership using a verification code
 * 
 * This function checks if the user has added a specific verification code
 * to their GitHub profile or repository to prove ownership
 */
export async function verifyGitHubOwnership(
  githubUsername: string,
  verificationCode: string
): Promise<boolean> {
  try {
    // Fetch user profile from GitHub API
    const response = await fetch(`https://api.github.com/users/${githubUsername}`)
    
    if (!response.ok) {
      StatusLogger.error(`GitHub API error: ${response.status} ${response.statusText}`)
      return false
    }
    
    const userData = await response.json()
    
    // Check if verification code exists in bio or profile
    if (userData.bio && userData.bio.includes(verificationCode)) {
      return true
    }
    
    // Could also check for a verification repository or gist
    // This is a simplified implementation
    
    return false
  } catch (error) {
    StatusLogger.error(`Error verifying GitHub ownership: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * Generate a unique verification code for a Discord user
 */
export function generateVerificationCode(discordUserId: string): string {
  // Create a verification code using Discord user ID and timestamp
  const timestamp = Date.now().toString(36)
  const prefix = 'DISCORD-VERIFY-'
  
  // Use first 8 chars of Discord ID + timestamp for uniqueness
  return `${prefix}${discordUserId.slice(0, 8)}-${timestamp}`
}