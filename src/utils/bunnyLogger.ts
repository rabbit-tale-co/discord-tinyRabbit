import { bunnyLog } from 'bunny-log'

/**
 * BunnyLogger Utility Module
 * Clean logging functions for different contexts in the Discord bot
 */

// Initialize BunnyLog with colored text
const initializeBunnyLogger = () => {
	return bunnyLog
		.setTimeFormat('24h')
		.setShowSeconds(true)
		.enableTextColor()
		.hex('server', '#00d4aa')
		.hex('discord', '#5865f2')
		.hex('database', '#0ea5e9')
		.hex('api', '#8b5cf6')
		.hex('service', '#10b981')
		.hex('guild', '#ec4899')
		.hex('error', '#ef4444')
		.hex('success', '#22c55e')
		.hex('warn', '#f59e0b')
		.hex('info', '#3b82f6')
		.hex('stats', '#14b8a6')
		.hex('command', '#8b5cf6')
		.hex('plugin', '#f59e0b')
}

// Initialize the logger
initializeBunnyLogger()

/**
 * Server & Infrastructure Logging
 */
export const ServerLogger = {
	start: (port: number) =>
		bunnyLog.log('server', `🚀 Server running on port ${port}`),
	error: (error: string | Error) =>
		bunnyLog.log('error', `Server error: ${error}`),
}

/**
 * Discord Bot Logging
 */
export const DiscordLogger = {
	connect: () => bunnyLog.log('discord', '🔗 Connecting to Discord...'),
	ready: (tag: string) =>
		bunnyLog.log('discord', `🐇 ${tag} connected successfully`),
	error: (error: string | Error) =>
		bunnyLog.log('error', `Discord error: ${error}`),
}

/**
 * Database Operations Logging
 */
export const DatabaseLogger = {
	init: () => bunnyLog.log('database', '📊 Initializing database...'),
	connect: () => bunnyLog.log('database', 'Database connected'),
	error: (error: string | Error) =>
		bunnyLog.log('error', `Database error: ${error}`),
	slow: (query: string, time: number) =>
		bunnyLog.log('warn', `Slow query (${time}ms): ${query}`),
}

/**
 * API & External Services Logging
 */
export const APILogger = {
	request: (method: string, endpoint: string) =>
		bunnyLog.log('api', `${method} ${endpoint}`),
	response: (status: number, endpoint: string) =>
		bunnyLog.log('api', `${status} ${endpoint}`),
	error: (error: string | Error, endpoint?: string) =>
		bunnyLog.log(
			'error',
			`API error${endpoint ? ` (${endpoint})` : ''}: ${error}`
		),
	save: (data: string) => bunnyLog.log('api', `💾 Saving ${data}`),
	update: (resource: string) => bunnyLog.log('api', `🔄 Updating ${resource}`),
}

/**
 * Service Management Logging
 */
export const ServiceLogger = {
	init: () => bunnyLog.log('service', '⚡ Initializing bot services'),
	start: (serviceName: string) =>
		bunnyLog.log('service', `🔧 Starting ${serviceName}`),
	ready: (serviceName: string) =>
		bunnyLog.log('service', `✅ ${serviceName} ready`),
	error: (serviceName: string, error: string | Error) =>
		bunnyLog.log('error', `${serviceName} error: ${error}`),
	cleanup: (resource: string, count: number) =>
		bunnyLog.log('service', `🧹 Cleaned up ${count} ${resource}`),
}

/**
 * Guild Management Logging
 */
export const GuildLogger = {
	join: (guildName: string, memberCount: number, guildId: string) =>
		bunnyLog.log(
			'guild',
			`📥 Joined guild: ${guildName} (${memberCount} members)`
		),
	leave: (guildName: string, guildId: string) =>
		bunnyLog.log('guild', `📤 Left guild: ${guildName}`),
	error: (guildName: string, error: string | Error) =>
		bunnyLog.log('error', `Guild ${guildName} error: ${error}`),
}

/**
 * Command & Interaction Logging
 */
export const CommandLogger = {
	execute: (commandName: string, user: string, guild?: string) =>
		bunnyLog.log(
			'command',
			`⚡ ${user} used /${commandName}${guild ? ` in ${guild}` : ''}`
		),
	error: (commandName: string, error: string | Error) =>
		bunnyLog.log('error', `Command ${commandName} error: ${error}`),
	deploy: (count: number) =>
		bunnyLog.log('command', `🚀 Deployed ${count} commands`),
}

/**
 * Plugin & Feature Logging
 */
export const PluginLogger = {
	stats: () => bunnyLog.log('stats', 'Collecting plugin statistics'),
	statsComplete: (count: number) =>
		bunnyLog.log('stats', `Plugin statistics collected for ${count} plugins`),
	error: (pluginName: string, error: string | Error) =>
		bunnyLog.log('error', `Plugin ${pluginName} error: ${error}`),
	totalStats: (guilds: number, users: number) =>
		bunnyLog.log('stats', `Total: ${guilds} guilds, ${users} users`),
}

/**
 * Status & Error Logging
 */
export const StatusLogger = {
	success: (message: string) => bunnyLog.log('success', `${message}`),
	error: (message: string, error?: string | Error) =>
		bunnyLog.log('error', `${message}${error ? `: ${error}` : ''}`),
	warn: (message: string) => bunnyLog.log('warn', `${message}`),
	info: (message: string) => bunnyLog.log('info', `${message}`),
	debug: (message: string) => bunnyLog.log('debug', `${message}`),
}

/**
 * Event System Logging
 */
export const EventLogger = {
	register: () => bunnyLog.log('service', 'Registering Discord event handlers'),
	complete: () => bunnyLog.log('success', 'All event handlers registered'),
	error: (eventName: string, error: string | Error) =>
		bunnyLog.log('error', `Event ${eventName} error: ${error}`),
}

/**
 * Statistics & Analytics Logging
 */
export const StatsLogger = {
	display: (data: any[]) => bunnyLog.table(data),
}

/**
 * Birthday System Logging
 */
export const BirthdayLogger = {
	schedule: () => bunnyLog.log('service', 'Setting up birthday scheduler'),
	error: (error: string | Error) =>
		bunnyLog.log('error', `Birthday system error: ${error}`),
}

// Export the main bunnyLog instance for direct access if needed
export { bunnyLog }
