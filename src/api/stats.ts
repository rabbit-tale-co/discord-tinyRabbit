import supabase from '@/db/supabase.js'

type BotStats = {
    servers: number
    birthday_messages: number
    starboard_posts: number
    temp_channels: number
    tickets_opened: number
    total_xp: number
}

export async function fetchAllStats(botId: string): Promise<BotStats> {
    const { data, error } = await supabase
        .from('bot_stats')
        .select('*')
        .eq('bot_id', botId)
        .single()

    if (error || !data) {
        return {
            servers: 0,
            birthday_messages: 0,
            starboard_posts: 0,
            temp_channels: 0,
            tickets_opened: 0,
            total_xp: 0
        }
    }

    return data as BotStats
}

export async function incrementStat(
    botId: string,
    field: keyof BotStats,
    value: number = 1
): Promise<void> {
    const { error } = await supabase.rpc('increment_stats', {
        p_bot_id: botId,
        p_field: field,
        p_value: value
    })

    if (error) throw error
}

export async function syncServerCount(botId: string, actualCount: number): Promise<void> {
    const { data, error } = await supabase
        .from('bot_stats')
        .update({ servers: actualCount })
        .eq('bot_id', botId);

    if (error) throw error;
}

// Create this function in your SQL database
/*
create or replace function increment_stats(
    p_bot_id text,
    p_field text,
    p_value bigint
) returns void language plpgsql as $$
begin
    insert into bot_stats (bot_id, p_field)
    values (p_bot_id, p_value)
    on conflict (bot_id)
    do update set
        p_field = bot_stats.p_field + p_value,
        updated_at = now();
end;
$$;
*/
