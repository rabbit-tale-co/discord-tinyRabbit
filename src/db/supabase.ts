import { createClient } from "@supabase/supabase-js";

// Get the supabase credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Check if the supabase credentials are provided
if (!supabaseUrl) throw new Error("Missing Supabase URL");
if (!supabaseKey) throw new Error("Missing Supabase Key");

// Create the supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
