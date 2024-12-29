# Discord Bot

A feature-rich Discord bot built with Discord.js, offering extensive functionality including XP system, birthday notifications, ticket management, temporary voice channels, and more.

## Core Features

### Level & XP System
- Track user activity and engagement with XP rewards
- Global and server-specific leaderboards
- Customizable XP rates and level-up notifications
- Level-based role rewards
- Commands: `/level`, `/rank`, `/leaderboard`, `/set_level`

### Birthday System
- Set and manage birthdays with `/bday`
- Automatic birthday announcements in configured channels
- Birthday role assignments
- Birthday calendar and upcoming notifications

### Ticket System
- Create and manage support tickets
- Customizable ticket categories
- Ticket transcripts and logging
- Staff management features (claim, transfer, close)
- Configurable auto-close and archive settings

### Temporary Voice Channels
- Create temporary voice channels with custom durations
- Auto-deletion when empty or expired
- User limit and permission management
- Duration presets and extensions

### Starboard
- Highlight popular messages automatically
- Customizable star threshold
- Support for multiple reaction types
- Cross-channel star tracking

### Social Media Integration
- Link Discord accounts with:
  - Minecraft
  - YouTube
  - Twitter
  - TikTok
  - Twitch
- Automatic role assignment for verified accounts
- Social media feed notifications

### Welcome System
- Customizable welcome/goodbye messages
- Support for text and embed formats
- Auto-role assignment
- Member counting and statistics

## Technical Features

### Database Integration
- Supabase backend for reliable data storage
- Efficient caching system
- Data persistence across restarts

### Performance
- Optimized for large servers
- Rate limiting protection
- Load balancing capabilities

### Security
- Permission-based command access
- API key encryption
- Rate limit protection
- Audit logging

## Database Schema

### Core Tables
- `user_levels` - XP and level tracking
- `user_bdays` - Birthday information
- `user_socials` - Linked social accounts
- `plugins` - Plugin configurations
- `tickets` - Ticket management
- `starboards` - Starboard entries
- `temp_voice_channels` - Temporary voice channels

## Setup & Configuration

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file with your Discord bot token and other required variables.

3. Run the bot:

```bash
npm start
```

4. Configure the bot's settings and permissions as needed.

Each feature can be enabled or disabled in the `plugins` table.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open-sourced under the MIT License - see the LICENSE file for details.

## Support

For support, join the [Tiny Rabbit Discord](https://discord.gg/RfBydgJpmU) and ask for help in the #support-ticket channel.
