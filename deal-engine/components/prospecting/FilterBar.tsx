'use client';
import { Search } from 'lucide-react';
import { AS_OF, TYPES } from '@/lib/calc/constants';
import { monthYear } from '@/lib/calc/format';
import type { ClassCode } from '@/types/domain';

export interface Filters { q: string; type: ClassCode | ''; owner: '' | 'company' | 'trust' | 'absentee' }

export function FilterBar({ f, setF, onGenerate, busy, exhausted }: { f: Filters; setF: (f: Filters) => void; onGenerate: () => void; busy: boolean; exhausted: boolean }) {
  return (
    <div className="filters">
      <label className="field search"><Search className="ico" aria-hidden />
        <input placeholder="Search location" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search location" /></label>
      <label className="field"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Filters['type'] })} aria-label="Property type">
        <option value="">Property type</option>{(Object.keys(TYPES) as ClassCode[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}</select></label>
      <label className="field"><select value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value as Filters['owner'] })} aria-label="Owner">
        <option value="">Owner</option><option value="company">LLC / company</option><option value="trust">Trust</option><option value="absentee">Absentee owner</option></select></label>
      <div className="right">
        <span className="asof">County data as of {monthYear(AS_OF)}</span>
        <button className="btn btn-lime" onClick={onGenerate} disabled={busy || exhausted}>{busy ? 'Pulling…' : exhausted ? 'Pool exhausted' : 'Generate 5 leads'}</button>
      </div>
    </div>
  );
}
