// Main API exports
export * from './bday.js'
export * from './connectSocials.js'
export * from './guilds.js'
export * from './heartbeat/BotStatus.js'
export * from './leaderBoard.js'
export * from './levels.js'
export * from './plugins.js'
export * from './saveBot.js'
export * from './starboard.js'
export * from './tempvc.js'
export * from './tickets.js'
export * from './totalXp.js'
export * from './user.js'
export * from './userRank.js'
export * from './licenseManager.js'

// Newly added license endpoints:
/** Export license verification endpoints */
export * from './licenseEndpoints.js'

// Helper exports
export {
	getPluginConfig,
	updatePluginConfig,
	getAllPluginsCount,
} from './plugins.js'
export { checkHeartbeat } from './heartbeat/BotStatus.js'
export { saveBirthday } from './bday.js'
export { getGlobalRank, getServerRank } from './userRank.js'
export { LicenseManager } from './licenseManager.js'

// Add these exports
export * from './stats.js'
