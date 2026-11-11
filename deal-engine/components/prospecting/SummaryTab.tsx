'use client';
import { Building2, Flame, Landmark } from 'lucide-react';
import { Cite } from '@/components/ui/Cite';
import { LV } from '@/components/ui/LV';
import { ZoningStatus } from '@/components/ui/ZoningStatus';
import { TYPES } from '@/lib/calc/constants';
import { int, money, monthYear } from '@/lib/calc/format';
import type { Lead } from '@/types/domain';

export function SummaryTab({ lead: l }: { lead: Lead }) {
  const z = l.zoning;
  return (
    <>
      <div className="sec">
        <div className="sec-h"><Building2 className="ico" aria-hidden />Property</div>
        <LV rows={[
          ['Property type', <Cite key="t" source="parcel" detail={`Class code ${l.classCode}`}>{TYPES[l.classCode].label}</Cite>],
          ['Building footprint', <Cite key="f" source="foot" detail="Sum of footprints for this PID. Stories not included.">{int(l.footprintSf)} SF</Cite>],
          ['Lot size', <Cite key="a" source="parcel" detail="Deeded acreage">{l.acreage} acres</Cite>],
          ['Footprint change', <Cite key="c" source="foot" detail="Percent change vs previous survey">{l.footprintChangePct > 0 ? '+' : ''}{l.footprintChangePct}%</Cite>],
          ['Last sale', <Cite key="s" source="parcel" detail="SALE_PRICE">{money(l.salePrice)}</Cite>],
          ['Sale date', <Cite key="d" source="parcel" detail="RECORDED_DATE">{monthYear(l.saleDate)}</Cite>],
        ]} />
      </div>
      <div className="sec">
        <div className="sec-h"><Landmark className="ico" aria-hidden />Zoning and risk</div>
        <LV rows={[
          ['Zoning', z.precision === 'parcel'
            ? <Cite key="z" source="zoning" detail={`Permitted: ${z.permittedUses.join(', ')}`}>{z.zoneCode}, {z.zoneName}</Cite>
            : <ZoningStatus key="z" z={z} />],
          ['Permitted uses', <span key="u">{z.permittedUses.join(', ') || '—'}</span>],
          ['Max FAR', <span key="far">{z.maxFar ?? 'Not mapped yet'}</span>],
          ['Flood zone', <Cite key="fl" source="fema">{l.floodZone}</Cite>],
          ['Jurisdiction', <Cite key="j" source="parcel">{l.jurisdiction}</Cite>],
        ]} />
      </div>
      {l.simulated.length > 0 && (
        <div className="sec">
          <div className="sec-h"><Flame className="ico" aria-hidden />Signals <span className="tag sim">Simulated</span></div>
          <div className="banner sim">
            {l.simulated.map((s) => <div key={s.text}>• {s.text}</div>)}
            <div className="note" style={{ marginTop: 6 }}>Mock data standing in for licensed signals. Never used in buyer-facing copy.</div>
          </div>
        </div>
      )}
    </>
  );
}
