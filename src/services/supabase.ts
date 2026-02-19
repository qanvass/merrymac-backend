import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
    console.warn("⚠️ Supabase credentials missing. Persistent memory disabled.");
}

export const supabase = (env.SUPABASE_URL && env.SUPABASE_KEY)
    ? createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
    : null;
