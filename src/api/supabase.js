import { createClient } from '@supabase/supabase-js';

// Hardcoded URL + publishable key are safe to ship to the browser
// when RLS is enabled on every table — and it is, per
// supabase/migrations/0001_initial.sql. The secret key never goes
// in the frontend.
const SUPABASE_URL = 'https://ztbadmaufcpkinnjztxy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JrJwv7ZXLv0PlJcWFtriBQ_JGQwynbE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,  // handles ?code=... after magic link
  },
});
