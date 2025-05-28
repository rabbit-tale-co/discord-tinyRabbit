import type {
	CurrencyBalance,
	CurrencyMultiplier,
	CurrencyTransaction,
} from '@/types/economy.js'
import { bunnyLog } from 'bunny-log'
import supabase from '@/db/supabase.js'
import type * as Discord from 'discord.js'

// Cache for user balances
const balance_cache: Record<string, CurrencyBalance> = {}

export async function getUserBalance(
	botId: Discord.ClientUser['id'],
	guildId: Discord.Guild['id'],
	userId: Discord.User['id']
): Promise<{ data: CurrencyBalance | null; error: string | null }> {
	try {
		if (!botId) throw new Error('Invalid botId')
		if (!guildId) throw new Error('Invalid guildId')
		if (!userId) throw new Error('Invalid userId')

		// Create cache key
		const key = `${guildId}_${userId}`

		// Return from cache if available
		if (balance_cache[key]) return { data: balance_cache[key], error: null }

		const { data, error } = await supabase
			.from('user_balances')
			.select('*')
			.eq('bot_id', botId)
			.eq('guild_id', guildId)
			.eq('user_id', userId)
			.single()

		if (error) {
			if (error.code === 'PGRST116') return { data: null, error: null } // No matching row found
			bunnyLog.error('Error fetching user balance:', error)
			return { data: null, error: 'Failed to get user balance' }
		}

		// Store in cache
		balance_cache[key] = data

		return { data, error: null }
	} catch (error) {
		bunnyLog.error('Error in getUserBalance:', error)
		return { data: null, error: 'Failed to get user balance' }
	}
}

export async function updateUserBalance(
	botId: Discord.ClientUser['id'],
	guildId: Discord.Guild['id'],
	userId: Discord.User['id'],
	amount: number,
	type: 'add' | 'remove' | 'transfer' = 'add'
): Promise<{ data: CurrencyBalance | null; error: string | null }> {
	try {
		if (!botId) throw new Error('Invalid botId')
		if (!guildId) throw new Error('Invalid guildId')
		if (!userId) throw new Error('Invalid userId')

		// Get current balance
		const { data: currentBalance, error: balanceError } = await getUserBalance(
			botId,
			guildId,
			userId
		)

		if (balanceError) {
			bunnyLog.error('Error getting current balance:', balanceError)
			return { data: null, error: 'Failed to get current balance' }
		}

		// Calculate new balance based on type
		let newBalance = amount
		if (currentBalance) {
			if (type === 'add') {
				newBalance = currentBalance.amount + amount
			} else if (type === 'remove') {
				newBalance = currentBalance.amount - amount
			}
		}

		// Update balance
		const { data, error } = await supabase
			.from('user_balances')
			.upsert({
				bot_id: botId,
				guild_id: guildId,
				user_id: userId,
				amount: newBalance,
			})
			.select()
			.single()

		if (error) {
			bunnyLog.error('Error updating balance:', error)
			return { data: null, error: 'Failed to update user balance' }
		}

		// Record transaction with the actual transaction amount
		await supabase.from('currency_transactions').insert({
			bot_id: botId,
			guild_id: guildId,
			user_id: userId,
			amount: type === 'remove' ? -amount : amount, // Record negative amount for removals
			type: type,
		})

		// Update cache
		const key = `${guildId}_${userId}`
		balance_cache[key] = data

		return { data, error: null }
	} catch (error) {
		bunnyLog.error('Error in updateUserBalance:', error)
		return { data: null, error: 'Failed to update user balance' }
	}
}

export async function getTransactionHistory(
	botId: Discord.ClientUser['id'],
	guildId: Discord.Guild['id'],
	userId: Discord.User['id'],
	limit = 10
): Promise<{ data: CurrencyTransaction[] | null; error: string | null }> {
	try {
		if (!botId) throw new Error('Invalid botId')
		if (!guildId) throw new Error('Invalid guildId')
		if (!userId) throw new Error('Invalid userId')

		const { data, error } = await supabase
			.from('currency_transactions')
			.select('*')
			.eq('bot_id', botId)
			.eq('guild_id', guildId)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(limit)

		if (error) {
			bunnyLog.error('Error fetching transaction history:', error)
			return { data: null, error: 'Failed to get transaction history' }
		}

		return { data, error: null }
	} catch (error) {
		bunnyLog.error('Error in getTransactionHistory:', error)
		return { data: null, error: 'Failed to get transaction history' }
	}
}

export async function getMultipliers(
	botId: Discord.ClientUser['id'],
	guildId: Discord.Guild['id']
): Promise<{ data: CurrencyMultiplier[] | null; error: string | null }> {
	try {
		if (!botId) throw new Error('Invalid botId')
		if (!guildId) throw new Error('Invalid guildId')

		const { data, error } = await supabase
			.from('currency_multipliers')
			.select('*')
			.eq('bot_id', botId)
			.eq('guild_id', guildId)

		if (error) {
			bunnyLog.error('Error fetching multipliers:', error)
			return { data: null, error: 'Failed to get multipliers' }
		}

		return { data, error: null }
	} catch (error) {
		bunnyLog.error('Error in getMultipliers:', error)
		return { data: null, error: 'Failed to get multipliers' }
	}
}

export async function getTopUsers(
	botId: Discord.ClientUser['id'],
	guildId: Discord.Guild['id'],
	limit = 10
): Promise<{
	data: Array<{ user_id: string; balance: number }> | null
	error: string | null
}> {
	try {
		if (!guildId) throw new Error('Invalid guildId')
		if (!botId) throw new Error('Invalid botId')

		const { data, error } = await supabase
			.from('user_balances')
			.select('user_id, amount')
			.eq('bot_id', botId)
			.eq('guild_id', guildId)
			.order('amount', { ascending: false })
			.limit(limit)

		if (error) {
			bunnyLog.error('Error fetching top users:', error)
			return { data: null, error: 'Failed to get top users' }
		}

		// Map amount to balance to match the expected type
		const mappedData =
			data?.map((item) => ({
				user_id: item.user_id,
				balance: item.amount,
			})) || null

		return { data: mappedData, error: null }
	} catch (error) {
		bunnyLog.error('Error in getTopUsers:', error)
		return { data: null, error: 'Failed to get top users' }
	}
}
