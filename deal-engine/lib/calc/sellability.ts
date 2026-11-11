import { SOURCES } from './constants';
import { monthsBetween, parseDay } from './dates';
import type { LoanEstimate } from './loan';
import type { ValueEstimate } from './value';
import type { Lead } from '@/types/domain';

export interface Rule { on: boolean; points: number; text: string; source: string; simulated?: boolean }
export interface Sellability { holdYears: number; equity: number; equityPct: number; rules: Rule[]; score: number; level: 'Strong opportunity' | 'Moderate opportunity' | 'Watch list' }

export const isAbsentee = (l: Pick<Lead, 'mailState'>) => l.mailState.toUpperCase() !== 'SC';

/** Transparent rules, not a trained model. Every rule names its source. */
export function scoreLead(lead: Lead, loan: LoanEstimate, value: ValueEstimate, asOf: string): Sellability {
  const holdYears = monthsBetween(parseDay(lead.saleDate), parseDay(asOf)) / 12;
  const equity = value.value - loan.balance;
  const equityPct = (equity / value.value) * 100;
  const m = loan.monthsToMaturity;
  const rules: Rule[] = [
    { on: holdYears >= 7, points: 2, text: `Held ${holdYears.toFixed(1)} years`, source: SOURCES.parcel },
    { on: isAbsentee(lead), points: 1, text: `Absentee owner (mailing address in ${lead.mailCity}, ${lead.mailState})`, source: SOURCES.parcel },
    { on: Math.abs(m) <= 18, points: 2, text: m >= 0 ? `Estimated loan maturity in ${m} months` : `Estimated loan matured ${-m} months ago`, source: SOURCES.calc },
    { on: equityPct >= 40, points: 2, text: `Estimated equity ${equityPct.toFixed(0)}% of value`, source: SOURCES.calc },
    { on: loan.refiRatePct - loan.ratePct >= 1.5, points: 1, text: `Refinancing would cost ${(loan.refiRatePct - loan.ratePct).toFixed(2)} pts more`, source: SOURCES.calc },
    { on: lead.footprintChangePct !== 0, points: 1, text: `Footprint changed ${lead.footprintChangePct > 0 ? '+' : ''}${lead.footprintChangePct}% since last survey`, source: SOURCES.foot },
    ...lead.simulated.map((s) => ({ on: true, points: 1, text: s.text, source: SOURCES.sim, simulated: true })),
  ];
  const score = rules.filter((r) => r.on).reduce((a, r) => a + r.points, 0);
  const level = score >= 7 ? 'Strong opportunity' : score >= 4 ? 'Moderate opportunity' : 'Watch list';
  return { holdYears, equity, equityPct, rules, score, level };
}
