import { createClient } from '@supabase/supabase-js'

// Both values are public by design: the anon/publishable key only grants what
// the row-level security rules in supabase/guestbook.sql allow. Never put the
// service_role / secret key in a VITE_ variable.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && key ? createClient(url, key) : null
