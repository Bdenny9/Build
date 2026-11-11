'use client';
import { AS_OF } from '@/lib/calc/constants';
import { estimateLoan } from '@/lib/calc/loan';
import { scoreLead } from '@/lib/calc/sellability';
import { estimateValue } from '@/lib/calc/value';
import { data } from '@/lib/data';
import type { Lead } from '@/types/domain';
import { useAsync } from './useAsync';

/** Fetches comps and the sale-month Treasury rate, then runs every deterministic calc in one place. */
export function useAnalysis(lead: Lead | null) {
  return useAsync(async () => {
    if (!lead) return null;
    const [comps, treasuryPct] = await Promise.all([data.getComps(lead.pid), data.getTreasuryPct(lead.saleDate)]);
    const loan = estimateLoan({ salePrice: lead.salePrice, saleDate: lead.saleDate, classCode: lead.classCode, treasuryPct, asOf: AS_OF });
    const value = estimateValue(lead.footprintSf, comps);
    const score = scoreLead(lead, loan, value, AS_OF);
    return { loan, value, score };
  }, [lead?.pid]);
}
export type Analysis = NonNullable<ReturnType<typeof useAnalysis>['data']>;
