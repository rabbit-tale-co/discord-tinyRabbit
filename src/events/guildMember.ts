import type * as Discord from "discord.js";
import * as api from "@/api/index.js";
import * as utils from "@/utils/index.js";
import * as components from "@/components/index.js";
import { bunnyLog } from "bunny-log";
import { InteractionType } from "discord.js";

// Add proper type definitions
type EmbedFieldConfig = {
	name: string;
	value: string;
	inline?: boolean;
};

/**
 * Handles the guild member join event.
 * @param {Discord.GuildMember} member - The member that joined the guild.
 */
async function handleMemberJoin(member: Discord.GuildMember) {
	// Get the config
	const config = await api.getPluginConfig(
		member.client.user.id,
		member.guild.id,
		"welcome",
	);

	// Check if the plugin is enabled
	if (!config.enabled) {
		//bunnyLog.error(`Welcome plugin is disabled in ${member.guild.id}`)
		return;
	}

	// Check if the welcome channel is set
	if (!config.welcome_channel_id) {
		//bunnyLog.error(`Welcome channel is not set in ${member.guild.id}`)
		return;
	}

	// Get the welcome channel
	const welcome_channel = member.guild.channels.cache.get(
		config.welcome_channel_id,
	) as Discord.TextChannel | undefined;

	// Check if the welcome channel is found
	if (!welcome_channel)
		//return bunnyLog.error(
		//	`Welcome channel with ID ${config.welcome_channel_id} not found`
		//)
		return;

	// Assign join role if specified
	if (config.join_role_ids) {
		// Get the join role
		for (const role_id of config.join_role_ids) {
			const role = member.guild.roles.cache.get(role_id);

			// Check if the join role is found
			if (role) {
				// Add the join role
				await member.roles.add(role).catch((error) => {
					bunnyLog.error(
						`Error adding role ${role_id} to ${member.user.username}: ${error}`,
					);
				});
			} else {
				bunnyLog.error(`Role with ID ${role_id} not found`);
			}
		}
	}

	// Send welcome message
	if (config.type === "embed") {
		// Check if the embed is set
		if (!config.embed_welcome) {
			const owner = await member.guild.fetchOwner();
			if (owner) {
				try {
					await owner.send(
						`⚠️ [${member.guild.name}] Welcome Plugin Configuration Error:\nThe embed configuration is missing from your welcome plugin settings.\nPlease update your dashboard configuration to provide a valid embed for welcome messages.`,
					);
				} catch (err) {
					bunnyLog.error(
						`Could not DM owner of guild ${member.guild.name} about welcome plugin misconfiguration: ${err}`,
					);
				}
			} else {
				bunnyLog.error(
					`Could not fetch owner for guild ${member.guild.id} while reporting welcome configuration error.`,
				);
			}
			return;
		}

		const embedConfig: Discord.EmbedData & {
			fields?: Array<Discord.EmbedField>;
		} = {
			...config.embed_welcome,
			title: utils.replacePlaceholders(
				config.embed_welcome.title ?? "",
				member,
				member.guild,
			),
			description: utils.replacePlaceholders(
				config.embed_welcome.description ?? "",
				member,
				member.guild,
			),
			fields:
				config.embed_welcome.fields?.map((field: EmbedFieldConfig) => ({
					name: utils.replacePlaceholders(field.name, member, member.guild),
					value: utils.replacePlaceholders(field.value, member, member.guild),
					inline: field.inline ?? false,
				})) ?? [],
			footer: config.embed_welcome.footer
				? {
						text: utils.replacePlaceholders(
							config.embed_welcome.footer.text ?? "",
							member,
							member.guild,
						),
						iconURL: config.embed_welcome.footer.iconURL
							? utils.replacePlaceholders(
									config.embed_welcome.footer.iconURL ?? "",
									member,
									member.guild,
								)
							: undefined,
					}
				: undefined,
		};

		if (config.embed_welcome.thumbnail?.url) {
			embedConfig.thumbnail = {
				url: utils.replacePlaceholders(
					config.embed_welcome.thumbnail.url ?? "",
					member,
					member.guild,
				),
			};
		}

		if (config.embed_welcome.image?.url) {
			embedConfig.image = {
				url: utils.replacePlaceholders(
					config.embed_welcome.image.url ?? "",
					member,
					member.guild,
				),
			};
		}

		const { embed, attachment, action_row } =
			components.createUniversalEmbed(embedConfig);
		if (!welcome_channel)
			return bunnyLog.error(
				`Welcome channel with ID ${config.welcome_channel_id} not found`,
			);

		// Send the welcome message
		await welcome_channel.send({
			embeds: [embed],
			files: attachment ? [attachment] : [],
			components: action_row ? [action_row] : [],
		});
	} else {
		// Check if the welcome message is set
		if (!config.welcome_message)
			return bunnyLog.error("Welcome message is not set");

		// Send the welcome message
		const message = utils.replacePlaceholders(
			config.welcome_message,
			member,
			member.guild,
		);

		if (!welcome_channel)
			return bunnyLog.error(
				`Welcome channel with ID ${config.welcome_channel_id} not found`,
			);

		await welcome_channel.send(message);
	}
}

/**
 * Handles the guild member leave event.
 * @param {Discord.GuildMember} member - The member that left the guild.
 */
async function handleMemberLeave(
	member: Discord.GuildMember | Discord.PartialGuildMember,
) {
	// Check if member is partial and fetch full member
	const resolvedMember = member.partial
		? await member.guild.members.fetch(member.id)
		: member;

	// Add null checks for member.guild
	if (!resolvedMember.guild) return;
	// Get the config
	const config = await api.getPluginConfig(
		resolvedMember.client.user.id,
		resolvedMember.guild.id,
		"welcome",
	);

	// Check if the plugin is enabled
	if (!config.enabled) {
		// bunnyLog.error(
		// 	`Welcome plugin is disabled in ${resolvedMember.guild.id}`
		// )
		return;
	}

	// Check if the leave message is set
	if (!config.leave_message) {
		// bunnyLog.error('Leave message is not set')
		return;
	}

	// Get the leave channel
	const leave_channel = resolvedMember.guild.channels.cache.get(
		config.leave_channel_id ?? "",
	) as Discord.TextChannel | undefined;

	if (!leave_channel) {
		// bunnyLog.error(
		// 	`Leave channel with ID ${config.leave_channel_id} not found`
		// )
		return;
	}

	if (config.type === "embed") {
		// Check if the embed is set
		if (!config.embed_leave) {
			const owner = await resolvedMember.guild.fetchOwner();
			if (owner) {
				try {
					await owner.send(
						`⚠️ [${resolvedMember.guild.name}] Leave Plugin Configuration Error:\nThe embed configuration is missing from your leave plugin settings.\nPlease update your dashboard configuration to provide a valid embed for leave messages.`,
					);
				} catch (err) {
					bunnyLog.error(
						`Could not DM owner of guild ${resolvedMember.guild.name} about leave plugin misconfiguration: ${err}`,
					);
				}
			} else {
				bunnyLog.error(
					`Could not fetch owner for guild ${resolvedMember.guild.id} while reporting leave configuration error.`,
				);
			}
			return;
		}

		const embedConfig: Discord.EmbedData & {
			fields?: Array<Discord.EmbedField>;
		} = {
			...config.embed_leave,
			title: utils.replacePlaceholders(
				config.embed_leave.title ?? "",
				resolvedMember,
				resolvedMember.guild,
			),
			description: utils.replacePlaceholders(
				config.embed_leave.description ?? "",
				resolvedMember,
				resolvedMember.guild,
			),
			fields:
				config.embed_leave.fields?.map((field: EmbedFieldConfig) => ({
					name: utils.replacePlaceholders(
						field.name,
						resolvedMember,
						resolvedMember.guild,
					),
					value: utils.replacePlaceholders(
						field.value,
						resolvedMember,
						resolvedMember.guild,
					),
					inline: field.inline ?? false,
				})) ?? [],
			footer: config.embed_leave.footer
				? {
						text: utils.replacePlaceholders(
							config.embed_leave.footer.text ?? "",
							resolvedMember,
							resolvedMember.guild,
						),
						iconURL: config.embed_leave.footer.iconURL
							? utils.replacePlaceholders(
									config.embed_leave.footer.iconURL ?? "",
									resolvedMember,
									resolvedMember.guild,
								)
							: undefined,
					}
				: undefined,
		};

		// Create the embed and action rows
		const { embed, attachment, action_row } =
			components.createUniversalEmbed(embedConfig);

		// Check if the embed is valid
		if (!embed) return bunnyLog.error("Embed is not valid");

		// Send the leave message
		await leave_channel.send({
			embeds: [embed],
			files: attachment ? [attachment] : [],
			components: action_row ? [action_row] : [],
		});
	} else {
		// Send the leave message
		const leave_message = utils.replacePlaceholders(
			config.leave_message,
			resolvedMember,
			resolvedMember.guild,
		);

		// Check if the leave channel is found
		if (!leave_channel)
			return bunnyLog.error(
				`Leave channel with ID ${config.leave_channel_id} not found`,
			);

		// Send the leave message
		await leave_channel.send(leave_message);
	}
}

export { handleMemberJoin, handleMemberLeave };
