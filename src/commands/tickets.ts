async function openTicket(interaction: Discord.ButtonInteraction) {
	try {
		await interaction.deferReply({ ephemeral: true })
		// ... rest of openTicket logic ...
	} catch (error) {
		// ... error handling ...
	}
}

async function closeTicketWithReason(interaction: Discord.ButtonInteraction) {
	try {
		await interaction.deferReply({ ephemeral: true })
		// ... rest of closeTicketWithReason logic ...
	} catch (error) {
		// ... error handling ...
	}
}

async function claimTicket(interaction: Discord.ButtonInteraction) {
	try {
		await interaction.deferReply({ ephemeral: true })
		// ... rest of claimTicket logic ...
	} catch (error) {
		// ... error handling ...
	}
}
