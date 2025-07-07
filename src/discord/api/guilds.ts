import { APILogger, StatusLogger } from "@/utils/bunnyLogger.js";
import * as Discord from "discord.js";

async function fetchDiscordAPI(endpoint: string) {
	const response = await fetch(`https://discord.com/api/${endpoint}`, {
		headers: {
			Authorization: `Bot ${process.env.BOT_TOKEN}`,
		},
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch from endpoint: ${endpoint}, Status: ${response.status}`,
		);
	}

	return response.json();
}

async function getCustomInvite(guildId: string) {
	try {
		// First check if we can access guild data to verify permissions
		try {
			const guild = await fetchDiscordAPI(`guilds/${guildId}`);
			// Check if bot has the MANAGE_GUILD permission (0x0020 is the bitwise flag for MANAGE_GUILD)
			const botPermissions = BigInt(guild.permissions || "0");
			const hasManageGuildPermission =
				(botPermissions & BigInt(0x0020)) === BigInt(0x0020);

			if (!hasManageGuildPermission) {
				return null;
			}
		} catch (error) {
			return null;
		}

		const invites = await fetchDiscordAPI(`guilds/${guildId}/invites`);
		return invites.length > 0 ? invites[0].code : null;
	} catch (error) {
		// If it's a 403 error, log it as info rather than error since it's an expected limitation
		if (error instanceof Error && error.message.includes("Status: 403")) {
			StatusLogger.info(`No permission to fetch invites for guild ${guildId}`);
		} else {
			APILogger.error(
				`Error fetching custom invites: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		return null;
	}
}

async function getBotGuilds() {
	try {
		const guilds = await fetchDiscordAPI("users/@me/guilds?with_counts=true");

		const detailedGuilds = await Promise.all(
			guilds.map(async (guild: Discord.Guild) => {
				let invite_link = "";

				if (guild.features.includes(Discord.GuildFeature.Community)) {
					const inviteCode = await getCustomInvite(guild.id);
					invite_link = inviteCode ? `https://discord.gg/${inviteCode}` : "";
				}

				const getRandomAvatar = () => {
					const randomNumber = Math.floor(Math.random() * 6); // 0-5
					return `https://cdn.discordapp.com/embed/avatars/${randomNumber}.png?size=4096`;
				};

				const icon = guild.icon
					? guild.icon.startsWith("a_")
						? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.gif?size=4096`
						: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=4096`
					: getRandomAvatar();

				return {
					...guild,
					icon,
					invite_link,
					botInGuild: true, // Bot is always in its own guilds
				};
			}),
		);

		return detailedGuilds;
	} catch (error) {
		APILogger.error(
			`Error fetching bot guilds: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}
}

// New dedicated function for user managed guilds using Discord user ID
async function getUserManagedGuilds(discordUserId: string) {
	try {
		console.log(
			"getUserManagedGuilds: Starting with Discord user ID:",
			discordUserId,
		);

		// First get all bot guilds
		const botGuilds = await fetchDiscordAPI(
			"users/@me/guilds?with_counts=true",
		);
		console.log("getUserManagedGuilds: Bot is in", botGuilds.length, "guilds");

		// Filter guilds where the user has MANAGE_GUILD permission
		const managedGuilds = await Promise.all(
			botGuilds.map(async (guild: any) => {
				try {
					// Check if user is a member of this guild
					const member = await fetchDiscordAPI(
						`guilds/${guild.id}/members/${discordUserId}`,
					);

					if (!member) {
						console.log(
							`User ${discordUserId} not found in guild ${guild.name}`,
						);
						return null;
					}

					// Calculate user permissions in this guild
					let userPermissions = BigInt(0);

					// Get @everyone role permissions (base permissions)
					const everyoneRole = guild.roles?.find(
						(role: any) => role.id === guild.id,
					);
					if (everyoneRole) {
						userPermissions |= BigInt(everyoneRole.permissions || 0);
					}

					// Add permissions from user's roles
					if (member.roles && member.roles.length > 0) {
						// Fetch guild roles to get permissions
						const guildRoles = await fetchDiscordAPI(
							`guilds/${guild.id}/roles`,
						);

						for (const roleId of member.roles) {
							const role = guildRoles.find((r: any) => r.id === roleId);
							if (role) {
								userPermissions |= BigInt(role.permissions || 0);
							}
						}
					}

					// Check if user has MANAGE_GUILD permission (0x0020)
					const hasManageGuild =
						(userPermissions & BigInt(0x0020)) === BigInt(0x0020);
					// Also check for ADMINISTRATOR permission (0x0008) which grants all permissions
					const hasAdmin =
						(userPermissions & BigInt(0x0008)) === BigInt(0x0008);

					console.log(
						`Guild ${guild.name}: hasManageGuild=${hasManageGuild}, hasAdmin=${hasAdmin}`,
					);

					if (hasManageGuild || hasAdmin) {
						return guild;
					}

					return null;
				} catch (memberError) {
					console.log(
						`Error checking member ${discordUserId} in guild ${guild.id}:`,
						memberError,
					);
					return null;
				}
			}),
		);

		// Filter out null results
		const validManagedGuilds = managedGuilds.filter((guild) => guild !== null);
		console.log(
			"getUserManagedGuilds: User has manage permissions in",
			validManagedGuilds.length,
			"guilds",
		);

		// Process guild details (icons, invites, etc.)
		const detailedGuilds = await Promise.all(
			validManagedGuilds.map(async (guild: Discord.Guild) => {
				try {
					let invite_link = "";

					if (guild.features?.includes(Discord.GuildFeature.Community)) {
						const inviteCode = await getCustomInvite(guild.id);
						invite_link = inviteCode ? `https://discord.gg/${inviteCode}` : "";
					}

					const getRandomAvatar = () => {
						const randomNumber = Math.floor(Math.random() * 6); // 0-5
						return `https://cdn.discordapp.com/embed/avatars/${randomNumber}.png?size=4096`;
					};

					const icon = guild.icon
						? guild.icon.startsWith("a_")
							? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.gif?size=4096`
							: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=4096`
						: getRandomAvatar();

					return {
						...guild,
						icon,
						invite_link,
						botInGuild: true, // Bot is always in its own guilds
					};
				} catch (guildError) {
					console.error(`Error processing guild ${guild.id}:`, guildError);
					// Return basic guild info even if detailed processing fails
					return {
						...guild,
						icon: `https://cdn.discordapp.com/embed/avatars/0.png?size=4096`,
						invite_link: "",
						botInGuild: true,
					};
				}
			}),
		);

		console.log(
			"getUserManagedGuilds: Final detailed guilds count:",
			detailedGuilds.length,
		);
		return detailedGuilds;
	} catch (error) {
		console.error("getUserManagedGuilds: Full error details:", error);
		APILogger.error(
			`Error fetching user managed guilds: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}
}

async function getGuildDetails(guild_id: string) {
	try {
		const [guild, channels, roles] = await Promise.all([
			fetchDiscordAPI(
				`guilds/${guild_id}?with_counts=true`,
			) as Promise<Discord.AnonymousGuild>,
			fetchDiscordAPI(`guilds/${guild_id}/channels`) as Promise<
				Discord.GuildChannel[]
			>,
			fetchDiscordAPI(`guilds/${guild_id}/roles`) as Promise<Discord.Role[]>,
		]);

		const category_count = channels.filter(
			(channel) => channel.type === Discord.ChannelType.GuildCategory,
		).length;
		const text_channel_count = channels.filter(
			(channel) => channel.type === Discord.ChannelType.GuildText,
		).length;
		const voice_channel_count = channels.filter(
			(channel) => channel.type === Discord.ChannelType.GuildVoice,
		).length;

		const filtered_roles = roles.filter(
			(role) => !role.managed && role.id !== guild_id,
		);

		return {
			guild_details: guild,
			category_count,
			text_channel_count,
			voice_channel_count,
			roles: filtered_roles,
			channels,
		};
	} catch (error) {
		APILogger.error(
			`Error fetching guild details: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}
}

async function checkBotMembership(guildId: Discord.Snowflake) {
	try {
		const response = await fetch(`https://discord.com/api/guilds/${guildId}`, {
			headers: {
				Authorization: `Bot ${process.env.BOT_TOKEN}`,
			},
		});

		if (response.ok) return true;

		if ([401, 403, 404].includes(response.status)) return false;

		StatusLogger.error(`Unexpected status code: ${response.status}`);
		return false;
	} catch (error) {
		APILogger.error(
			`Error checking bot membership: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

async function checkUserOnServer(
	user_id: Discord.User["id"],
	guild_id: Discord.Guild["id"],
): Promise<boolean> {
	try {
		return await fetchDiscordAPI(`guilds/${guild_id}/members/${user_id}`)
			.then(() => true)
			.catch(() => false);
	} catch (error) {
		APILogger.error(
			`Error checking user on server: ${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	}
}

export {
	getGuildDetails,
	checkBotMembership,
	getBotGuilds,
	getUserManagedGuilds,
	checkUserOnServer,
};
