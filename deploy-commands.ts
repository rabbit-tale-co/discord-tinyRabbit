const contextMenuCommands = [
	require('./src/commands/moderation/purgeContext').data,
]

const slashCommands = [require('./src/commands/moderation/clear').data]

await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
	body: [...slashCommands, ...contextMenuCommands],
})
