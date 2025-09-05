import * as Discord from 'discord.js'
import * as V2 from 'discord-components-v2'

export function createRichEmbedContainer() {
	// Create button accessories
	const refreshButton = V2.makeButton({
		custom_id: 'refresh_stats',
		label: '🔄 Odśwież',
		style: Discord.ButtonStyle.Primary,
	})

	const settingsButton = V2.makeButton({
		custom_id: 'open_settings',
		label: '⚙️',
		style: Discord.ButtonStyle.Secondary,
	})

	const settingsButton2 = V2.makeButton({
		custom_id: 'open_settings_container',
		label: '⚙️',
		style: Discord.ButtonStyle.Secondary,
	})

	const testSelect = V2.makeStringSelect('test_select')
		.addOptions({
			label: 'Test',
			value: 'test',
			description: 'Test Description',
			emoji: '⚙️',
		})
		.addOptions({
			label: 'Test2',
			value: 'test2',
		})
		.setPlaceholder('choose test values')
	const testSelectRow = V2.makeActionRow([testSelect])

	// Create thumbnail with default Discord avatar
	const thumbnail = new Discord.ThumbnailBuilder().setURL(
		'https://discord.com/assets/1f0bfc0865d324c2587920a7d80c609b.png'
	)

	// Create media gallery with default Discord avatars
	const gallery = V2.makeMediaGallery([
		{
			media: {
				url: 'https://discord.com/assets/1f0bfc0865d324c2587920a7d80c609b.png',
			},
		},
		{
			media: {
				url: 'https://discord.com/assets/c09a43a372ba81e3018c3151d4ed4773.png',
			},
		},
		{
			media: {
				url: 'https://discord.com/assets/7c8f476123d28d103efe381543274c25.png',
			},
		},
	])

	// Create gallery text and section
	const galleryTitle = V2.makeTextDisplay('## Galeria')
	const galleryButton = new Discord.ButtonBuilder()
		.setCustomId('gallery_refresh')
		.setLabel('🖼️ Odśwież')
		.setStyle(Discord.ButtonStyle.Secondary)
	const galleryTitleSection = V2.makeSection([galleryTitle], galleryButton)

	// Create text displays
	const title = V2.makeTextDisplay('# Raport Systemu')
	const description = V2.makeTextDisplay('Poniżej podgląd głównych statystyk.')

	// Create sections with required accessories
	const headerSection = V2.makeSection([title, description], thumbnail)

	// Create a separator with large spacing
	const separator = V2.makeSeparator({
		spacing: Discord.SeparatorSpacingSize.Large,
		divider: true,
	})

	// Create stats text displays
	const statsTitle = V2.makeTextDisplay('**🔍 Statystyki**')
	const statsUsers = V2.makeTextDisplay('Użytkowników: **1 254**')
	const statsSessions = V2.makeTextDisplay('Sesje (24h): **3 482**')

	const statsSection = V2.makeSection(
		[statsTitle, statsUsers, statsSessions],
		settingsButton
	)

	// Create channel select for notifications
	const notificationChannelSelect = V2.makeChannelSelect({
		custom_id: 'notification_channel',
		placeholder: '📢 Wybierz kanał powiadomień',
		channel_types: [Discord.ChannelType.GuildText],
		min_values: 1,
		max_values: 1,
	})
	const channelSelectRow = V2.makeActionRow([notificationChannelSelect])

	// Create mentionable select for notifications
	const notificationMentionableSelect = V2.makeMentionableSelect({
		custom_id: 'notification_mentionable',
		placeholder: '📢 Wybierz użytkownika powiadomienia',
		min_values: 1,
		max_values: 1,
	})
	const mentionableSelectRow = V2.makeActionRow([notificationMentionableSelect])

	// Create role select for notifications
	const notificationRoleSelect = V2.makeRoleSelect({
		custom_id: 'notification_role',
		placeholder: '📢 Wybierz rolę powiadomienia',
		min_values: 1,
		max_values: 1,
	})
	const roleSelectRow = V2.makeActionRow([notificationRoleSelect])

	// Create user select for notifications
	const notificationUserSelect = V2.makeUserSelect({
		custom_id: 'notification_user',
		placeholder: '📢 Wybierz użytkownika powiadomienia',
		min_values: 1,
		max_values: 1,
	})
	const userSelectRow = V2.makeActionRow([notificationUserSelect])

	// Create file component for test.txt
	const file = V2.makeFile(
		{
			url: V2.createAttachmentUrl('test.txt'),
		},
		{ spoiler: true }
	)

	// Create action row with buttons
	const actionButtons = [
		V2.makeButton({
			custom_id: 'prev_page',
			label: '◀️',
			style: Discord.ButtonStyle.Secondary,
		}),
		V2.makeButton({
			custom_id: 'next_page',
			label: '▶️',
			style: Discord.ButtonStyle.Secondary,
		}),
		V2.makeButton({
			custom_id: 'close',
			label: '🔒 Zamknij',
			style: Discord.ButtonStyle.Danger,
		}),
	]
	const actionRow = V2.makeActionRow(actionButtons)

	const settingsContainer = V2.makeContainer([
		V2.makeSection(
			[
				V2.makeTextDisplay('**🔍 Statystyki**'),
				V2.makeTextDisplay('Użytkowników: **1 254**'),
				V2.makeTextDisplay('Sesje (24h): **3 482**'),
			],
			settingsButton2
		),
	])
		.setColor(Discord.Colors.Blurple)
		.setSpoiler(false)

	return {
		components: [
			headerSection,
			separator,
			galleryTitleSection,
			gallery,
			separator,
			statsSection,
			channelSelectRow,
			mentionableSelectRow,
			roleSelectRow,
			userSelectRow,
			actionRow,
			file,
			settingsContainer,
			testSelectRow,
		],
		flags: Discord.MessageFlags.IsComponentsV2,
	}
}

// ─── przykładowe użycie w komendzie ──────────────────────────────
export async function handleReportCommand(
	interaction: Discord.ChatInputCommandInteraction
) {
	await interaction.deferReply({
		flags: Discord.MessageFlags.Ephemeral,
	})

	const payload = createRichEmbedContainer()
	await interaction.editReply({
		files: [
			{
				attachment: './src/assets/test.txt',
				name: 'test.txt',
			},
		],
		components: payload.components,
		flags: Discord.MessageFlags.IsComponentsV2,
	})
}
