// Pure math, no imports, so `npm test` runs it with plain Node.

/** Monthly payment on a fully amortizing loan. */
export function payment(principal: number, annualPct: number, months: number) {
  const r = annualPct / 100 / 12;
  return r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** Remaining balance after k payments. */
export function balanceAfter(principal: number, annualPct: number, months: number, k: number) {
  const r = annualPct / 100 / 12;
  const pmt = payment(principal, annualPct, months);
  if (r === 0) return principal - pmt * k;
  return principal * Math.pow(1 + r, k) - (pmt * (Math.pow(1 + r, k) - 1)) / r;
}

export function median(values: number[]) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
