import { Building, Factory, Hotel, Store, UtensilsCrossed, Warehouse } from 'lucide-react';
import type { ClassCode } from '@/types/domain';

const ICON: Record<ClassCode, typeof Building> = { '200': Building, '304': Factory, '500': Store, '530': Store, '580': UtensilsCrossed, '630': Warehouse, '650': Building, '700': Hotel };

/** Photo slot. In the build this becomes a Street View or county aerial image fetched server-side. */
export function Thumb({ classCode, bare }: { classCode: ClassCode; bare?: boolean }) {
  const Icon = ICON[classCode];
  if (bare) return <Icon aria-hidden />;
  return <div className="thumb" aria-hidden><Icon /><span className="lbl">Photo in build</span></div>;
}
