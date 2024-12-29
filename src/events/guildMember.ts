import type { GuildMember, TextChannel } from "discord.js";
import { getPluginConfig } from "../api/plugins";
import { createUniversalEmbed } from "../components/embed";
import { replacePlaceholders } from "../utils/replacePlaceholders";

/**
 * Handles the guild member join event.
 * @param {GuildMember} member - The member that joined the guild.
 */
async function handleMemberJoin(member: GuildMember) {
	const config = await getPluginConfig(
		member.client.user.id,
		member.guild.id,
		"welcome",
	);

	if (!config.enabled)
		return console.error(`Welcome plugin is disabled in ${member.guild.id}`);

	const welcome_channel = member.guild.channels.cache.get(
		config.welcome_channel_id,
	) as TextChannel | undefined;

	// Assign join role if specified
	if (config.join_role_id) {
		const role = member.guild.roles.cache.get(config.join_role_id);
		if (role) {
			await member.roles.add(role).catch(console.error);
		} else {
			console.error(`Role with ID ${config.join_role_id} not found`);
		}
	}

	// Send welcome message
	if (config.type === "embed") {
		const embedConfig: any = {
			...config.embed_welcome,
			title: replacePlaceholders(
				config.embed_welcome.title,
				member,
				member.guild,
			),
			description: replacePlaceholders(
				config.embed_welcome.description,
				member,
				member.guild,
			),
			fields: config.embed_welcome.fields.map((field: any) => ({
				name: replacePlaceholders(field.name, member, member.guild),
				value: replacePlaceholders(field.value, member, member.guild),
				inline: field.inline,
			})),
			footer: config.embed_welcome.footer
				? {
						text: replacePlaceholders(
							config.embed_welcome.footer.text,
							member,
							member.guild,
						),
						iconURL: config.embed_welcome.footer.iconURL
							? replacePlaceholders(
									config.embed_welcome.footer.iconURL,
									member,
									member.guild,
								)
							: undefined,
					}
				: undefined,
		};

		if (config.embed_welcome.thumbnail?.url) {
			embedConfig.thumbnail = {
				url: replacePlaceholders(
					config.embed_welcome.thumbnail.url,
					member,
					member.guild,
				),
			};
		}

		if (config.embed_welcome.image?.url) {
			embedConfig.image = {
				url: replacePlaceholders(
					config.embed_welcome.image.url,
					member,
					member.guild,
				),
			};
		}

		const { embed, attachment, action_row } = createUniversalEmbed(embedConfig);
		if (!welcome_channel)
			return console.error(
				`Welcome channel with ID ${config.welcome_channel_id} not found`,
			);
		await welcome_channel.send({
			embeds: [embed],
			files: attachment ? [attachment] : [],
			components: action_row ? [action_row] : [],
		});
	} else {
		const message = replacePlaceholders(
			config.welcome_message,
			member,
			member.guild,
		);

		if (!welcome_channel)
			return console.error(
				`Welcome channel with ID ${config.welcome_channel_id} not found`,
			);

		await welcome_channel.send(message);
	}
}

/**
 * Handles the guild member leave event.
 * @param {GuildMember} member - The member that left the guild.
 */
async function handleMemberLeave(member: GuildMember) {
	const config = await getPluginConfig(
		member.client.user.id,
		member.guild.id,
		"welcome",
	);

	if (!config.enabled)
		return console.error(`Welcome plugin is disabled in ${member.guild.id}`);

	const leave_message = replacePlaceholders(
		config.leave_message,
		member,
		member.guild,
	);

	const leave_channel = member.guild.channels.cache.get(
		config.leave_channel_id,
	) as TextChannel | undefined;

	if (!leave_channel)
		return console.error(
			`Leave channel with ID ${config.leave_channel_id} not found`,
		);

	if (config.type === "embed") {
		const embedConfig: any = {
			...config.embed_leave,
			title: replacePlaceholders(
				config.embed_leave.title,
				member,
				member.guild,
			),
			description: replacePlaceholders(
				config.embed_leave.description,
				member,
				member.guild,
			),
			footer: config.embed_leave.footer
				? {
						text: replacePlaceholders(
							config.embed_leave.footer.text,
							member,
							member.guild,
						),
						iconURL: config.embed_leave.footer.iconURL
							? replacePlaceholders(
									config.embed_leave.footer.iconURL,
									member,
									member.guild,
								)
							: undefined,
					}
				: undefined,
		};

		const { embed, attachment, action_row } = createUniversalEmbed(embedConfig);
		await leave_channel.send({
			embeds: [embed],
			files: attachment ? [attachment] : [],
			components: action_row ? [action_row] : [],
		});
	} else {
		const leave_message = replacePlaceholders(
			config.leave_message,
			member,
			member.guild,
		);

		await leave_channel.send(leave_message);
	}
}

export { handleMemberJoin, handleMemberLeave, replacePlaceholders };
