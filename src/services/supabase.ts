import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * This key is intentionally publishable. Access to health records is enforced
 * in the database with RLS, never by hiding this value in the browser.
 */
export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.localStorage, storageKey: 'pulsewindow-clinician-session' },
    })
  : null;

export const hasClinicalDatabaseConfiguration = Boolean(supabase);
