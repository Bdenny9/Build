// run-evals: score a prompt version and a pair of models against the golden set; record it in eval_runs.
// Service role only: each case makes two model calls (generate, then judge).
//
// Case types (public.golden_cases):
//   clean        generated copy for a real parcel. Expect a pass. A record_patch can remove a section
//                (missing data); `forbid` then must not match the copy.
//   planted      generated copy plus the demo trap claims. Expect blocked.
//   injected     generated copy plus a hand-written overstatement (`category` names the trap). Expect blocked.
//   true_claims  generated copy plus hand-written TRUE claims. Expect a pass: measures judge false flags.
//   adversarial  the record carries a planted instruction (record_patch). Expect clean copy that ignores it.
// Metrics:
//   grounded_pct, numbers_pct   mean code-check ratios on clean cases
//   coverage_pct                usefulness: share of the record's key facts the copy actually states
//   clean_pass_pct              clean cases that pass everything (false blocks waste broker time)
//   blocked_pct                 planted and injected cases that end up blocked
//   judge_recall_pct            trap claims the judge flags, overall and per category (recall_by_category)
//   judge_false_flag_pct        generated claims in clean cases the judge flags
//   judge_true_flag_pct         hand-written true claims the judge flags
//   injection_resisted_pct      adversarial cases whose copy ignores the planted instruction and passes
//   missing_data_ok_pct         missing-data cases whose copy does not invent the removed section
import { admin, isServiceCaller } from '../_shared/auth.ts';
import { allPass, codeChecks, type Claim } from '../_shared/checks.ts';
import { GEN_MODEL, isModel, JUDGE_MODEL, newMeter, type Model } from '../_shared/claude.ts';
import { generateClaims, judgeClaims, plantedClaims, PROMPT_VERSION, type AssetKind } from '../_shared/copy.ts';
import { loadRecord, type Record_ } from '../_shared/facts.ts';
import { handle, HttpError } from '../_shared/http.ts';

/** Bump when golden cases are added or changed; runs are only compared within one golden set. */
const GOLDEN_SET = 'v2';

type CaseType = 'clean' | 'planted' | 'injected' | 'true_claims' | 'adversarial';
interface Case {
  id: number; pid: string; kind: AssetKind; case_type: CaseType; category: string | null;
  inject_claims: Claim[] | null; record_patch: Record<string, Record<string, unknown> | null> | null; forbid: string | null; note: string | null;
}

const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 100);
const EXPECT_PASS: CaseType[] = ['clean', 'true_claims', 'adversarial'];

/** Values for claim and patch placeholders, from the unpatched record. Undefined means not available. */
function placeholders(r: Record_): Record<string, string | undefined> {
  const fp = r.numeric.footprintSf, ac = r.numeric.acreage, med = r.numeric.medianPsf;
  const parcel = r.record.parcel as { address?: string; area?: string } | null;
  const fema = r.record.fema as { flood_zone?: string } | null;
  return {
    address: parcel?.address, area: parcel?.area,
    footprint: fp?.toLocaleString('en-US'),
    footprint_up: fp === undefined ? undefined : (Math.ceil((fp + 1) / 1000) * 1000).toLocaleString('en-US'),
    acreage: ac === undefined ? undefined : String(ac),
    acreage_up: ac === undefined ? undefined : String(Math.round(ac * 13 + 1) / 10), // about 30% more, one decimal
    flood_zone: fema?.flood_zone,
    median: med === undefined ? undefined : String(med),
    median_up: med === undefined ? undefined : String(Math.round(med * 1.15)),
    sales: r.compsCount ? String(r.compsCount) : undefined,
  };
}
/** Fills {name} placeholders. Returns null when any placeholder has no value, so the claim is skipped. */
function fill(text: string, vals: Record<string, string | undefined>): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (_, k) => { const v = vals[k]; if (v === undefined) missing = true; return v ?? ''; });
  return missing ? null : out;
}

/** Applies a record patch: null removes a section (and the numbers code checks against it); objects merge. */
function patchRecord(r: Record_, patch: Case['record_patch'], vals: Record<string, string | undefined>): Record_ {
  if (!patch) return r;
  const record = structuredClone(r.record);
  const numeric = { ...r.numeric };
  let compsCount = r.compsCount;
  for (const [section, value] of Object.entries(patch)) {
    if (value === null) {
      record[section] = null;
      if (section === 'comps') { numeric.medianPsf = undefined; compsCount = 0; }
      continue;
    }
    const merged: Record<string, unknown> = { ...(record[section] ?? {}) };
    for (const [k, v] of Object.entries(value)) merged[k] = typeof v === 'string' ? fill(v, vals) ?? v : v;
    record[section] = merged;
  }
  return { ...r, record, numeric, compsCount };
}

/** Usefulness: share of the key facts present in the record that the copy actually states. */
function coverage(r: Record_, claims: Claim[]): number {
  const text = claims.map((c) => c.text).join(' ');
  const states = (field: 'footprintSf' | 'acreage' | 'medianPsf', v: number | undefined) =>
    claims.some((c) => c.numeric?.field === field) || (v !== undefined && (text.includes(v.toLocaleString('en-US')) || text.includes(String(v))));
  const facts: boolean[] = [states('footprintSf', r.numeric.footprintSf)];
  if (r.numeric.acreage !== undefined) facts.push(states('acreage', r.numeric.acreage));
  if (r.record.fema) facts.push(claims.some((c) => c.source === 'fema'));
  if (r.record.comps) facts.push(states('medianPsf', r.numeric.medianPsf));
  if (r.record.zoning) facts.push(claims.some((c) => c.source === 'zoning'));
  return facts.filter(Boolean).length / facts.length;
}

async function runCase(db: ReturnType<typeof admin>, c: Case, gen: Model, judgeModel: Model) {
  const meter = newMeter();
  const base = await loadRecord(db, c.pid);
  const vals = placeholders(base);
  const r = patchRecord(base, c.record_patch, vals);
  const generated = await generateClaims(r, c.kind, gen, meter);

  let extra: Claim[] = [];
  if (c.case_type === 'planted') {
    const { data: sim } = await db.from('simulated_signals').select('body').eq('pid', c.pid).order('id').limit(1).maybeSingle();
    extra = plantedClaims(sim?.body ?? null);
  } else if (c.case_type === 'injected' || c.case_type === 'true_claims') {
    extra = (c.inject_claims ?? []).flatMap((cl) => { const text = fill(cl.text, vals); return text ? [{ ...cl, text }] : []; });
  }
  const claims = [...generated, ...extra];
  const checks = codeChecks(claims, r.numeric);
  const judge = await judgeClaims(r, claims, judgeModel, meter);
  const extraIdx = extra.map((_, i) => generated.length + i);
  const forbidHit = c.forbid ? new RegExp(c.forbid, 'i').test(generated.map((g) => g.text).join(' ')) : false;
  const passed = allPass(checks) && judge.result.pass;

  return {
    case_id: c.id, pid: c.pid, kind: c.kind, case_type: c.case_type, category: c.category,
    expect_pass: EXPECT_PASS.includes(c.case_type),
    passed, code_pass: allPass(checks), judge_pass: judge.result.pass,
    grounded: checks[0].ratio ?? 0, numbers: checks[1].ratio ?? 1, banned: !checks[2].pass,
    coverage: coverage(r, generated), patched: !!c.record_patch, forbid_hit: forbidHit,
    // For planted/injected these are traps; for true_claims they are known-true claims.
    traps: extraIdx.length, traps_flagged: extraIdx.filter((i) => judge.verdicts[i]?.overstates).length,
    generated: generated.length, generated_flagged: c.case_type === 'clean' ? judge.verdicts.slice(0, generated.length).filter((v) => v.overstates).length : 0,
    usd: meter.usd, ms: meter.ms, input_tokens: meter.input, output_tokens: meter.output,
    claims, checks, verdicts: judge.verdicts,
  };
}

type CaseResult = Awaited<ReturnType<typeof runCase>>;

function score(results: CaseResult[], failed: number) {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const mean = (xs: number[]) => (xs.length ? Math.round((1000 * sum(xs)) / xs.length) / 10 : 100);
  const by = (t: CaseType) => results.filter((r) => r.case_type === t);
  const clean = by('clean'), bad = results.filter((r) => r.case_type === 'planted' || r.case_type === 'injected');
  const trueCases = by('true_claims'), adv = by('adversarial'), missing = clean.filter((r) => r.category === 'missing_data');
  const usefulnessCases = clean.filter((r) => !r.patched && (r.kind === 'description' || r.kind === 'highlights'));
  const categories = [...new Set(bad.map((r) => r.category ?? 'other'))].sort();
  return {
    grounded_pct: mean(clean.map((r) => r.grounded)),
    numbers_pct: mean(clean.map((r) => r.numbers)),
    coverage_pct: mean(usefulnessCases.map((r) => r.coverage)),
    clean_pass_pct: pct(clean.filter((r) => r.passed).length, clean.length),
    blocked_pct: pct(bad.filter((r) => !r.passed).length, bad.length),
    judge_recall_pct: pct(sum(bad.map((r) => r.traps_flagged)), sum(bad.map((r) => r.traps))),
    judge_false_flag_pct: pct(sum(clean.map((r) => r.generated_flagged)), sum(clean.map((r) => r.generated))),
    judge_true_flag_pct: trueCases.length ? pct(sum(trueCases.map((r) => r.traps_flagged)), sum(trueCases.map((r) => r.traps))) : 0,
    injection_resisted_pct: pct(adv.filter((r) => !r.forbid_hit && r.passed).length, adv.length),
    missing_data_ok_pct: pct(missing.filter((r) => !r.forbid_hit).length, missing.length),
    recall_by_category: Object.fromEntries(categories.map((cat) => {
      const rs = bad.filter((r) => (r.category ?? 'other') === cat);
      return [cat, pct(sum(rs.map((r) => r.traps_flagged)), sum(rs.map((r) => r.traps)))];
    })),
    banned_hits: clean.filter((r) => r.banned).length,
    failed_cases: failed,
    // Cost and speed per case (one generation + one judge call).
    usd_per_case: results.length ? Math.round((sum(results.map((r) => r.usd ?? 0)) / results.length) * 10000) / 10000 : 0,
    sec_per_case: results.length ? Math.round(sum(results.map((r) => r.ms ?? 0)) / results.length / 100) / 10 : 0,
  };
}

// A full run takes longer than one function invocation allows, so callers send a few case_ids at a time
// and pass back the run_id they got: results accumulate on one eval_runs row and metrics are recomputed.
// Request { case_ids?: number[], run_id?: uuid, gen_model?, judge_model? } -> { id, prompt_version, cases, metrics, failures }
// Models default to the GEN_MODEL / JUDGE_MODEL secrets, so a sweep compares models without redeploying.
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
  const gen = body.gen_model === undefined ? GEN_MODEL : body.gen_model;
  const judgeModel = body.judge_model === undefined ? JUDGE_MODEL : body.judge_model;
  if (!isModel(gen) || !isModel(judgeModel)) throw new HttpError(400, 'Unknown gen_model or judge_model');

  let prior: { results: CaseResult[]; failures: { case_id: number; error: string }[] } = { results: [], failures: [] };
  if (body.run_id) {
    const { data: run } = await db.from('eval_runs').select('prompt_version, gen_model, judge_model, golden_set, results').eq('id', String(body.run_id)).maybeSingle();
    if (!run) throw new HttpError(404, 'No such run');
    if (run.prompt_version !== PROMPT_VERSION || run.golden_set !== GOLDEN_SET) throw new HttpError(409, `Run was started on ${run.prompt_version} / golden set ${run.golden_set}`);
    if (run.gen_model !== gen || run.judge_model !== judgeModel) throw new HttpError(409, `Run uses ${run.gen_model} / ${run.judge_model}`);
    prior = run.results;
  }

  const fresh: CaseResult[] = [], failures: { case_id: number; error: string }[] = [];
  const batch = await Promise.allSettled((cases as Case[]).map((c) => runCase(db, c, gen, judgeModel)));
  batch.forEach((b, j) => b.status === 'fulfilled' ? fresh.push(b.value)
    : failures.push({ case_id: (cases as Case[])[j].id, error: String((b.reason as Error)?.message ?? b.reason) }));
  if (!fresh.length) throw new HttpError(502, `Every case failed: ${failures[0]?.error ?? 'unknown error'}`);

  const done = new Set(fresh.map((r) => r.case_id));
  const results = [...prior.results.filter((r) => !done.has(r.case_id)), ...fresh];
  const allFailures = [...prior.failures.filter((f) => !done.has(f.case_id)), ...failures];
  const row = {
    prompt_version: PROMPT_VERSION, golden_set: GOLDEN_SET, model: judgeModel, gen_model: gen, judge_model: judgeModel,
    cases: results.length, metrics: score(results, allFailures.length), results: { results, failures: allFailures },
  };

  const saved = body.run_id
    ? await db.from('eval_runs').update(row).eq('id', String(body.run_id)).select('id').single()
    : await db.from('eval_runs').insert(row).select('id').single();
  if (saved.error) throw new Error(saved.error.message);
  return { id: saved.data.id, prompt_version: PROMPT_VERSION, golden_set: GOLDEN_SET, gen_model: gen, judge_model: judgeModel, cases: results.length, metrics: row.metrics, failures: allFailures };
}));
