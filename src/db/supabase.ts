import { createClient } from '@supabase/supabase-js'
import { env } from 'node:process'

// Get the supabase credentials
const supabaseUrl = env.SUPABASE_URL
const supabaseKey = env.SUPABASE_KEY

// Check if the supabase credentials are provided
if (!supabaseUrl || !supabaseKey) {
	throw new Error('Missing Supabase credentials')
}

// Create the supabase client
const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase
