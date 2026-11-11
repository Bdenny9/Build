// generate-copy: listing copy as JSON claims, built server-side from the listing record.
// Code checks run here and are stored with the asset, so approval can be enforced in the database.
// Returns the stored asset for (user, pid, kind, plant_errors, prompt_version) unless regenerate is set.
// Request { pid, kind, plant_errors?, regenerate? } -> { id, claims, prompt_version, code_checks, judge, approved_at }
import { admin, rateLimit, requireUser } from '../_shared/auth.ts';
import { codeChecks } from '../_shared/checks.ts';
import { generateClaims, KINDS, plantedClaims, PROMPT_VERSION, type AssetKind } from '../_shared/copy.ts';
import { loadRecord } from '../_shared/facts.ts';
import { handle, HttpError } from '../_shared/http.ts';

const COLS = 'id, claims, prompt_version, code_checks, judge, approved_at';

Deno.serve(handle(async (req, body) => {
  const userId = await requireUser(req);
  const pid = String(body.pid ?? '');
  const kind = String(body.kind ?? '') as AssetKind;
  if (!KINDS.includes(kind)) throw new HttpError(400, `kind must be one of ${KINDS.join(', ')}`);
  const plant = !!body.plant_errors;
  const db = admin();

  const { data: listing } = await db.from('listings').select('pid').eq('user_id', userId).eq('pid', pid).maybeSingle();
  if (!listing) throw new HttpError(403, 'Win the listing before generating copy');

  if (!body.regenerate) {
    const { data: cached } = await db.from('assets').select(COLS).eq('user_id', userId).eq('pid', pid).eq('kind', kind)
      .eq('plant_errors', plant).eq('prompt_version', PROMPT_VERSION).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cached) return cached;
  }
  await rateLimit(db, userId, 'generate-copy', 40);

  const r = await loadRecord(db, pid);
  let claims = await generateClaims(r, kind);
  if (plant) {
    const { data: sim } = await db.from('simulated_signals').select('body').eq('pid', pid).order('id').limit(1).maybeSingle();
    const [loc, cap, ...rest] = plantedClaims(sim?.body ?? null);
    claims = [claims[0], loc, ...claims.slice(1), cap, ...rest];
  }
  const checks = codeChecks(claims, r.numeric);

  const { data, error } = await db.from('assets').insert({
    user_id: userId, pid, kind, claims, prompt_version: PROMPT_VERSION, plant_errors: plant, code_checks: checks,
  }).select(COLS).single();
  if (error) throw new Error(error.message);
  return data;
}));
