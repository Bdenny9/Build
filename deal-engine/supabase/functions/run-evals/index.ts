// run-evals: score the current prompt version against the golden set and record it in eval_runs.
// Service role only: each run makes two model calls per case.
//
// Case types (public.golden_cases):
//   clean     generated copy for a real parcel. Expect every check and the judge to pass.
//   planted   generated copy plus the demo trap claims. Expect it to be blocked.
//   injected  generated copy plus hand-written overstatements that cite a real source, so only the judge
//             can catch them. Measures judge recall.
// Metrics:
//   grounded_pct, numbers_pct     mean code-check ratios on clean cases (generation quality)
//   clean_pass_pct                clean cases that pass everything (false blocks hurt brokers)
//   blocked_pct                   planted and injected cases that are blocked (must be 100)
//   judge_recall_pct              planted and injected claims the judge flags
//   judge_false_flag_pct          generated claims in clean cases the judge flags
import { admin, isServiceCaller } from '../_shared/auth.ts';
import { allPass, codeChecks, type Claim } from '../_shared/checks.ts';
import { MODEL } from '../_shared/claude.ts';
import { generateClaims, judgeClaims, plantedClaims, PROMPT_VERSION, type AssetKind } from '../_shared/copy.ts';
import { loadRecord } from '../_shared/facts.ts';
import { handle, HttpError } from '../_shared/http.ts';

interface Case { id: number; pid: string; kind: AssetKind; case_type: 'clean' | 'planted' | 'injected'; inject_claims: Claim[] | null; note: string | null }

const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 100);

async function runCase(db: ReturnType<typeof admin>, c: Case) {
  const r = await loadRecord(db, c.pid);
  const generated = await generateClaims(r, c.kind);
  let extra: Claim[] = [];
  if (c.case_type === 'planted') {
    const { data: sim } = await db.from('simulated_signals').select('body').eq('pid', c.pid).order('id').limit(1).maybeSingle();
    extra = plantedClaims(sim?.body ?? null);
  } else if (c.case_type === 'injected') {
    extra = c.inject_claims ?? [];
  }
  const claims = [...generated, ...extra];
  const checks = codeChecks(claims, r.numeric);
  const judge = await judgeClaims(r, claims);
  const trapIdx = extra.map((_, i) => generated.length + i);
  return {
    case_id: c.id, pid: c.pid, kind: c.kind, case_type: c.case_type,
    expect_pass: c.case_type === 'clean',
    passed: allPass(checks) && judge.result.pass,
    code_pass: allPass(checks), judge_pass: judge.result.pass,
    grounded: checks[0].ratio ?? 0, numbers: checks[1].ratio ?? 1, banned: !checks[2].pass,
    traps: trapIdx.length, traps_flagged: trapIdx.filter((i) => judge.verdicts[i]?.overstates).length,
    generated: generated.length, generated_flagged: c.case_type === 'clean' ? judge.verdicts.slice(0, generated.length).filter((v) => v.overstates).length : 0,
    claims, checks, verdicts: judge.verdicts,
  };
}

type CaseResult = Awaited<ReturnType<typeof runCase>>;

function score(results: CaseResult[], failed: number) {
  const clean = results.filter((r) => r.case_type === 'clean'), bad = results.filter((r) => r.case_type !== 'clean');
  const mean = (xs: number[]) => (xs.length ? Math.round((1000 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10 : 100);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    grounded_pct: mean(clean.map((r) => r.grounded)),
    numbers_pct: mean(clean.map((r) => r.numbers)),
    clean_pass_pct: pct(clean.filter((r) => r.passed).length, clean.length),
    blocked_pct: pct(bad.filter((r) => !r.passed).length, bad.length),
    judge_recall_pct: pct(sum(bad.map((r) => r.traps_flagged)), sum(bad.map((r) => r.traps))),
    judge_false_flag_pct: pct(sum(clean.map((r) => r.generated_flagged)), sum(clean.map((r) => r.generated))),
    banned_hits: clean.filter((r) => r.banned).length,
    failed_cases: failed,
  };
}

// A full run takes longer than one function invocation allows, so callers send a few case_ids at a time
// and pass back the run_id they got: results accumulate on one eval_runs row and metrics are recomputed.
// Request { case_ids?: number[], run_id?: uuid } -> { id, prompt_version, cases, metrics, failures }
Deno.serve(handle(async (req, body) => {
  if (!isServiceCaller(req)) throw new HttpError(403, 'run-evals requires the service role');
  if (!Deno.env.get('ANTHROPIC_API_KEY')) throw new HttpError(503, 'ANTHROPIC_API_KEY secret is not set');
  const db = admin();
  let q = db.from('golden_cases').select('*').order('id');
  if (Array.isArray(body.case_ids) && body.case_ids.length) q = q.in('id', body.case_ids as number[]);
  const { data: cases, error } = await q;
  if (error) throw new Error(error.message);
  if (!cases?.length) throw new HttpError(400, 'No golden cases');
  if (cases.length > 6) throw new HttpError(400, 'Send at most 6 case_ids per call and pass run_id to continue a run');

  let prior: { results: CaseResult[]; failures: { case_id: number; error: string }[] } = { results: [], failures: [] };
  if (body.run_id) {
    const { data: run } = await db.from('eval_runs').select('prompt_version, results').eq('id', String(body.run_id)).maybeSingle();
    if (!run) throw new HttpError(404, 'No such run');
    if (run.prompt_version !== PROMPT_VERSION) throw new HttpError(409, `Run was started on ${run.prompt_version}`);
    prior = run.results;
  }

  const fresh: CaseResult[] = [], failures: { case_id: number; error: string }[] = [];
  const batch = await Promise.allSettled((cases as Case[]).map((c) => runCase(db, c)));
  batch.forEach((b, j) => b.status === 'fulfilled' ? fresh.push(b.value)
    : failures.push({ case_id: (cases as Case[])[j].id, error: String((b.reason as Error)?.message ?? b.reason) }));
  if (!fresh.length) throw new HttpError(502, `Every case failed: ${failures[0]?.error ?? 'unknown error'}`);

  const done = new Set(fresh.map((r) => r.case_id));
  const results = [...prior.results.filter((r) => !done.has(r.case_id)), ...fresh];
  const allFailures = [...prior.failures.filter((f) => !done.has(f.case_id)), ...failures];
  const row = { prompt_version: PROMPT_VERSION, model: MODEL, cases: results.length, metrics: score(results, allFailures.length), results: { results, failures: allFailures } };

  const saved = body.run_id
    ? await db.from('eval_runs').update(row).eq('id', String(body.run_id)).select('id').single()
    : await db.from('eval_runs').insert(row).select('id').single();
  if (saved.error) throw new Error(saved.error.message);
  return { id: saved.data.id, prompt_version: PROMPT_VERSION, cases: results.length, metrics: row.metrics, failures: allFailures };
}));
