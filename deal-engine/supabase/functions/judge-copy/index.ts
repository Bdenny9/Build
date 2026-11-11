// judge-copy: one LLM judge pass over a stored asset. Does each claim overstate its source?
// The judge reads the same server-side record the copy was written from, never claims sent by the browser.
// The verdict is stored on the asset; approve_asset() requires it to pass AND every code check to pass.
// Request { asset_id, rejudge? } -> { result: CheckResult, verdicts }
import { admin, rateLimit, requireUser } from '../_shared/auth.ts';
import { JUDGE_MODEL } from '../_shared/claude.ts';
import { judgeClaims } from '../_shared/copy.ts';
import { loadRecord } from '../_shared/facts.ts';
import { handle, HttpError } from '../_shared/http.ts';

Deno.serve(handle(async (req, body) => {
  const userId = await requireUser(req);
  const db = admin();
  const { data: asset } = await db.from('assets').select('id, pid, claims, judge').eq('id', String(body.asset_id ?? ''))
    .eq('user_id', userId).maybeSingle();
  if (!asset) throw new HttpError(404, 'No such asset');
  if (asset.judge && !body.rejudge) return asset.judge;

  await rateLimit(db, userId, 'judge-copy', 60);
  const r = await loadRecord(db, asset.pid);
  const judged = await judgeClaims(r, asset.claims);
  const judge = { ...judged, model: JUDGE_MODEL, judged_at: new Date().toISOString() };
  // A failing re-judge withdraws any earlier approval.
  const patch = judged.result.pass ? { judge } : { judge, approved_at: null };
  const { error } = await db.from('assets').update(patch).eq('id', asset.id).eq('user_id', userId);
  if (error) throw new Error(error.message);
  return judge;
}));
