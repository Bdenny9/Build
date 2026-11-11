'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { DetailPane } from '@/components/prospecting/DetailPane';
import { FilterBar, type Filters } from '@/components/prospecting/FilterBar';
import { PropertyRow } from '@/components/prospecting/PropertyRow';
import { isAbsentee } from '@/lib/calc/sellability';
import { data } from '@/lib/data';
import type { Lead, LeadStatus } from '@/types/domain';

const MapPane = dynamic(() => import('@/components/prospecting/MapPane'), { ssr: false, loading: () => <div className="map-pane" /> });

export default function ProspectingPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Filters>({ q: '', type: '', owner: '' });

  useEffect(() => { data.listServedLeads().then((ls) => { setLeads(ls); if (ls[0]) setSel(ls[0].pid); }).catch((e) => setError(String(e.message ?? e))); }, []);

  async function generate() {
    setBusy(true); setError(null);
    try {
      const r = await data.serveLeads(5);
      setLeads((p) => [...p, ...r.leads]); setRemaining(r.remaining);
      if (r.leads[0]) setSel(r.leads[0].pid);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const shown = useMemo(() => leads.filter((l) =>
    (!f.q || `${l.address} ${l.area}`.toLowerCase().includes(f.q.toLowerCase())) &&
    (!f.type || l.classCode === f.type) &&
    (!f.owner || (f.owner === 'company' ? /\b(LLC|INC|LP|CORP)\b/i.test(l.owner) : f.owner === 'trust' ? /TRUST/i.test(l.owner) : isAbsentee(l)))), [leads, f]);
  const lead = leads.find((l) => l.pid === sel) ?? null;
  const setStatus = (pid: string) => (s: LeadStatus) => setLeads((ls) => ls.map((l) => (l.pid === pid ? { ...l, status: s } : l)));
  const allChecked = shown.length > 0 && shown.every((l) => checked.has(l.pid));

  return (
    <>
      <FilterBar f={f} setF={setF} onGenerate={generate} busy={busy} exhausted={remaining === 0} />
      <div className="workspace">
        <section className="list-pane" aria-label="Properties">
          <div className="list-head">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={allChecked}
              onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((l) => l.pid)) : new Set())} /> Select all</label>
            <span className="right">{checked.size ? `${checked.size} selected` : remaining !== null ? `${remaining} unseen in pool` : ''}</span>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="list-scroll">
            {shown.length ? shown.map((l) => (
              <PropertyRow key={l.pid} lead={l} selected={l.pid === sel} checked={checked.has(l.pid)} onSelect={() => setSel(l.pid)}
                onCheck={(v) => setChecked((s) => { const n = new Set(s); v ? n.add(l.pid) : n.delete(l.pid); return n; })} />))
              : <div className="list-empty">{leads.length ? 'No properties match these filters.' : 'Generate leads to pull commercial parcels from the Charleston County pool. Each click serves five you haven’t seen.'}</div>}
          </div>
        </section>
        <MapPane leads={shown} selected={lead} onSelect={setSel} />
        <DetailPane lead={lead} onStatus={lead ? setStatus(lead.pid) : () => {}} />
      </div>
    </>
  );
}
