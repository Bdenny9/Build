import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { HttpError } from './http.ts';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
export const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Service-role client. Bypasses RLS, so every query must scope by user id itself. */
export const admin = (): SupabaseClient => createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const bearer = (req: Request) => (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');

/** The signed-in (usually anonymous) visitor. Functions deploy with verify_jwt off and check here instead. */
export async function requireUser(req: Request): Promise<string> {
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'Missing Authorization header');
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Invalid or expired session');
  return data.user.id;
}

/** True when the caller holds the service role: the legacy service JWT, or one of the project's sb_secret keys. */
export function isServiceCaller(req: Request): boolean {
  const presented = [bearer(req), req.headers.get('apikey') ?? ''].filter(Boolean);
  const accepted = new Set<string>([SERVICE_KEY]);
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    Object.values(keys).forEach((k) => accepted.add(k));
  } catch { /* not provided */ }
  return presented.some((p) => accepted.has(p));
}

const GLOBAL = '00000000-0000-0000-0000-000000000000';
const GLOBAL_DAILY_CAP = Number(Deno.env.get('GLOBAL_DAILY_CAP') ?? '2000');

/** Per-user and global daily caps on paid calls. Counts live in public.fn_usage (service role only). */
export async function rateLimit(db: SupabaseClient, userId: string, fn: string, perUserDaily: number) {
  for (const [who, cap] of [[userId, perUserDaily], [GLOBAL, GLOBAL_DAILY_CAP]] as const) {
    const { data, error } = await db.rpc('bump_usage', { p_user: who, p_fn: fn, p_limit: cap });
    if (error) throw new Error(`rate limit: ${error.message}`);
    if (data !== true) throw new HttpError(429, who === GLOBAL ? 'The demo hit its daily limit. Try again tomorrow.' : `Daily limit of ${cap} reached for ${fn}.`);
  }
}
