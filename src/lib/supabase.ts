import { createClient } from '@supabase/supabase-js';

const env = (import.meta as any).env || {};
const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://reukbqqedkxmmotlmmks.supabase.co';
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_E4k6RLcAVD6dyNBLVqB19Q_UkNlLNRA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
