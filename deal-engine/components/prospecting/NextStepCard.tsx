'use client';
import { useState } from 'react';
import { ArrowRightCircle } from 'lucide-react';
import { ASSUMPTIONS } from '@/lib/calc/constants';
import { nextStep } from '@/lib/calc/nextStep';
import type { Analysis } from '@/hooks/useAnalysis';
import type { Activity, Lead } from '@/types/domain';

/**
 * Recommended next step from the deterministic rule engine. Confirm-before-action: the card shows exactly
 * what will be written, and nothing is logged until the broker confirms. Nothing is ever sent.
 */
export function NextStepCard({ lead, analysis, activities, onConfirm }: {
  lead: Lead; analysis: Analysis | null; activities: Activity[];
  onConfirm: (log: { kind: Activity['kind']; text: string; status?: Lead['status'] }) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!analysis) return <p className="note">Working out the next step…</p>;
  const s = nextStep({
    status: lead.status, scoreLevel: analysis.score.level, monthsToMaturity: analysis.loan.monthsToMaturity,
    activities, now: new Date().toISOString(), followUpDays: ASSUMPTIONS.followUpDays,
  });
  async function confirm() {
    if (!s.log) return;
    setBusy(true);
    try { await onConfirm(s.log); setConfirming(false); } finally { setBusy(false); }
  }
  return (
    <div className="callout" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ArrowRightCircle className="ico" aria-hidden style={{ color: 'var(--blue)' }} />
        <b style={{ display: 'inline' }}>Next step: {s.title}</b>
        <span className={`tag ${s.overdue ? 'bad' : ''}`} style={{ marginLeft: 'auto' }}>{s.overdue ? 'Overdue' : `Due ${s.due}`}</span>
      </div>
      <ul className="note" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <div className="tiny" style={{ marginTop: 6 }}>Rule <code>{s.rule}</code> · deterministic, no AI</div>
      {s.log && !confirming && <button className="btn" style={{ marginTop: 8 }} onClick={() => setConfirming(true)}>Review and log</button>}
      {s.log && confirming && (
        <div style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div className="tiny">This will write:</div>
          <div style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
            <b style={{ display: 'inline' }}>{s.log.kind}</b> “{s.log.text}”{s.log.status ? <> and set status to <b style={{ display: 'inline' }}>{s.log.status}</b></> : null}. Nothing is sent.
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <button className="btn btn-lime" disabled={busy} onClick={confirm}>Confirm</button>
            <button className="btn" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
