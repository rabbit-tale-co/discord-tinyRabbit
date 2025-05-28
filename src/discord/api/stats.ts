import supabase from "@/db/supabase.js";

type BotStats = {
	servers: number;
	birthday_messages: number;
	starboard_posts: number;
	temp_channels: number;
	tickets_opened: number;
	total_xp: number;
};

export async function fetchAllStats(botId: string): Promise<BotStats> {
	try {
		const { data, error } = await supabase
			.from("bot_stats")
			.select("*")
			.eq("bot_id", botId)
			.single();

		if (error || !data) {
			// Fallback to direct counting if stats missing
			const [servers, birthdays, starboards, tempChannels, tickets, xp] =
				await Promise.all([
					supabase
						.from("guilds")
						.select("*", { count: "exact" })
						.eq("bot_id", botId),
					supabase
						.from("user_bdays")
						.select("*", { count: "exact" })
						.eq("bot_id", botId),
					supabase
						.from("starboards")
						.select("*", { count: "exact" })
						.eq("bot_id", botId),
					supabase
						.from("temp_voice_channels")
						.select("*", { count: "exact" })
						.eq("bot_id", botId),
					supabase
						.from("tickets")
						.select("*", { count: "exact" })
						.eq("bot_id", botId),
					supabase.from("leaderboard").select("xp").eq("bot_id", botId),
				]);

			return {
				servers: servers.count || 0,
				birthday_messages: birthdays.count || 0,
				starboard_posts: starboards.count || 0,
				temp_channels: tempChannels.count || 0,
				tickets_opened: tickets.count || 0,
				total_xp: xp.data?.reduce((sum, { xp }) => sum + xp, 0) || 0,
			};
		}

		return data as BotStats;
	} catch (error: unknown) {
		throw new Error("Error in fetchAllStats");
	}
}
