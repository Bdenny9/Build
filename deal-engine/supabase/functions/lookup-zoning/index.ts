// supabase/functions/lookup-zoning/index.ts
//
// Zoning for Deal Engine leads, from Zoneomics zoneDetail, cached by PID in public.zoning_cache.
//
// Fixes vs the Augur version (confirmed against the Zoneomics sandbox response):
//   - output_fields: "zoning,plu,plu-tags,controls,gde-controls,parcels" (no "geom", which is not a documented value)
//   - looks up by the parcel's lat/lng, not a free-text address
//   - permitted-use flags read from data.permitted_land_uses.* (commercial, industrial, multi-family included)
//   - FAR read from data.controls.far_standard, height from data.controls.building_height_standard
//   - "as of right" uses stored as permitted_uses; conditional uses kept in raw only
//   - NO jurisdiction fallback. If Zoneomics has nothing, we store precision 'none'; we never guess.
//
// Credit protection:
//   - Cache by PID, never refreshed (one-and-done snapshot). Cached PIDs cost nothing.
//   - Max 10 PIDs per request.
//   - Daily cap on paid calls (ZONEOMICS_DAILY_CAP, default 25).
//   - ZONEOMICS_BASE_URL can point at the free sandbox while testing.
//
// Auth:
//   - Signed-in users (including anonymous visitors) may read; they can only trigger lookups for PIDs
//     already served to them in public.served_leads.
//   - serve-leads calls it with the service role key and may look up any PID.
//   - Deploy with --no-verify-jwt; this function verifies the caller itself.
//
// Secrets: ZONING_API_KEY (required), ZONEOMICS_BASE_URL (optional), ZONEOMICS_DAILY_CAP (optional).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

const ZONING_API_KEY = Deno.env.get("ZONING_API_KEY") ?? "";
const BASE_URL = (Deno.env.get("ZONEOMICS_BASE_URL") ?? "https://api.zoneomics.com").replace(/\/$/, "");
const DAILY_CAP = Number(Deno.env.get("ZONEOMICS_DAILY_CAP") ?? "25");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTPUT_FIELDS = "zoning,plu,plu-tags,controls,gde-controls,parcels";
const MAX_PIDS = 10;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Types ----------
interface ZoningRow {
  pid: string;
  zone_code: string | null;
  zone_name: string | null;
  permitted_uses: string[];
  commercial_permitted: boolean | null;
  industrial_permitted: boolean | null;
  multi_family_permitted: boolean | null;
  max_height_ft: number | null;
  max_far: number | null;
  precision: "parcel" | "none";
  source: "zonomics_api" | "none";
  raw: unknown;
}
interface Result { pid: string; cached: boolean; zoning: ZoningRow | null; error?: string }

// ---------- Parsing helpers ----------
function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "yes") return true;
    if (s === "false" || s === "no") return false;
  }
  return null; // null, undefined, "NULL", "STF", "NA" all mean unknown
}

function firstNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = v.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

/**
 * Pull a number out of a Zoneomics *_standard block: { standard: {...}, "non-standard": {...} }.
 * The inner key names were collapsed in the sandbox view, so we match by pattern and prefer "standard".
 * The keys we matched are returned so the first real call can be checked and the patterns tightened.
 */
function fromStandard(block: unknown, keyPattern: RegExp): { value: number | null; key: string | null } {
  if (!block || typeof block !== "object") return { value: null, key: null };
  const b = block as Record<string, unknown>;
  for (const part of [b["standard"], b["non-standard"], b]) {
    if (!part || typeof part !== "object") continue;
    for (const [k, v] of Object.entries(part as Record<string, unknown>)) {
      if (!keyPattern.test(k)) continue;
      const n = firstNumber(v);
      if (n !== null) return { value: n, key: k };
    }
  }
  return { value: null, key: null };
}

function parseZoneDetail(pid: string, body: any): { row: ZoningRow; matchedKeys: Record<string, string | null> } {
  const d = body?.data ?? {};
  const zd = d.zone_details ?? {};
  const plu = d.permitted_land_uses ?? {};
  const controls = d.controls ?? {};

  const far = fromStandard(controls.far_standard, /far|floor.?area/i);
  const height = fromStandard(controls.building_height_standard, /height.*(ft|feet)|max.*height/i);

  const asOfRight: string[] = Array.isArray(plu.as_of_right) ? plu.as_of_right.filter((x: unknown) => typeof x === "string") : [];
  const zoneCode: string | null = typeof zd.zone_code === "string" && zd.zone_code.trim() ? zd.zone_code.trim() : null;

  return {
    row: {
      pid,
      zone_code: zoneCode,
      zone_name: typeof zd.zone_name === "string" ? zd.zone_name : null,
      permitted_uses: asOfRight,
      commercial_permitted: toBool(plu.commercial_uses_permitted),
      industrial_permitted: toBool(plu.industrial_uses_permitted),
      multi_family_permitted: toBool(plu.multi_family_permitted),
      max_height_ft: height.value,
      max_far: far.value,
      precision: zoneCode ? "parcel" : "none",
      source: zoneCode ? "zonomics_api" : "none",
      raw: body,
    },
    matchedKeys: { far: far.key, height: height.key },
  };
}

// ---------- Zoneomics call ----------
const redact = (s: string) =>
  s.replace(/api_key=[^&\s)"']+/gi, "api_key=REDACTED").split(ZONING_API_KEY || "\u0000").join("REDACTED");

async function callZoneomics(lat: number, lng: number) {
  const url = `${BASE_URL}/v2/zoneDetail?` + new URLSearchParams({
    api_key: ZONING_API_KEY, lat: String(lat), lng: String(lng), output_fields: OUTPUT_FIELDS,
  });
  // The key travels in the query string, and runtime fetch errors include the full URL. Every error message
  // that leaves this function is redacted, because results (including errors) are returned to callers.
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new Error(`Zoneomics request failed: ${redact((e as Error).message)}`);
  }
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok || body?.success === false) {
    const msg = body?.message ? JSON.stringify(body.message) : text.slice(0, 200);
    throw new Error(redact(`Zoneomics ${res.status}: ${msg}`));
  }
  return body;
}

async function paidCallsToday(admin: SupabaseClient): Promise<number> {
  const start = new Date(); start.setUTCHours(0, 0, 0, 0);
  const { count } = await admin.from("zoning_cache").select("pid", { count: "exact", head: true })
    .gte("fetched_at", start.toISOString()).neq("source", "zonomics_cache");
  return count ?? 0;
}

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  if (!ZONING_API_KEY) return json({ error: "ZONING_API_KEY secret is not set" }, 500);

  // Who is calling?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Missing Authorization header" }, 401);
  const isService = token === SERVICE_KEY;
  let userId: string | null = null;
  if (!isService) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json({ error: "Invalid or expired session" }, 401);
    userId = data.user.id;
  }

  let input: { pid?: string; pids?: string[]; test?: { lat: number; lng: number } };
  try { input = await req.json(); } catch { return json({ error: "Body must be JSON" }, 400); }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Test mode (service role only): parse any point without touching the cache.
  // Point ZONEOMICS_BASE_URL at the sandbox and use its Redondo Beach example to check the parser for free.
  if (input.test) {
    if (!isService) return json({ error: "Test mode requires the service role key" }, 403);
    try {
      const body = await callZoneomics(input.test.lat, input.test.lng);
      const { row, matchedKeys } = parseZoneDetail("TEST", body);
      const { raw: _raw, ...parsed } = row;
      return json({ base_url: BASE_URL, parsed, matched_keys: matchedKeys, controls: body?.data?.controls ?? null });
    } catch (e) {
      return json({ error: (e as Error).message }, 502);
    }
  }

  const pids = [...new Set((input.pids ?? (input.pid ? [input.pid] : [])).filter((p) => typeof p === "string" && p.trim()))];
  if (!pids.length) return json({ error: "Provide pid or pids" }, 400);
  if (pids.length > MAX_PIDS) return json({ error: `At most ${MAX_PIDS} PIDs per request` }, 400);

  // Visitors may only trigger lookups for leads already served to them.
  if (!isService) {
    const { data: served } = await admin.from("served_leads").select("pid").eq("user_id", userId!).in("pid", pids);
    const allowed = new Set((served ?? []).map((r) => r.pid));
    const blocked = pids.filter((p) => !allowed.has(p));
    if (blocked.length) return json({ error: `Not served to this user: ${blocked.join(", ")}` }, 403);
  }

  // 1. Cache first. Cached PIDs never cost a credit.
  const { data: cachedRows, error: cacheErr } = await admin.from("zoning_cache").select("*").in("pid", pids);
  if (cacheErr) return json({ error: cacheErr.message }, 500);
  const cached = new Map((cachedRows ?? []).map((r) => [r.pid, r]));
  const results: Result[] = [];
  for (const pid of pids) {
    const r = cached.get(pid);
    if (r) results.push({ pid, cached: true, zoning: { ...r, raw: undefined } as ZoningRow });
  }
  const missing = pids.filter((p) => !cached.has(p));
  if (!missing.length) return json({ results });

  // 2. Coordinates come from our own parcel snapshot.
  const { data: parcels, error: pErr } = await admin.from("parcels").select("pid, lat, lng").in("pid", missing);
  if (pErr) return json({ error: pErr.message }, 500);
  const coords = new Map((parcels ?? []).map((p) => [p.pid, p]));

  // 3. Daily credit cap.
  let budget = Math.max(0, DAILY_CAP - (await paidCallsToday(admin)));

  for (const pid of missing) {
    const p = coords.get(pid);
    if (!p) { results.push({ pid, cached: false, zoning: null, error: "PID not in parcels" }); continue; }
    if (p.lat == null || p.lng == null) { results.push({ pid, cached: false, zoning: null, error: "Parcel has no coordinates" }); continue; }
    if (budget <= 0) { results.push({ pid, cached: false, zoning: null, error: `Daily Zoneomics cap of ${DAILY_CAP} reached` }); continue; }

    try {
      budget -= 1;
      const body = await callZoneomics(p.lat, p.lng);
      const { row, matchedKeys } = parseZoneDetail(pid, body);
      console.log(`[lookup-zoning] ${pid}: zone=${row.zone_code} far_key=${matchedKeys.far} height_key=${matchedKeys.height}`);

      // Store definitive answers, including "no zoning found", so we never pay twice for the same PID.
      // raw is redacted too, in case the API ever echoes request parameters back.
      const safeRaw = JSON.parse(redact(JSON.stringify(row.raw ?? null)));
      const { error: upErr } = await admin.from("zoning_cache").upsert({ ...row, raw: safeRaw, fetched_at: new Date().toISOString() }, { onConflict: "pid" });
      if (upErr) console.error(`[lookup-zoning] cache write failed for ${pid}: ${upErr.message}`);

      results.push({ pid, cached: false, zoning: { ...row, raw: undefined } });
    } catch (e) {
      // Network or API errors are NOT cached, so a later request can retry.
      results.push({ pid, cached: false, zoning: null, error: (e as Error).message });
    }
  }

  return json({ results });
});
