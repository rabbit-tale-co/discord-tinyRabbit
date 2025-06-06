# Discord Bot

<div align="center">

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue?logo=discord&logoColor=white)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black?logo=bun&logoColor=white)](https://bun.sh/)

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Supabase](https://img.shields.io/badge/Database-Supabase-green?logo=supabase&logoColor=white)](https://supabase.com/)
[![Components V2](https://img.shields.io/badge/Discord-Components%20V2-blueviolet?logo=discord&logoColor=white)]()
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)]()

[![Support Server](https://img.shields.io/discord/1234567890?color=7289da&label=Support%20Server&logo=discord&logoColor=white)](https://discord.gg/RfBydgJpmU)
[![GitHub Stars](https://img.shields.io/github/stars/username/repo?style=social)](https://github.com/username/repo)
[![GitHub Forks](https://img.shields.io/github/forks/username/repo?style=social)](https://github.com/username/repo)

</div>

---

**A comprehensive modular Discord bot with extensive community management features, built with TypeScript and Discord.js v14.**

### ✨ Key Highlights
- 🔧 **11+ Plugin Modules** - Birthday, Tickets, Levels, Economy, Starboard & More
- 🌐 **Multi-Bot Architecture** - Single instance, multiple bot tokens
- 📊 **Advanced Analytics** - Real-time statistics and usage tracking
- 🎨 **Discord Components V2** - Modern UI with rich interactions
- 🔒 **Enterprise Security** - Input validation, rate limiting, audit trails
- 🗄️ **Robust Database** - Supabase PostgreSQL with comprehensive schema

## 🎯 Active Features

### 🔧 Core System
- **Plugin Architecture**: Modular plugin system with per-server configuration
- **Multi-Bot Support**: Single instance can handle multiple bot tokens
- **Database Integration**: Supabase PostgreSQL with comprehensive schema
- **Advanced Logging**: Structured logging with BunnyLogger system
- **Permission Management**: Role-based access control for all features
- **Statistics Tracking**: Real-time bot usage statistics and analytics

### 🎉 Birthday System
- **Smart Birthday Storage**: Day, month, year with validation
- **Automatic Announcements**: Daily birthday celebrations at 11:00 AM UTC
- **Rich Placeholder System**: 15+ variables for message customization
  - `{user}`, `{display_name}`, `{age}`, `{birthday_date}`, `{next_birthday}`
- **Discord Timestamp Integration**: Native Discord formatting for dates
- **Privacy Protection**: Age display optional to protect minors
- **Channel Configuration**: Dedicated announcement channels per server

### 🎫 Advanced Ticket System
- **Multi-Category Support**: Customizable ticket categories and workflows
- **Staff Management**: Ticket claiming, assignment, and collaboration
- **Rich Components**: Discord Components V2 integration
- **Transcript Generation**: Complete conversation history with metadata
- **Auto-Close System**: Configurable inactivity timeouts
- **Rating System**: 5-star feedback collection with analytics
- **Permission Controls**: Role-based access and time limits

### 📊 Comprehensive Level System
- **XP Tracking**: Activity-based experience point system
- **Role Rewards**: Automatic role assignment based on levels
- **Boost Multipliers**: Configurable XP multipliers for special roles
- **Global Leaderboard**: Cross-server ranking system
- **Server Leaderboards**: Per-guild activity tracking
- **Reward Channels**: Dedicated channels for level announcements

### ⭐ Starboard System
- **Message Highlighting**: Community-driven content curation
- **Configurable Thresholds**: Custom star requirements per server
- **Channel Watching**: Monitor specific channels or entire server
- **Emoji Customization**: Use any emoji for starring
- **Duplicate Prevention**: Smart message tracking and validation

### 💰 Economy System
- **Virtual Currency**: Server-specific currency with custom names/symbols
- **Transaction Tracking**: Complete audit trail for all currency movements
- **Role Multipliers**: Configurable earning bonuses for special roles
- **Leaderboards**: Wealth rankings with automatic updates
- **Starting Balance**: Configurable initial currency for new members
- **Admin Commands**: Add/remove currency with reason tracking

### 👋 Welcome & Goodbye System
- **Rich Welcome Messages**: Customizable greetings for new members
- **Goodbye Notifications**: Departure announcements with member info
- **Auto-Assign Roles**: Automatic role assignment for new joiners
- **Channel Configuration**: Separate channels for welcome/goodbye messages
- **Variable System**: 8+ placeholders for personalized messages

### 🔗 Social Media Integration
- **Account Linking**: Connect Discord to Minecraft, YouTube, Twitter, TikTok, Twitch
- **Verification System**: Secure account verification with tokens
- **Role Rewards**: Automatic role assignment for linked accounts
- **Multi-Platform**: Support for 6+ different platforms
- **Verification Tracking**: Complete audit trail for account links

### 🎤 Temporary Voice Channels
- **Dynamic Creation**: Auto-generated voice channels for users
- **Customizable Titles**: Personalized channel naming with placeholders
- **Duration Control**: Configurable expiration times
- **Creator Permissions**: Channel owner controls and management
- **Auto-Cleanup**: Automatic channel deletion when empty

### 🛡️ Moderation & Security
- **Slowmode Protection**: Automatic channel slowmode on message spam
- **Ban Management**: Scheduled ban processing with configurable intervals
- **Message Cleanup**: Automatic deletion of messages from banned users
- **Role Monitoring**: Track moderation-related role changes
- **Audit Logging**: Comprehensive moderation action tracking

### 🎵 Music Integration
- **Voice Channel Support**: Dedicated music bot functionality
- **Role-Based Access**: Configurable permissions for music commands
- **Channel Restrictions**: Limit music usage to specific channels

## 🏗️ Technical Architecture

### Core Technologies
- **Runtime**: Node.js 18+ with Bun for development
- **Language**: TypeScript with strict type checking
- **Discord**: Discord.js v14 with Components V2
- **Database**: Supabase PostgreSQL with real-time subscriptions
- **Validation**: Comprehensive input validation and sanitization
- **Logging**: Advanced logging system with multiple output targets

### Database Schema Overview
```sql
-- Core Tables
bots (bot_id, bot_name, bot_token, bot_owner)
guilds (bot_id, guild_id, guild_name, premium)
plugins (bot_id, guild_id, plugin_name, config)

-- Feature Tables
user_bdays (bot_id, guild_id, user_id, birthday)
user_levels (bot_id, guild_id, user_id, xp, level)
user_balances (bot_id, guild_id, user_id, amount)
tickets (bot_id, guild_id, thread_id, messages, metadata)
starboards (bot_id, guild_id, author_message_id, starboard_message_id, star_count)
temp_voice_channels (bot_id, guild_id, channel_id, creator_id, expire_at)

-- Advanced Features
linked_accounts (user_id, discord_id, minecraft_id, youtube_id, ...)
currency_transactions (id, bot_id, guild_id, user_id, amount, type, reason)
bot_stats (bot_id, servers, birthday_messages, starboard_posts, ...)
```

## 🚀 Setup Guide

### 1. Prerequisites
```bash
# Install Bun (recommended) or Node.js 18+
curl -fsSL https://bun.sh/install | bash

# Clone repository
git clone <repository-url>
cd discord
```

### 2. Environment Configuration
```env
# Discord Configuration
BOT_TOKEN=your_discord_bot_token
GUILD_ID=your_development_server_id

# Database Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key

# Optional: Multiple Bot Support
ADDITIONAL_BOT_TOKENS=token1,token2,token3
```

### 3. Database Setup
```sql
-- Run the provided schema.sql to create all tables
-- Or use Supabase migrations for automated setup
```

### 4. Installation & Deployment
```bash
# Install dependencies
bun install

# Deploy Discord slash commands
bun run deploy

# Start development server
bun run dev

# Start production server
bun start
```

## 🔧 Plugin Configuration

All features are configurable per-server through the database:

```typescript
// Example plugin configuration
{
  "enabled": true,
  "channel_id": "123456789",
  "threshold": 15,
  "components": {
    "welcome_message": {
      "components": [...]
    }
  }
}
```

### Available Plugins
- `birthday` - Birthday announcement system
- `tickets` - Support ticket management
- `levels` - XP and leveling system
- `starboard` - Message highlighting
- `welcome_goodbye` - Member greetings
- `economy` - Virtual currency system
- `tempvc` - Temporary voice channels
- `slowmode` - Anti-spam protection
- `connectSocial` - Social media linking
- `moderation` - Moderation tools
- `music` - Music bot functionality

## 📈 Statistics & Analytics

Track comprehensive bot usage:
- Server count and activity
- Birthday messages sent
- Starboard posts created
- Temporary channels generated
- Tickets opened and resolved
- Total XP distributed across all servers

## 🔒 Security Features

- **Input Validation**: Comprehensive sanitization of all user inputs
- **Rate Limiting**: Protection against spam and abuse
- **Permission Checks**: Multi-level authorization system
- **Error Handling**: Graceful error recovery with user-friendly messages
- **Data Encryption**: Secure storage of sensitive information
- **Audit Trails**: Complete logging of all administrative actions

## 🤝 Support & Development

<div align="center">

### 🔗 Links & Community

[![Documentation](https://img.shields.io/badge/📚-Documentation-blue?style=for-the-badge)](https://github.com/username/repo/wiki)
[![Issues](https://img.shields.io/badge/🐛-Report%20Bug-red?style=for-the-badge)](https://github.com/username/repo/issues)
[![Feature Request](https://img.shields.io/badge/💡-Request%20Feature-green?style=for-the-badge)](https://github.com/username/repo/issues)

</div>

### 🛠️ Contributing

We welcome contributions! Here's how to get started:

1. **Fork the repository** and create your feature branch
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make your changes** with proper testing
   ```bash
   bun test
   bun run lint
   ```

3. **Commit your changes** with descriptive messages
   ```bash
   git commit -m "Add amazing feature"
   ```

4. **Push to your branch** and create a Pull Request
   ```bash
   git push origin feature/amazing-feature
   ```

### 📝 Development Setup

```bash
# Clone and setup
git clone <repository-url>
cd discord
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Build for production
bun run build
```

### 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

### ⭐ Show Your Support

If this project helped you, please consider giving it a ⭐ on GitHub!

---

<div align="center">

**Made with ❤️ by the community**

*Last updated: December 2024*

</div>
