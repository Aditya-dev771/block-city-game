import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const supabaseConfigurationError = !url || !key
  ? 'Private Alpha configuration is unavailable. The required public connection settings were not included in this build.'
  : null;
export const isSupabaseConfigured = supabaseConfigurationError === null;

// A syntactically valid inert fallback lets React render the configuration
// screen. App prevents all Supabase activity while configuration is missing.
export const supabase = createClient(url ?? 'https://placeholder.supabase.co', key ?? 'placeholder-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
