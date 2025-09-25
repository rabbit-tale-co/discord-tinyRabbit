import * as Discord from 'discord.js'
import { db } from '@/db/index.js'
import { githubDiscordLinks } from '@/db/schema.js'
import { eq } from 'drizzle-orm'
import { StatusLogger } from '@/utils/bunnyLogger.js'
import * as utils from '@/utils/index.js'
import { removeGitHubLink } from '@/discord/api/githubLinks.js'

/**
 * Rozłącza konto GitHub z kontem Discord
 */
export async function disconnect(
  interaction: Discord.ChatInputCommandInteraction
): Promise<void> {
  try {
    await interaction.deferReply({
      ephemeral: true
    })

    const discordUserId = interaction.user.id

    // Sprawdź, czy użytkownik ma połączone konto GitHub
    const links = await db.select()
      .from(githubDiscordLinks)
      .where(
        eq(githubDiscordLinks.discord_user_id, discordUserId)
      )

    if (links.length === 0) {
      // Użytkownik nie ma połączonego konta GitHub
      const components = [
        {
          type: Discord.ComponentType.TextDisplay,
          content: '## Rozłączanie konta GitHub'
        },
        {
          type: Discord.ComponentType.Separator,
          divider: true,
          spacing: Discord.SeparatorSpacingSize.Large
        },
        {
          type: Discord.ComponentType.TextDisplay,
          content: '❌ **Nie masz połączonego konta GitHub**'
        }
      ]

      await interaction.editReply({
        components,
        flags: Discord.MessageFlags.IsComponentsV2
      })
      return
    }

    // Rozłącz konto GitHub
    const success = await removeGitHubLink(discordUserId)

    if (success) {
      const components = [
        {
          type: Discord.ComponentType.TextDisplay,
          content: '## Rozłączanie konta GitHub'
        },
        {
          type: Discord.ComponentType.Separator,
          divider: true,
          spacing: Discord.SeparatorSpacingSize.Large
        },
        {
          type: Discord.ComponentType.TextDisplay,
          content: '✅ **Twoje konto GitHub zostało pomyślnie rozłączone**'
        }
      ]

      await interaction.editReply({
        components,
        flags: Discord.MessageFlags.IsComponentsV2
      })
    } else {
      throw new Error('Wystąpił błąd podczas rozłączania konta GitHub')
    }
  } catch (error) {
    await utils.handleResponse(interaction, 'error', error.message, {
      code: 'GITHUB002',
      ephemeral: true
    })
  }
}