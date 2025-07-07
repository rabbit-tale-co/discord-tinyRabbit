import { getBotStats, updateBotStats } from '../src/db/queries.js'

console.log('Testing Drizzle ORM functionality...')

try {
	// Test reading bot stats
	console.log('Testing getBotStats...')
	const stats = await getBotStats('test-bot-id')
	console.log('✅ getBotStats works:', stats)

	// Test updating bot stats
	console.log('Testing updateBotStats...')
	const updatedStats = await updateBotStats('test-bot-id', {
		users: 100,
		servers: 5,
		total_xp: 1000,
	})
	console.log('✅ updateBotStats works:', updatedStats)

	console.log('\n🎉 Drizzle ORM is working correctly!')
	console.log('You can now use the functions from src/db/queries.js in your Discord bot.')

} catch (error) {
	console.error('❌ Drizzle test failed:', error.message)

	if (error.message.includes('relation') && error.message.includes('does not exist')) {
		console.log('\n💡 It looks like some tables are missing.')
		console.log('Try running: bun run db:push')
	}
} finally {
	process.exit(0)
}
