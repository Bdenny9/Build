// serve-leads: hand the visitor `count` lead-candidate parcels they have not seen, strongest signals first.
// Zoning is fetched only for new PIDs, through lookup-zoning (cache first, daily credit cap).
// Request { count?: 1..10 } -> { leads: lead_view rows, remaining }
import { admin, rateLimit, requireUser, SERVICE_KEY, SUPABASE_URL } from '../_shared/auth.ts';
import { handle } from '../_shared/http.ts';

Deno.serve(handle(async (req, body) => {
  const userId = await requireUser(req);
  const count = Math.min(Math.max(Number(body.count ?? 5) || 5, 1), 10);
  const db = admin();
  await rateLimit(db, userId, 'serve-leads', 20);

  const { data: picked, error } = await db.rpc('pick_unseen_leads', { p_user: userId, p_count: count });
  if (error) throw new Error(error.message);
  const pids = ((picked ?? []) as { pid: string }[]).map((r) => r.pid);

  if (pids.length) {
    const { error: insErr } = await db.from('served_leads').insert(pids.map((pid) => ({ user_id: userId, pid })));
    if (insErr) throw new Error(insErr.message);

    // Zoning for the new leads. A failure here never blocks serving; the lead shows "Not fetched".
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/lookup-zoning`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pids }),
      });
      if (!res.ok) console.error(`[serve-leads] lookup-zoning ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      console.error(`[serve-leads] lookup-zoning failed: ${(e as Error).message}`);
    }
  }

  const { data: rows, error: rowsErr } = pids.length
    ? await db.from('lead_view').select('*').in('pid', pids)
    : { data: [], error: null };
  if (rowsErr) throw new Error(rowsErr.message);
  const byPid = new Map((rows ?? []).map((r: { pid: string }) => [r.pid, r]));

  const { data: remaining } = await db.rpc('remaining_leads', { p_user: userId });
  return { leads: pids.map((p) => byPid.get(p)).filter(Boolean), remaining: remaining ?? 0 };
}));
