'use client';
import { CalendarClock, Flame, UserPlus } from 'lucide-react';
import { Thumb } from '@/components/ui/Thumb';
import { ASSUMPTIONS, AS_OF, TYPES } from '@/lib/calc/constants';
import { addMonths, monthsBetween, parseDay } from '@/lib/calc/dates';
import { int } from '@/lib/calc/format';
import { isAbsentee } from '@/lib/calc/sellability';
import type { Lead } from '@/types/domain';

/** Cheap, deterministic list tags. No fetch needed: maturity is sale date + term. */
function quickTags(l: Lead) {
  const toMat = monthsBetween(parseDay(AS_OF), addMonths(parseDay(l.saleDate), ASSUMPTIONS.termMonths));
  const hold = monthsBetween(parseDay(l.saleDate), parseDay(AS_OF)) / 12;
  return { loanDue: Math.abs(toMat) <= 18, hold: Math.floor(hold), absentee: isAbsentee(l) };
}

export function PropertyRow({ lead: l, selected, checked, onSelect, onCheck }: { lead: Lead; selected: boolean; checked: boolean; onSelect: () => void; onCheck: (v: boolean) => void }) {
  const t = quickTags(l);
  return (
    <div className="row" role="button" tabIndex={0} aria-current={selected} onClick={onSelect} onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}>
      <input type="checkbox" checked={checked} onClick={(e) => e.stopPropagation()} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${l.address}`} />
      <div>
        <div className="addr">{l.address}</div>
        <div className="city">{l.area}, SC</div>
        <div className="kind">{TYPES[l.classCode].label} · {int(l.footprintSf)} SF · Held {t.hold} yrs</div>
        <div className="tags">
          {t.loanDue && <span className="tag hot"><CalendarClock className="ico" aria-hidden />Loan due</span>}
          {t.absentee && <span className="tag">Absentee</span>}
          {l.simulated.length > 0 && <span className="tag sim"><Flame className="ico" aria-hidden />{l.simulated.length} simulated</span>}
          {l.status !== 'New' && <span className="tag ok">{l.status}</span>}
        </div>
      </div>
      <Thumb classCode={l.classCode} />
      <span className="add" title="Add to pipeline"><UserPlus className="ico" aria-hidden /></span>
    </div>
  );
}
