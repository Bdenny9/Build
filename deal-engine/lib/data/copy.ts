import { TYPES } from '@/lib/calc/constants';
import { money, int } from '@/lib/calc/format';
import type { AssetKind, Claim, Lead } from '@/types/domain';

/**
 * Mock stand-in for the generate-copy edge function. The real function asks Claude
 * for this exact Claim[] shape (JSON only), using only the fields it is given.
 */
export function templateClaims(l: Lead, medianPsf: number, kind: AssetKind, plantErrors = false): Claim[] {
  const T = TYPES[l.classCode].label.toLowerCase();
  const uses = l.zoning.permittedUses;
  const psf = Math.round(medianPsf);
  const zone = l.zoning.precision === 'parcel' ? `${l.zoning.zoneCode} (${l.zoning.zoneName})` : null;
  const sf: Claim['numeric'] = { field: 'footprintSf', value: l.footprintSf };
  const ac: Claim['numeric'] = { field: 'acreage', value: l.acreage };
  const mp: Claim['numeric'] = { field: 'medianPsf', value: psf };
  let c: Claim[] = [];
  if (kind === 'description') c = [
    { text: `${l.address} is a ${int(l.footprintSf)} SF ${T} property`, source: 'foot', detail: `Footprint, PID ${l.pid}`, numeric: sf },
    { text: `on ${l.acreage} acres in ${l.area}.`, source: 'parcel', detail: 'Deeded acreage', numeric: ac },
    ...(zone ? [{ text: `It is zoned ${zone}, which permits ${uses.slice(0, 2).join(' and ').toLowerCase()} uses,`, source: 'zoning' as const, detail: 'Permitted uses from zoning record' }] : []),
    { text: `and sits in FEMA flood zone ${l.floodZone}.`, source: 'fema', detail: `Flood zone ${l.floodZone}` },
    { text: `Recent ${T} sales nearby trade around ${money(psf)} per SF.`, source: 'comps', detail: 'Median of county comps', numeric: mp },
  ];
  if (kind === 'highlights') c = [
    { text: `${int(l.footprintSf)} SF building footprint`, source: 'foot', detail: 'Footprint only', numeric: sf },
    { text: `${l.acreage}-acre lot`, source: 'parcel', detail: 'Deeded acreage', numeric: ac },
    ...(zone ? [{ text: `Zoned ${l.zoning.zoneCode}: ${uses.join(', ').toLowerCase()} permitted`, source: 'zoning' as const, detail: 'Zoning record' }] : []),
    { text: `FEMA flood zone ${l.floodZone}`, source: 'fema', detail: 'Flood zone' },
    { text: `Nearby ${T} comps median ${money(psf)} per SF`, source: 'comps', detail: 'County sales', numeric: mp },
  ];
  if (kind === 'mailer') c = [
    { text: `Now available in ${l.area}: ${l.address}.`, source: 'parcel', detail: 'Address' },
    { text: `${int(l.footprintSf)} SF of ${T} space on ${l.acreage} acres.`, source: 'foot', detail: 'Footprint and acreage', numeric: sf },
    { text: 'Call for pricing and a tour.', source: 'assume', detail: 'Call to action, no factual claim' },
  ];
  if (kind === 'email') c = [
    { text: `New ${T} listing: ${l.address}, ${l.area}.`, source: 'parcel', detail: 'Address and class code' },
    { text: `${int(l.footprintSf)} SF footprint on ${l.acreage} acres.`, source: 'foot', detail: 'Footprint and acreage', numeric: sf },
    { text: `Nearby ${T} sales median ${money(psf)} per SF.`, source: 'comps', detail: 'County sales', numeric: mp },
    { text: 'Reply to request the offering memorandum.', source: 'assume', detail: 'Call to action, no factual claim' },
  ];
  if (plantErrors) {
    c.splice(1, 0, { text: 'just steps from Marion Square,', source: null, detail: 'No source field supports this location claim.' });
    c.push({ text: 'It offers a best-in-class 6.8% cap rate.', source: null, detail: 'No NOI in the record, so no cap rate can be stated.', numeric: { field: 'capRate', value: 6.8 } });
    if (l.simulated[0]) c.push({ text: `${l.simulated[0].text}.`, source: 'sim', detail: 'Simulated signal. Blocked from buyer copy.' });
  }
  return c;
}
