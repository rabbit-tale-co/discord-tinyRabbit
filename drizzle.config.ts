import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set in .env file');
}

// Add SSL mode to URL if not present
const url = new URL(process.env.DATABASE_URL);
if (!url.searchParams.has('sslmode')) {
	url.searchParams.set('sslmode', 'require');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: url.toString(),
    ssl: 'require',
  },
});
