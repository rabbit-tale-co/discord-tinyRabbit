import type * as Discord from "discord.js";
import { bunnyLog } from "bunny-log";
import {
	getUserBalance,
	updateUserBalance,
	getTopUsers,
} from "@/discord/api/economy.js";
import { getPluginConfig } from "@/discord/api/plugins.js";
import { handleResponse } from "@/utils/responses.js";
import supabase from "@/db/supabase.js";
import { randomUUIDv7 } from "bun";

export async function balance(
	interaction: Discord.ChatInputCommandInteraction,
): Promise<void> {
	try {
		if (!interaction.guildId || !interaction.client.user?.id) {
			return handleResponse(
				interaction,
				"error",
				"Guild or client ID not found",
				{
					code: "E001",
				},
			);
		}

		const economy = await getPluginConfig(
			interaction.client.user.id,
			interaction.guildId,
			"economy",
		);

		if (!economy.enabled) {
			return handleResponse(
				interaction,
				"error",
				"Economy plugin is not enabled",
				{
					code: "E002",
				},
			);
		}

		const user = interaction.options.getUser("user") || interaction.user;
		const { data: balance, error } = await getUserBalance(
			interaction.client.user.id,
			interaction.guildId,
			user.id,
		);

		if (error) {
			return handleResponse(interaction, "error", error, {
				code: "E003",
			});
		}

		// If no balance exists, create one with starting balance
		if (!balance) {
			await updateUserBalance(
				interaction.client.user.id,
				interaction.guildId,
				user.id,
				economy.starting_balance,
				"add",
			);
		}

		const currencySymbol =
			economy.currency_emoji || economy.currency_symbol || "💰";
		const currentBalance = balance?.amount || economy.starting_balance;

		return handleResponse(
			interaction,
			"success",
			`${user.username}'s Balance: ${currencySymbol} ${currentBalance}`,
		);
	} catch (error) {
		bunnyLog.error("Error in balance command:", error);
		return handleResponse(interaction, "error", "Failed to get balance", {
			code: "E004",
		});
	}
}

export async function pay(
	interaction: Discord.ChatInputCommandInteraction,
): Promise<void> {
	try {
		if (!interaction.guildId || !interaction.client.user?.id) {
			return handleResponse(
				interaction,
				"error",
				"Guild or client ID not found",
				{
					code: "E001",
				},
			);
		}

		const economy = await getPluginConfig(
			interaction.client.user.id,
			interaction.guildId,
			"economy",
		);

		if (!economy.enabled) {
			return handleResponse(
				interaction,
				"error",
				"Economy plugin is not enabled",
				{
					code: "E002",
				},
			);
		}

		const recipient = interaction.options.getUser("user");
		const amount = interaction.options.getNumber("amount");

		if (!recipient || !amount) {
			return handleResponse(
				interaction,
				"error",
				"Invalid recipient or amount",
				{
					code: "E005",
				},
			);
		}

		if (recipient.bot) {
			return handleResponse(interaction, "error", "You cannot pay bots", {
				code: "E006",
			});
		}

		if (recipient.id === interaction.user.id) {
			return handleResponse(interaction, "error", "You cannot pay yourself", {
				code: "E015",
			});
		}

		if (amount <= 0) {
			return handleResponse(
				interaction,
				"error",
				"Amount must be greater than 0",
				{
					code: "E007",
				},
			);
		}

		// Get sender's balance
		const { data: senderBalance, error: senderError } = await getUserBalance(
			interaction.client.user.id,
			interaction.guildId,
			interaction.user.id,
		);

		if (senderError) {
			return handleResponse(
				interaction,
				"error",
				"Failed to get your balance",
				{
					code: "E008",
				},
			);
		}

		// If sender doesn't exist in database, create their account with initial balance
		if (!senderBalance) {
			await updateUserBalance(
				interaction.client.user.id,
				interaction.guildId,
				interaction.user.id,
				economy.starting_balance,
				"add",
			);
		}

		// Get sender's balance again after potential creation
		const { data: updatedSenderBalance, error: updatedSenderError } =
			await getUserBalance(
				interaction.client.user.id,
				interaction.guildId,
				interaction.user.id,
			);

		if (updatedSenderError || !updatedSenderBalance) {
			return handleResponse(
				interaction,
				"error",
				"Failed to get your balance",
				{
					code: "E008",
				},
			);
		}

		if (updatedSenderBalance.amount < amount) {
			return handleResponse(interaction, "error", "Insufficient funds", {
				code: "E009",
			});
		}

		// Get recipient's balance
		const { data: recipientBalance, error: recipientError } =
			await getUserBalance(
				interaction.client.user.id,
				interaction.guildId,
				recipient.id,
			);

		if (recipientError) {
			return handleResponse(
				interaction,
				"error",
				"Failed to get recipient balance",
				{
					code: "E010",
				},
			);
		}

		// If recipient doesn't exist in database, create their account with initial balance
		if (!recipientBalance) {
			await updateUserBalance(
				interaction.client.user.id,
				interaction.guildId,
				recipient.id,
				economy.starting_balance,
				"add",
			);
		}

		try {
			// Record sender's transaction (negative amount)
			await supabase.from("currency_transactions").insert({
				id: randomUUIDv7(),
				bot_id: interaction.client.user.id,
				guild_id: interaction.guildId,
				user_id: interaction.user.id,
				amount: -amount,
				type: "REMOVE",
				reason: `Payment sent to ${recipient.username}`,
			});

			// Record recipient's transaction (positive amount)
			await supabase.from("currency_transactions").insert({
				id: randomUUIDv7(),
				bot_id: interaction.client.user.id,
				guild_id: interaction.guildId,
				user_id: recipient.id,
				amount: amount,
				type: "ADD",
				reason: `Payment received from ${interaction.user.username}`,
			});

			// Update balances
			await updateUserBalance(
				interaction.client.user.id,
				interaction.guildId,
				interaction.user.id,
				amount,
				"remove",
			);

			await updateUserBalance(
				interaction.client.user.id,
				interaction.guildId,
				recipient.id,
				amount,
				"add",
			);

			const currencySymbol =
				economy.currency_emoji || economy.currency_symbol || "💰";

			// Send public success message
			await handleResponse(
				interaction,
				"success",
				`${interaction.user} paid ${recipient} ${currencySymbol} ${amount}`,
			);

			// Get updated balances after transaction
			const [senderBalanceResult, recipientBalanceResult] = await Promise.all([
				getUserBalance(
					interaction.client.user.id,
					interaction.guildId,
					interaction.user.id,
				),
				getUserBalance(
					interaction.client.user.id,
					interaction.guildId,
					recipient.id,
				),
			]);

			// Send ephemeral message to sender
			await handleResponse(
				interaction,
				"info",
				`Your balance after sending: ${currencySymbol} ${senderBalanceResult.data?.amount || 0}`,
				{ ephemeral: true },
			);

			// Try to notify recipient
			if (interaction.guild) {
				const recipientMember = await interaction.guild.members.fetch(
					recipient.id,
				);
				if (recipientMember) {
					const followUpMessage = `You received ${currencySymbol} ${amount} from ${interaction.user}!\nYour new balance: ${currencySymbol} ${recipientBalanceResult.data?.amount || 0}`;

					try {
						// Try to send DM first
						await recipientMember.send(followUpMessage);
					} catch (error) {
						bunnyLog.error("Failed to send DM to recipient:", error);
					}
				}
			}

			return;
		} catch (error) {
			bunnyLog.error("Error in transaction:", error);
			return handleResponse(interaction, "error", "Failed to process payment", {
				code: "E011",
			});
		}
	} catch (error) {
		bunnyLog.error("Error in pay command:", error);
		return handleResponse(interaction, "error", "Failed to process payment", {
			code: "E011",
		});
	}
}

export async function leaderboard(
	interaction: Discord.ChatInputCommandInteraction,
): Promise<void> {
	try {
		if (!interaction.guildId || !interaction.client.user?.id) {
			return handleResponse(
				interaction,
				"error",
				"Guild or client ID not found",
				{
					code: "E001",
				},
			);
		}

		const economy = await getPluginConfig(
			interaction.client.user.id,
			interaction.guildId,
			"economy",
		);

		if (!economy.enabled) {
			return handleResponse(
				interaction,
				"error",
				"Economy plugin is not enabled",
				{
					code: "E002",
				},
			);
		}

		if (!economy.leaderboard.enabled) {
			return handleResponse(
				interaction,
				"error",
				"Leaderboard is not enabled",
				{
					code: "E012",
				},
			);
		}

		const { data: topUsers, error } = await getTopUsers(
			interaction.client.user.id,
			interaction.guildId,
		);

		if (error) {
			return handleResponse(interaction, "error", error, {
				code: "E013",
			});
		}

		const currencySymbol =
			economy.currency_emoji || economy.currency_symbol || "💰";

		const description =
			topUsers
				?.map((user, index) => {
					const member = interaction.guild?.members.cache.get(user.user_id);
					return `${index + 1}. ${member?.user.username || "Unknown User"}: ${currencySymbol} ${user.balance} ${economy.currency_name}`;
				})
				.join("\n") || "No users found";

		return handleResponse(interaction, "success", description);
	} catch (error) {
		bunnyLog.error("Error in leaderboard command:", error);
		return handleResponse(interaction, "error", "Failed to get leaderboard", {
			code: "E014",
		});
	}
}
