import type { CheckResult, Claim } from '@/types/domain';

export const BANNED = /\b(best[- ]in[- ]class|guaranteed|can[’']?t miss|once in a lifetime|perfect for families|exclusive neighborhood)\b/i;

export type Facts = Partial<Record<NonNullable<Claim['numeric']>['field'], number>>;

/**
 * Code checks. These run first and cannot be overruled by the LLM judge.
 * The judge result is appended by the caller from the judge-copy edge function.
 */
export function codeChecks(claims: Claim[], facts: Facts): CheckResult[] {
  const total = claims.length;
  const grounded = claims.filter((c) => c.source && c.source !== 'sim').length;
  const numeric = claims.filter((c) => c.numeric);
  const numOk = numeric.filter((c) => facts[c.numeric!.field] !== undefined && facts[c.numeric!.field] === c.numeric!.value).length;
  const banned = claims.map((c) => c.text).join(' ').match(BANNED);
  const simUsed = claims.filter((c) => c.source === 'sim').length;
  return [
    { name: 'Groundedness', kind: 'code', pass: grounded === total, ratio: total ? grounded / total : 1, detail: `${grounded} of ${total} claims map to a source field` },
    { name: 'Number match', kind: 'code', pass: numOk === numeric.length, ratio: numeric.length ? numOk / numeric.length : 1, detail: `${numOk} of ${numeric.length} figures match values recomputed in code` },
    { name: 'Banned language', kind: 'code', pass: !banned, detail: banned ? `Found “${banned[0]}”` : 'No superlatives, guarantees or fair housing flags' },
    { name: 'Simulated data guard', kind: 'code', pass: simUsed === 0, detail: simUsed ? `${simUsed} simulated signal used in buyer copy` : 'No simulated signals in buyer copy' },
  ];
}

export const allPass = (checks: CheckResult[]) => checks.every((c) => c.pass);
