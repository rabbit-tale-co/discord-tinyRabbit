import postgres from 'postgres'
import 'dotenv/config'

console.log('Testing database connection...')

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is not set in .env file')
	process.exit(1)
}

const url = new URL(process.env.DATABASE_URL)
console.log('Original URL:', url.toString().replace(/:[^:@]*@/, ':***@'))

// Create direct connection URL (port 5432 instead of 6543)
const directUrl = new URL(process.env.DATABASE_URL)
directUrl.hostname = directUrl.hostname.replace(
	'pooler.supabase.com',
	'supabase.co'
)
directUrl.port = '5432'

console.log('Direct URL:', directUrl.toString().replace(/:[^:@]*@/, ':***@'))

// Test different configurations
const configurations = [
	{
		name: 'Direct connection with SSL require',
		config: () => {
			const testUrl = new URL(directUrl.toString())
			testUrl.searchParams.set('sslmode', 'require')
			return postgres(testUrl.toString(), { max: 1, ssl: 'require' })
		},
	},
	{
		name: 'Direct connection with SSL prefer',
		config: () => {
			const testUrl = new URL(directUrl.toString())
			testUrl.searchParams.set('sslmode', 'prefer')
			return postgres(testUrl.toString(), { max: 1, ssl: 'prefer' })
		},
	},
	{
		name: 'Direct connection without SSL',
		config: () => {
			const testUrl = new URL(directUrl.toString())
			testUrl.searchParams.delete('sslmode')
			return postgres(testUrl.toString(), { max: 1, ssl: false })
		},
	},
	{
		name: 'Pooler with pgbouncer mode',
		config: () => {
			const testUrl = new URL(process.env.DATABASE_URL)
			testUrl.searchParams.set('sslmode', 'require')
			testUrl.searchParams.set('pgbouncer', 'true')
			return postgres(testUrl.toString(), {
				max: 1,
				ssl: 'require',
				prepare: false,
				types: {
					bigint: postgres.BigInt,
				},
			})
		},
	},
]

for (const config of configurations) {
	try {
		console.log(`\nTesting: ${config.name}`)
		const client = config.config()

		const result = await client`SELECT 1 as test`
		console.log('✅ Connection successful:', result[0])

		await client.end()
		console.log('✅ Connection closed successfully')

		// If successful, show the working configuration
		console.log('\n🎉 WORKING CONFIGURATION FOUND!')
		console.log('Use this configuration in your migration script.')
		break
	} catch (error) {
		console.log('❌ Connection failed:', error.message)
		if (error.code) {
			console.log('Error code:', error.code)
		}
	}
}

console.log('\nTest completed.')
