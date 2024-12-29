# Tiny Rabbit Discord Bot

Tiny Rabbit is a versatile Discord bot designed to enhance your server with various features including XP tracking, role management, and more.

## Features

-  XP Tracking: Track and display user experience points (XP) and levels.
-  Role Management: Automatically assign roles based on user levels.
-  Leaderboards: Display global and server-specific leaderboards.
-  Customizable Configuration: Easily configure the bot for your server.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Ensure you have the following installed:

-  [Node.js](https://nodejs.org/) (version 14.x or higher)
-  [Bun](https://bun.sh/) (for running the server)
-  A Discord bot token ([how to create a Discord bot](https://discordpy.readthedocs.io/en/stable/discord.html))
-  Firebase project ([how to create a Firebase project](https://firebase.google.com/docs/web/setup))

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/your-username/tinyRabbit.git
   cd tinyRabbit
   ```

2. Install dependencies:

   ```sh
   bun install
   ```

3. Create a `.env` file in the root directory and add your configuration details:

   ```plaintext
   BOT_TOKEN = 'your_bot_token'
   BOT_CLIENT_SECRET = 'your_client_secret'
   CLIENT_TOKEN = 'your_client_token'

   FIREBASE_API_KEY=your_api_key
   FIREBASE_AUTH_DOMAIN=your_auth_domain
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_STORAGE_BUCKET=your_storage_bucket
   FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   FIREBASE_APP_ID=your_app_id
   FIREBASE_MEASUREMENT_ID=your_measurement_id

   BOT_TOKEN=your_bot_token

   PORT=3000
   ```

### Usage

1. Start the bot:

   ```sh
   bun run src/index.js
   ```

2. The bot should now be running and listening for commands in your Discord server.

### Project Structure

```plaintext
tinyRabbit/
├── assets/
├── src/
│   ├── commands/
│   │   ├── config.js
│   │   └── xp.js
│   ├── db/
│   │   └── firebase.js
│   ├── events/
│   │   ├── onMessage.js
│   │   ├── onInteraction.js
│   ├── services/
│   │   ├── canvasService.js
│   │   ├── configService.js
│   │   ├── embedService.js
│   │   ├── experienceService.js
│   │   ├── leaderboardService.js
│   │   ├── messageContextService.js
│   │   ├── presenceService.js
│   │   ├── roleService.js
│   │   └── userService.js
│   ├── utils/
│   │   ├── colorThief.js
│   │   ├── formatter.js
│   │   ├── leaderboard.js
│   │   └── xpUtils.js
│   └──  index.js
└── .env
```
