import { env } from 'node:process'

const config = {
	clientId: env.CLIENT_ID, // Client id
	guildId: env.GUILD_ID,
	openaiApiKey: env.OPENAI_API_KEY, // Your OpenAI API key
	openaiSecret: env.OPENAI_SECRET,
}

export default config
