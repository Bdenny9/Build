'use client';
import { ShieldCheck } from 'lucide-react';
import type { CheckResult, Claim, JudgeVerdict } from '@/types/domain';

/** Checks for one asset: code checks first (cannot be overruled), then the LLM judge. */
export function ChecksCard({ checks, judging }: { checks: CheckResult[]; judging: boolean }) {
  const pass = !judging && checks.length > 0 && checks.every((c) => c.pass);
  return (
    <section className="rcard" aria-label="Checks">
      <div className="rh">
        <div><h3>Checks</h3><div className="sub">Code checks run first and cannot be overruled</div></div>
        <div className="right"><span className={`tag ${judging ? '' : pass ? 'ok' : 'bad'}`}><ShieldCheck className="ico" aria-hidden />{judging ? 'Judging…' : pass ? 'Pass' : 'Blocked'}</span></div>
      </div>
      <div className="rb">
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
        {judging && <p className="note">The judge is reading each claim against the record…</p>}
      </div>
    </section>
  );
}

/** The judge's verdict on every claim, so a broker can see exactly which sentence blocked approval and why. */
export function VerdictsCard({ claims, verdicts }: { claims: Claim[]; verdicts: JudgeVerdict[] }) {
  const flagged = verdicts.filter((v) => v.overstates).length;
  return (
    <section className="rcard span2" aria-label="Judge verdicts">
      <div className="rh">
        <div><h3>Judge verdicts</h3><div className="sub">Does each claim overstate its source?</div></div>
        <div className="right"><span className={`tag ${flagged ? 'bad' : 'ok'}`}>{flagged ? `${flagged} flagged` : 'None flagged'}</span></div>
      </div>
      <ul className="verdicts rb">
        {verdicts.map((v) => (
          <li key={v.index}>
            <div className={`check ${v.overstates ? 'fail' : 'pass'}`} style={{ padding: 0, border: 0 }}><div className="dot" aria-hidden>{v.overstates ? '!' : '✓'}</div></div>
            <div>
              <div>{claims[v.index]?.text}</div>
              <div className="why-v">{v.reason}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
