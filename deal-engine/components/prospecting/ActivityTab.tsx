'use client';
import { useState } from 'react';
import { ASSUMPTIONS } from '@/lib/calc/constants';
import { shortDay } from '@/lib/calc/format';
import { data } from '@/lib/data';
import { useAsync } from '@/hooks/useAsync';
import type { Activity, Lead, LeadStatus } from '@/types/domain';

const STATUSES: LeadStatus[] = ['New', 'Contacted', 'Conversation', 'Meeting', 'Listing pitch', 'Listing won', 'Sold'];

export function ActivityTab({ lead, onStatus }: { lead: Lead; onStatus: (s: LeadStatus) => void }) {
  const acts = useAsync(() => data.listActivities(lead.pid), [lead.pid]);
  const draft = useAsync(() => data.draftOutreach(lead.pid), [lead.pid]);
  const [kind, setKind] = useState<Activity['kind']>('Call');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const last = acts.data?.find((x) => x.kind !== 'Status');
  const due = last ? new Date(new Date(last.createdAt).getTime() + ASSUMPTIONS.followUpDays * 864e5) : null;

  async function log(k: Activity['kind'], body: string) {
    setBusy(true);
    try {
      await data.addActivity(lead.pid, k, body);
      if (lead.status === 'New' && k !== 'Status') { await data.setStatus(lead.pid, 'Contacted'); onStatus('Contacted'); }
      acts.reload();
    } finally { setBusy(false); }
  }
  async function changeStatus(s: LeadStatus) { await data.setStatus(lead.pid, s); await data.addActivity(lead.pid, 'Status', `Changed to ${s}`); onStatus(s); acts.reload(); }

  return (
    <>
      <div className="form-row">
        <label htmlFor="st">Status</label>
        <select id="st" value={lead.status} onChange={(e) => changeStatus(e.target.value as LeadStatus)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <span className="note">{due ? `Follow-up rule: no reply in ${ASSUMPTIONS.followUpDays} days, next touch ${shortDay(due)}` : `Follow-up rule: next touch ${ASSUMPTIONS.followUpDays} days after first contact`}</span>
      </div>
      <div className="sec-h" style={{ marginTop: 12 }}>Log activity</div>
      <div className="form-row">
        <select value={kind} onChange={(e) => setKind(e.target.value as Activity['kind'])} aria-label="Activity type"><option>Call</option><option>Email</option><option>Note</option></select>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" style={{ flex: 1, minWidth: 160 }} aria-label="Activity note" />
        <button className="btn btn-blue" disabled={busy || !text.trim()} onClick={() => { log(kind, text.trim()); setText(''); }}>Log activity</button>
      </div>
      {acts.error && <div className="error">{acts.error}</div>}
      <ul className="log">
        {acts.data?.length ? acts.data.map((x) => <li key={x.id}><time>{shortDay(new Date(x.createdAt))}</time><span><b>{x.kind}</b> {x.text}</span></li>)
          : <li className="note">No activity yet. Log the first call or approve the draft below.</li>}
      </ul>
      <div className="sec-h" style={{ marginTop: 12 }}>Outreach draft <span className="tag ai">AI draft</span></div>
      {draft.loading ? <p className="note">Drafting from the lead record…</p> : draft.error ? <div className="error">{draft.error}</div> : <div className="draft">{draft.data?.text}</div>}
      <div className="form-row" style={{ marginTop: 10 }}>
        <button className="btn btn-lime" disabled={busy || !draft.data} onClick={() => log('Email', 'Approved outreach draft, logged as sent')}>Approve and log as sent</button>
        <span className="note">Nothing is emailed. Approval logs the touch.</span>
      </div>
    </>
  );
}
