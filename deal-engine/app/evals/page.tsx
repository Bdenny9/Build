'use client';
import { useState } from 'react';
import { EvalBars, METRICS, meets } from '@/components/evals/EvalSummary';
import { data } from '@/lib/data';
import { useAsync } from '@/hooks/useAsync';
import type { EvalCaseResult } from '@/types/domain';

const TYPE_LABEL: Record<EvalCaseResult['case_type'], string> = { clean: 'Clean', planted: 'Planted traps', injected: 'Injected overstatement' };

/** Reports: the golden-set scores for each copy prompt version, and every case behind them. */
export default function EvalsPage() {
  const runs = useAsync(() => data.listEvalRuns(), []);
  const latestId = runs.data?.[0]?.id;
  const detail = useAsync(async () => (latestId ? data.getEvalRun(latestId) : null), [latestId]);
  const [open, setOpen] = useState<number | null>(null);

  if (runs.loading) return <div className="page"><p className="note">Loading eval runs…</p></div>;
  if (runs.error) return <div className="page"><div className="error">{runs.error}</div></div>;
  const all = runs.data ?? [];
  const latest = all[0];
  const prev = all.find((r) => r.promptVersion !== latest?.promptVersion);
  const sample = latest?.promptVersion === 'sample';

  return (
    <div className="canvas" style={{ maxWidth: 1240, margin: '0 auto' }}>
      <div className="canvas-h">
        <h2>Model evals</h2>
        {sample && <span className="tag sim">Sample data in mock mode</span>}
        <div className="right note">Two model calls per case: generate, then judge. Code checks run on every case.</div>
      </div>
      {!latest ? <div className="rcard"><p className="note">No eval run yet. Run the golden set with the run-evals function.</p></div> : (
        <div className="cards">
          <section className="rcard">
            <div className="rh"><div><h3>Latest run</h3><div className="sub">Prompt {latest.promptVersion} · {latest.model} · {latest.cases} cases · {new Date(latest.runAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div></div>
            <div className="rb"><EvalBars metrics={latest.metrics} /></div>
            <div className="rf note">Release rule: a new prompt version ships only if every metric meets its target and none drops.</div>
          </section>

          <section className="rcard">
            <div className="rh"><div><h3>Release check</h3><div className="sub">{prev ? `${latest.promptVersion} against ${prev.promptVersion}` : 'Baseline run. The next prompt version is compared against it.'}</div></div></div>
            <div className="rb tbl-wrap">
              <table className="data"><thead><tr><th>Metric</th>{prev && <th className="num">{prev.promptVersion}</th>}<th className="num">{latest.promptVersion}</th><th>Status</th></tr></thead>
                <tbody>{METRICS.map((m) => {
                  const v = latest.metrics[m.key], p = prev?.metrics[m.key];
                  const dropped = p !== undefined && (m.lowerIsBetter ? v > p : v < p);
                  const ok = meets(m, v) && !dropped;
                  return <tr key={m.key}><td>{m.label}</td>{prev && <td className="num">{p}%</td>}<td className="num">{v}%</td><td><span className={`tag ${ok ? 'ok' : 'bad'}`}>{ok ? 'OK' : dropped ? 'Dropped' : 'Below target'}</span></td></tr>;
                })}</tbody>
              </table>
            </div>
          </section>

          <section className="rcard">
            <div className="rh"><div><h3>Run history</h3><div className="sub">Newest first</div></div></div>
            <div className="rb tbl-wrap">
              <table className="data"><thead><tr><th>Run</th><th>Prompt</th><th className="num">Cases</th><th className="num">Blocked</th><th className="num">Judge recall</th></tr></thead>
                <tbody>{all.map((r) => <tr key={r.id}><td>{new Date(r.runAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td><td>{r.promptVersion}</td><td className="num">{r.cases}</td><td className="num">{r.metrics.blocked_pct}%</td><td className="num">{r.metrics.judge_recall_pct}%</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="rcard span2" style={{ gridColumn: '1 / -1' }}>
            <div className="rh"><div><h3>Golden cases</h3><div className="sub">Every case in the latest run. Open one to see each claim and the judge&apos;s reason.</div></div></div>
            <div className="rb tbl-wrap">
              {detail.loading ? <p className="note">Loading cases…</p> : !detail.data?.results?.length ? <p className="note">{sample ? 'Per-case results appear once evals run against Supabase.' : 'No case results stored.'}</p> : (
                <table className="data">
                  <thead><tr><th>#</th><th>Type</th><th>Asset</th><th>PID</th><th>Code checks</th><th>Judge</th><th>Traps flagged</th><th>Result</th><th /></tr></thead>
                  <tbody>{detail.data.results.flatMap((c) => {
                    const expected = c.case_type === 'clean' ? c.passed : !c.passed;
                    const rows = [
                      <tr key={c.case_id}>
                        <td>{c.case_id}</td><td>{TYPE_LABEL[c.case_type]}</td><td>{c.kind}</td><td>{c.pid}</td>
                        <td><span className={`tag ${c.code_pass ? 'ok' : 'bad'}`}>{c.code_pass ? 'Pass' : 'Fail'}</span></td>
                        <td><span className={`tag ${c.judge_pass ? 'ok' : 'bad'}`}>{c.judge_pass ? 'Pass' : 'Flagged'}</span></td>
                        <td className="num">{c.traps ? `${c.traps_flagged} of ${c.traps}` : '—'}</td>
                        <td><span className={`tag ${expected ? 'ok' : 'bad'}`}>{c.passed ? 'Passed' : 'Blocked'}{expected ? '' : ' (wrong)'}</span></td>
                        <td><button className="btn" onClick={() => setOpen(open === c.case_id ? null : c.case_id)}>{open === c.case_id ? 'Hide' : 'Claims'}</button></td>
                      </tr>,
                    ];
                    if (open === c.case_id) rows.push(
                      <tr key={`${c.case_id}-d`}><td colSpan={9} style={{ whiteSpace: 'normal', background: 'var(--panel-2)' }}>
                        <ul className="verdicts">{c.claims.map((cl, i) => (
                          <li key={i}>
                            <div className={`check ${c.verdicts[i]?.overstates ? 'fail' : 'pass'}`} style={{ padding: 0, border: 0 }}><div className="dot" aria-hidden>{c.verdicts[i]?.overstates ? '!' : '✓'}</div></div>
                            <div><div>{cl.text} <span className="tag">{cl.source ?? 'no source'}</span></div><div className="why-v">{c.verdicts[i]?.reason}</div></div>
                          </li>
                        ))}</ul>
                      </td></tr>,
                    );
                    return rows;
                  })}</tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
