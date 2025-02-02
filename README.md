# Discord Bot

A modular Discord bot with core functionality for community management and engagement.

## Active Features

### Core Functionality
- Plugin system with per-server configuration
- Database integration (Supabase PostgreSQL)
- Error handling and logging system
- Permission-based command access
- Support server integration

### Level System
- XP tracking with activity-based rewards
- Server-specific leaderboards
- Global ranking system
- Level-based role rewards (configurable)
- Admin-level management commands

### Birthday System
- Birthday date storage and validation
- Daily birthday announcements
- Multi-timezone support
- Anniversary tracking
- Configurable announcement channels

### Ticket System
- Ticket creation via reactions
- Staff assignment and claiming
- Transcript generation
- Ticket status tracking
- Configurable ticket categories

### Moderation Tools
- Bulk message deletion
- Permission checks for admin commands
- Audit logging
- Auto-response system
- Error reporting to support channel

### Utilities
- User information lookup
- Server statistics
- Role management
- Embed generation system
- Placeholder replacement engine

### Security Features
- API key encryption
- Rate limiting protection
- Input validation
- Error masking for production
- Support server integration

## Technical Stack

### Core Technologies
- Discord.js v14
- Node.js 18+
- Supabase PostgreSQL
- TypeScript

### Database Schema
```sql
user_levels (user_id, guild_id, xp, level)
user_bdays (user_id, guild_id, day, month, year)
plugins (guild_id, plugin_name, enabled, config)
tickets (channel_id, user_id, status, created_at)
```

## Setup Guide

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment (.env):**
```ini
# Required
BOT_TOKEN=your_bot_token
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
GUILD_ID=your_server_id
```

3. **Deploy commands:**
```bash
npm run deploy
```

4. **Start bot:**
```bash
npm start
```

## Plugin Configuration

Enable/disable features via database:
```sql
UPDATE plugins SET enabled = true WHERE plugin_name = 'levels';
```

## Support & Contribution

[![Support Server](https://img.shields.io/discord/1234567890?label=Support%20Server)](https://discord.gg/RfBydgJpmU)
