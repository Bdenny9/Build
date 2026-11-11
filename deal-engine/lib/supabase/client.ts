import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Browser client. Uses only the public anon key; row access is enforced by RLS. */
export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or use NEXT_PUBLIC_DATA_MODE=mock.');
  client = createBrowserClient(url, key);
  return client;
}

/**
 * Each visitor gets an anonymous Supabase user so their activities, listings and deals
 * are private to them under RLS. Enable "Anonymous sign-ins" in Supabase Auth settings.
 */
export async function ensureSession() {
  const sb = supabase();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const { data: signed, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  return signed.session;
}
