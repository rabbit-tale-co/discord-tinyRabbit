// Main API exports
export * from './bday.js'
export { saveBirthday } from './bday.js'
export * from './connectSocials.js'
export * from './guilds.js'
export * from './heartbeat/BotStatus.js'
export { checkHeartbeat } from './heartbeat/BotStatus.js'
export * from './leaderBoard.js'
export * from './levels.js'
// Newly added license endpoints:
/** Export license verification endpoints */
export * from './licenseEndpoints.js'
export * from './licenseManager.js'
export { LicenseManager } from './licenseManager.js'
export * from './patreonWebhook.js'
export * from './githubSponsorsWebhook.js'
export * from './plugins.js'
// Helper exports
export {
	getAllPluginsCount,
	getPluginConfig,
	updatePluginConfig,
} from './plugins.js'
export * from './saveBot.js'
export * from './starboard.js'
// Add these exports
export * from './stats.js'
export * from './tempvc.js'
export * from './tickets.js'
export * from './totalXp.js'
export * from './user.js'
export * from './userRank.js'
export { getGlobalRank, getServerRank } from './userRank.js'
