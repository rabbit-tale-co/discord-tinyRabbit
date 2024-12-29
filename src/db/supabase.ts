import { createClient } from '@supabase/supabase-js'
import { env } from 'node:process'

const supabaseUrl = env.SUPABASE_URL
const supabaseKey = env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
	throw new Error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase
