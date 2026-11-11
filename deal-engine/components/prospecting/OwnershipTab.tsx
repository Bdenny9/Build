'use client';
import { BadgeCheck, Contact, Mail, MapPin, Users } from 'lucide-react';
import { Cite } from '@/components/ui/Cite';
import { LV } from '@/components/ui/LV';
import { isAbsentee } from '@/lib/calc/sellability';
import type { Lead } from '@/types/domain';

const ownerType = (o: string) => (/\b(LLC|INC|LP|CORP)\b/i.test(o) ? 'Company' : /TRUST/i.test(o) ? 'Trust' : 'Individual');

export function OwnershipTab({ lead: l }: { lead: Lead }) {
  const company = ownerType(l.owner) === 'Company';
  return (
    <>
      <div className="sec">
        <div className="sec-h"><Users className="ico" aria-hidden />Ownership</div>
        <LV rows={[
          ['Owner name', <Cite key="o" source="parcel" detail="OWNER1. Sample owners are fictional.">{l.owner}</Cite>],
          ['Owner type', <Cite key="t" source="calc" detail="Rule on owner name">{ownerType(l.owner)}</Cite>],
          ['Owner occupies property', <Cite key="oc" source="calc" detail="Mailing address compared to property state">{isAbsentee(l) ? 'No' : 'Possibly'}</Cite>],
          ['Owner address', <Cite key="m" source="parcel">{l.mailCity}, {l.mailState}</Cite>],
          ['Associated properties in county', <Cite key="a" source="calc" detail="Grouped by owner name and mailing address"><a href="#" onClick={(e) => e.preventDefault()}>{l.otherParcels} properties</a></Cite>],
        ]} />
      </div>
      <div className="sec">
        <div className="sec-h"><Contact className="ico" aria-hidden />Decision maker</div>
        {company && <div style={{ marginBottom: 8 }}><span className="pill violet"><BadgeCheck className="ico" aria-hidden />Legal entity on record</span></div>}
        <div className="callout">
          <b>{l.owner}</b>
          <div className="tiny">{company ? 'Officers and verified contacts come from Buildout’s owner lookup. This prototype stops at the public record.' : 'Contact details come from Buildout’s owner lookup.'}</div>
        </div>
        <div className="cards2" style={{ marginTop: 10 }}>
          <div><div className="v"><MapPin className="ico" aria-hidden />{l.mailCity}, {l.mailState}</div><div className="k">Mailing address</div></div>
          <div><div className="v"><Mail className="ico" aria-hidden />Via lookup</div><div className="k">Email</div></div>
          <div><div className="v"><Contact className="ico" aria-hidden />Via lookup</div><div className="k">Phone</div></div>
        </div>
      </div>
    </>
  );
}
