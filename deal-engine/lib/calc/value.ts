import { ASSUMPTIONS } from './constants';
import { median } from './amortize';

export { median };
import type { Comp } from '@/types/domain';

export interface ValueEstimate { usableComps: Comp[]; medianPsf: number; value: number; thin: boolean }

/** Comp median price per footprint SF times the subject footprint. Drops non-market transfers. */
export function estimateValue(footprintSf: number, comps: Comp[]): ValueEstimate {
  const usableComps = comps.filter((c) => c.salePrice >= ASSUMPTIONS.nominalSaleFloor && c.footprintSf > 0);
  const medianPsf = median(usableComps.map((c) => c.salePrice / c.footprintSf));
  return { usableComps, medianPsf, value: medianPsf * footprintSf, thin: usableComps.length < 3 };
}
