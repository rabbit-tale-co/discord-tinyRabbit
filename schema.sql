-- Discord Bot Database Schema
-- PostgreSQL/Supabase compatible schema
-- Created: December 2024

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core bot management tables
CREATE TABLE bots (
    bot_id VARCHAR(20) PRIMARY KEY,
    bot_name VARCHAR(100) NOT NULL,
    bot_token VARCHAR(100) NOT NULL UNIQUE,
    bot_owner VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Guild (server) information
CREATE TABLE guilds (
    bot_id VARCHAR(20) REFERENCES bots(bot_id) ON DELETE CASCADE,
    guild_id VARCHAR(20) NOT NULL,
    guild_name VARCHAR(100) NOT NULL,
    premium BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (bot_id, guild_id)
);

-- Plugin configurations per guild
CREATE TABLE plugins (
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    plugin_name VARCHAR(50) NOT NULL,
    config JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (bot_id, guild_id, plugin_name),
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Birthday system
CREATE TABLE user_bdays (
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    birthday_day INTEGER NOT NULL CHECK (birthday_day >= 1 AND birthday_day <= 31),
    birthday_month INTEGER NOT NULL CHECK (birthday_month >= 1 AND birthday_month <= 12),
    birthday_year INTEGER CHECK (birthday_year >= 1900 AND birthday_year <= EXTRACT(YEAR FROM NOW())),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (bot_id, guild_id, user_id),
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Level system
CREATE TABLE user_levels (
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    xp BIGINT DEFAULT 0,
    level INTEGER DEFAULT 1,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (bot_id, guild_id, user_id),
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Economy system
CREATE TABLE user_balances (
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    amount BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (bot_id, guild_id, user_id),
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Currency transaction history
CREATE TABLE currency_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'earn', 'spend', 'admin_add', 'admin_remove'
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Ticket system
CREATE TABLE tickets (
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    thread_id VARCHAR(20) PRIMARY KEY,
    creator_id VARCHAR(20) NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'claimed', 'closed'
    claimed_by VARCHAR(20),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    rating_feedback TEXT,
    messages JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Starboard system
CREATE TABLE starboards (
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    author_message_id VARCHAR(20) NOT NULL,
    starboard_message_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) NOT NULL,
    author_id VARCHAR(20) NOT NULL,
    star_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (bot_id, guild_id, author_message_id),
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Temporary voice channels
CREATE TABLE temp_voice_channels (
    bot_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    channel_id VARCHAR(20) PRIMARY KEY,
    creator_id VARCHAR(20) NOT NULL,
    channel_name VARCHAR(100),
    expire_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (bot_id, guild_id) REFERENCES guilds(bot_id, guild_id) ON DELETE CASCADE
);

-- Social media account linking
CREATE TABLE linked_accounts (
    user_id VARCHAR(20) PRIMARY KEY,
    discord_id VARCHAR(20) NOT NULL UNIQUE,
    minecraft_id VARCHAR(50),
    youtube_id VARCHAR(50),
    twitter_id VARCHAR(50),
    tiktok_id VARCHAR(50),
    twitch_id VARCHAR(50),
    instagram_id VARCHAR(50),
    verification_tokens JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bot statistics and analytics
CREATE TABLE bot_stats (
    bot_id VARCHAR(20) PRIMARY KEY REFERENCES bots(bot_id) ON DELETE CASCADE,
    total_servers INTEGER DEFAULT 0,
    total_users BIGINT DEFAULT 0,
    birthday_messages_sent BIGINT DEFAULT 0,
    starboard_posts_created BIGINT DEFAULT 0,
    tickets_opened BIGINT DEFAULT 0,
    tickets_resolved BIGINT DEFAULT 0,
    temp_channels_created BIGINT DEFAULT 0,
    total_xp_distributed BIGINT DEFAULT 0,
    currency_transactions_count BIGINT DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_plugins_guild_enabled ON plugins(bot_id, guild_id, enabled);
CREATE INDEX idx_user_bdays_birthday ON user_bdays(birthday_month, birthday_day);
CREATE INDEX idx_user_levels_xp ON user_levels(bot_id, guild_id, xp DESC);
CREATE INDEX idx_user_balances_amount ON user_balances(bot_id, guild_id, amount DESC);
CREATE INDEX idx_currency_transactions_user ON currency_transactions(bot_id, guild_id, user_id);
CREATE INDEX idx_currency_transactions_created ON currency_transactions(created_at);
CREATE INDEX idx_tickets_status ON tickets(bot_id, guild_id, status);
CREATE INDEX idx_tickets_creator ON tickets(creator_id);
CREATE INDEX idx_starboards_star_count ON starboards(bot_id, guild_id, star_count DESC);
CREATE INDEX idx_temp_voice_expire ON temp_voice_channels(expire_at);
CREATE INDEX idx_linked_accounts_discord ON linked_accounts(discord_id);

-- Create triggers for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to relevant tables
CREATE TRIGGER update_bots_updated_at BEFORE UPDATE ON bots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guilds_updated_at BEFORE UPDATE ON guilds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plugins_updated_at BEFORE UPDATE ON plugins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_bdays_updated_at BEFORE UPDATE ON user_bdays
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_levels_updated_at BEFORE UPDATE ON user_levels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_balances_updated_at BEFORE UPDATE ON user_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_starboards_updated_at BEFORE UPDATE ON starboards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_linked_accounts_updated_at BEFORE UPDATE ON linked_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample data (optional - remove in production)
-- INSERT INTO bots (bot_id, bot_name, bot_token, bot_owner) VALUES
-- ('1234567890', 'Sample Bot', 'your_bot_token_here', '9876543210');

-- Views for common queries
CREATE VIEW guild_plugin_summary AS
SELECT
    g.bot_id,
    g.guild_id,
    g.guild_name,
    COUNT(p.plugin_name) as total_plugins,
    COUNT(CASE WHEN p.enabled = true THEN 1 END) as enabled_plugins
FROM guilds g
LEFT JOIN plugins p ON g.bot_id = p.bot_id AND g.guild_id = p.guild_id
GROUP BY g.bot_id, g.guild_id, g.guild_name;

CREATE VIEW user_activity_summary AS
SELECT
    ul.bot_id,
    ul.guild_id,
    ul.user_id,
    ul.level,
    ul.xp,
    COALESCE(ub.amount, 0) as balance,
    COUNT(ct.id) as total_transactions
FROM user_levels ul
LEFT JOIN user_balances ub ON ul.bot_id = ub.bot_id AND ul.guild_id = ub.guild_id AND ul.user_id = ub.user_id
LEFT JOIN currency_transactions ct ON ul.bot_id = ct.bot_id AND ul.guild_id = ct.guild_id AND ul.user_id = ct.user_id
GROUP BY ul.bot_id, ul.guild_id, ul.user_id, ul.level, ul.xp, ub.amount;

-- Comments for documentation
COMMENT ON TABLE bots IS 'Core bot instances and their configuration';
COMMENT ON TABLE guilds IS 'Discord servers where bots are active';
COMMENT ON TABLE plugins IS 'Plugin configurations per guild';
COMMENT ON TABLE user_bdays IS 'User birthday information for celebration system';
COMMENT ON TABLE user_levels IS 'XP and leveling system data';
COMMENT ON TABLE user_balances IS 'Virtual currency balances';
COMMENT ON TABLE currency_transactions IS 'Complete audit trail for currency operations';
COMMENT ON TABLE tickets IS 'Support ticket system with full metadata';
COMMENT ON TABLE starboards IS 'Community-highlighted messages';
COMMENT ON TABLE temp_voice_channels IS 'Temporary voice channels with auto-cleanup';
COMMENT ON TABLE linked_accounts IS 'Social media account verification';
COMMENT ON TABLE bot_stats IS 'Bot usage statistics and analytics';
