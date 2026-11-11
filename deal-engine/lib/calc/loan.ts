import { ASSUMPTIONS, TYPES } from './constants';
import { addMonths, monthsBetween, parseDay } from './dates';
import { balanceAfter, payment } from './amortize';

export { balanceAfter, payment };
import type { ClassCode } from '@/types/domain';

export interface LoanEstimate {
  treasuryPct: number;
  spreadPts: number;
  ratePct: number;
  principal: number;
  payment: number;
  paymentsMade: number;
  balance: number;
  maturity: Date;
  monthsToMaturity: number; // negative = already matured
  refiRatePct: number;
}

/**
 * Estimated original loan: 10-year Treasury in the sale month plus a spread by type.
 * `treasuryPct` comes from the rates_10y table (FRED), never from the model.
 */
export function estimateLoan(input: { salePrice: number; saleDate: string; classCode: ClassCode; treasuryPct: number; asOf: string }): LoanEstimate {
  const { ltv, amortMonths, termMonths, today10y } = ASSUMPTIONS;
  const spreadPts = TYPES[input.classCode].spreadPts;
  const ratePct = input.treasuryPct + spreadPts;
  const principal = input.salePrice * ltv;
  const sale = parseDay(input.saleDate);
  const asOf = parseDay(input.asOf);
  const paymentsMade = Math.min(Math.max(monthsBetween(sale, asOf), 0), amortMonths);
  const maturity = addMonths(sale, termMonths);
  return {
    treasuryPct: input.treasuryPct,
    spreadPts,
    ratePct,
    principal,
    payment: payment(principal, ratePct, amortMonths),
    paymentsMade,
    balance: balanceAfter(principal, ratePct, amortMonths, paymentsMade),
    maturity,
    monthsToMaturity: monthsBetween(asOf, maturity),
    refiRatePct: today10y + spreadPts,
  };
}
