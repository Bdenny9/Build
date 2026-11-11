'use client';
import { ShieldCheck } from 'lucide-react';
import type { CheckResult } from '@/types/domain';

export function EvalPanel({ checks, judging }: { checks: CheckResult[]; judging: boolean }) {
  const pass = !judging && checks.length > 0 && checks.every((c) => c.pass);
  return (
    <aside className="evalp" aria-label="Eval panel">
      <div className="sec-h" style={{ fontSize: 14 }}><ShieldCheck className="ico" aria-hidden />Eval panel
        <span className={`tag ${judging ? '' : pass ? 'ok' : 'bad'}`}>{judging ? 'Judging…' : pass ? 'Pass' : 'Blocked'}</span></div>
      <p className="note" style={{ marginTop: 0 }}>Code checks run first and cannot be overruled. One LLM judge handles overstating.</p>
      {checks.map((c) => (
        <div key={c.name} className={`check ${c.pass ? 'pass' : 'fail'}`}>
          <div className="dot" aria-hidden>{c.pass ? '✓' : '!'}</div>
          <div style={{ flex: 1 }}>
            <div className="what">{c.name} {c.kind === 'llm' && <span className="tag ai">LLM</span>}</div>
            <div className="det">{c.detail}</div>
            {c.ratio !== undefined && <div className={`meter ${c.pass ? '' : 'bad'}`}><i style={{ width: `${Math.round(c.ratio * 100)}%` }} /></div>}
          </div>
        </div>
      ))}
      <div className="sec-h" style={{ marginTop: 16 }}>Golden set <span className="tag">Sample results</span></div>
      <div className="tbl-wrap"><table className="data">
        <thead><tr><th>Prompt</th><th className="num">Grounded</th><th className="num">Numbers</th><th className="num">Judge</th></tr></thead>
        <tbody><tr><td>v1</td><td className="num">94%</td><td className="num">97%</td><td className="num">88%</td></tr>
          <tr><td>v2 (current)</td><td className="num">100%</td><td className="num">100%</td><td className="num">93%</td></tr></tbody>
      </table></div>
      <p className="note">Replaced by the eval_runs table once the golden set is labeled. A release ships only if no score drops.</p>
    </aside>
  );
}
