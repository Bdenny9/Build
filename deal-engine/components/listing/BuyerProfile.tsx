'use client';
import { TYPES } from '@/lib/calc/constants';
import { int, moneyShort } from '@/lib/calc/format';
import type { Lead } from '@/types/domain';

/** Deterministic buyer targeting from zoning, type, lot size and flood zone. */
export function BuyerProfile({ lead: l, value }: { lead: Lead; value: number }) {
  const uses = l.zoning.permittedUses;
  const b: { n: string; w: string }[] = [];
  if (uses[0]) b.push({ n: 'Owner-users', w: `${uses[0]} operators who want to own their space; zoning permits ${uses.slice(0, 2).join(' and ').toLowerCase()}.` });
  b.push({ n: '1031 exchange buyers', w: `Investors trading up into ${TYPES[l.classCode].label.toLowerCase()} near the ${moneyShort(value)} estimate.` });
  if (['304', '630', '500'].includes(l.classCode)) b.push({ n: 'Industrial and flex investors', w: `${int(l.footprintSf)} SF on ${l.acreage} acres in ${l.area}.` });
  if (l.acreage >= 1) b.push({ n: 'Developers', w: `${l.acreage} acres. ${l.zoning.maxFar ? `FAR up to ${l.zoning.maxFar}.` : 'FAR and height checks run once zoning standards are mapped.'}` });
  if (/^(A|V)/.test(l.floodZone)) b.push({ n: 'Flood-aware buyers', w: `Zone ${l.floodZone}: buyers will price flood insurance, so lead with elevation data if available.` });
  return (
    <>
      <div className="buyers">{b.map((x) => <div key={x.n} className="buyer"><b>{x.n}</b><span className="note">{x.w}</span></div>)}</div>
    </>
  );
}
