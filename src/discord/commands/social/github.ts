import * as Discord from 'discord.js'
import { createOrUpdateGitHubLink } from '@/discord/api/githubLinks.js'
import { generateVerificationCode, verifyGitHubOwnership } from '@/discord/api/githubVerification.js'
import { handleResponse } from '@/utils/index.js'
import { StatusLogger } from '@/utils/bunnyLogger.js'

// Store pending verifications: Discord user ID -> { githubUsername, verificationCode }
const pendingVerifications = new Map<string, { githubUsername: string; verificationCode: string; timestamp: number }>()

// Verification expires after 30 minutes
const VERIFICATION_EXPIRY_MS = 30 * 60 * 1000

/**
 * Handle GitHub account linking and verification
 * @param interaction The Discord interaction
 */
export async function github(interaction: Discord.ChatInputCommandInteraction) {
  try {
    const userId = interaction.user.id
    const botId = interaction.client.user.id
    
    // Sprawdź, czy podano bezpośredni link do profilu GitHub
    const githubLink = interaction.options.getString('link')
    
    // Sprawdź, czy użytkownik chce użyć metody OAuth
    const useOAuth = interaction.options.getBoolean('use_oauth') ?? true
    
    // Jeśli podano link do profilu GitHub, wyciągnij z niego nazwę użytkownika
    let githubUsername = interaction.options.getString('username')
    if (githubLink && !githubUsername) {
      try {
        const url = new URL(githubLink)
        if (url.hostname === 'github.com') {
          // Format: https://github.com/username
          const pathParts = url.pathname.split('/').filter(Boolean)
          if (pathParts.length > 0) {
            githubUsername = pathParts[0]
          }
        }
      } catch (error) {
        await handleResponse(
          interaction,
          'error',
          'Invalid GitHub URL. Please provide a valid GitHub profile URL.',
          { ephemeral: true, code: 'INVALID_URL' }
        )
        return
      }
    }

    if (useOAuth) {
      // Użyj bezpośrednio GitHub OAuth
      const clientId = process.env.GITHUB_CLIENT_ID
      if (!clientId) {
        await handleResponse(
          interaction,
          'error',
          'GITHUB_CLIENT_ID configuration is missing. Please contact the administrator.',
          { ephemeral: true, code: 'CONFIG_ERROR' }
        )
        return
      }
      
      // Utwórz stan zawierający informacje o użytkowniku Discord i bocie
      const state = Buffer.from(JSON.stringify({ userId, botId })).toString('base64')
      
      // Utwórz URL do autoryzacji OAuth bezpośrednio do GitHub
      const redirectUri = encodeURIComponent(`${process.env.API_BASE_URL || 'https://api.rabbittale.co'}/github/v1/callback`)
      const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=user:email`

      // Utwórz przycisk do autoryzacji
      const row = new Discord.ActionRowBuilder<Discord.ButtonBuilder>()
        .addComponents(
          new Discord.ButtonBuilder()
            .setLabel('Login with GitHub')
            .setStyle(Discord.ButtonStyle.Link)
            .setURL(oauthUrl)
            .setEmoji('🔗')
        )

      await handleResponse(
        interaction,
        'info',
        'Click the button below to connect your Discord account with GitHub:',
        {
          ephemeral: true,
          components: [row]
        }
      )
      return
    }

    // Jeśli użytkownik wybrał metodę weryfikacji kodem
    if (!githubUsername) {
      await handleResponse(
        interaction,
        'error',
        'You must provide a GitHub username or profile link.',
        { ephemeral: true, code: 'MISSING_USERNAME' }
      )
      return
    }

    // Check if user has a pending verification
    const pendingVerification = pendingVerifications.get(userId)
    const verificationCode = interaction.options.getString('verification_code')

    // If no verification code provided, start verification process
    if (!verificationCode) {
      // Generate a new verification code
      const newVerificationCode = generateVerificationCode(userId)

      // Store the pending verification
      pendingVerifications.set(userId, {
        githubUsername,
        verificationCode: newVerificationCode,
        timestamp: Date.now()
      })

      await handleResponse(
        interaction,
        'info',
        `Aby zweryfikować własność konta GitHub **${githubUsername}**, dodaj ten kod do swojego bio na GitHub:\n\n` +
        `\`${newVerificationCode}\`\n\n` +
        `Następnie uruchom ponownie komendę z kodem weryfikacyjnym:\n` +
        `/linkgithub username:${githubUsername} verification_code:${newVerificationCode} use_oauth:false`,
        { ephemeral: true }
      )
      return
    }

    // Verify the code matches and hasn't expired
    if (!pendingVerification ||
        pendingVerification.githubUsername !== githubUsername ||
        pendingVerification.verificationCode !== verificationCode ||
        Date.now() - pendingVerification.timestamp > VERIFICATION_EXPIRY_MS) {

      await handleResponse(
        interaction,
        'error',
        'Invalid or expired verification code. Please restart the verification process.',
        { ephemeral: true, code: 'INVALID_CODE' }
      )
      return
    }

    // Verify GitHub ownership
    const isVerified = await verifyGitHubOwnership(githubUsername, verificationCode)

    if (!isVerified) {
      await handleResponse(
        interaction,
        'error',
        `Could not verify ownership of GitHub account **${githubUsername}**. ` +
        `Please make sure you've added the verification code to your GitHub bio and try again.`,
        { ephemeral: true, code: 'VERIFICATION_FAILED' }
      )
      return
    }

    // Clear the pending verification
    pendingVerifications.delete(userId)

    // Create or update the GitHub link
    await createOrUpdateGitHubLink(botId, userId, githubUsername)

    await handleResponse(
      interaction,
      'success',
      `Successfully verified and linked your Discord account to GitHub user **${githubUsername}**. You'll now receive any applicable sponsor benefits.`,
      { ephemeral: true }
    )
  } catch (error) {
    StatusLogger.error(`Error linking GitHub account: ${error instanceof Error ? error.message : String(error)}`)
    await handleResponse(
      interaction,
      'error',
      'Failed to link your GitHub account. Please try again later.',
      { ephemeral: true, code: 'LINK_FAILED' }
    )
  }
}
