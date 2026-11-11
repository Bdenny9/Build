// Code checks for generated copy. Single source of truth:
// imported by the Next app (lib/calc/evals.ts) for display and by the edge functions for enforcement.
// Pure TypeScript, no imports, so it runs in the browser, in Deno and under `node --test`.

export type SourceKey = 'parcel' | 'foot' | 'fema' | 'zoning' | 'fred' | 'comps' | 'assume' | 'calc' | 'sim';
export type NumericField = 'footprintSf' | 'acreage' | 'medianPsf' | 'capRate';

/** One sentence or bullet of generated copy. The model must return claims, never free text. */
export interface Claim {
  text: string;
  source: SourceKey | null;
  detail: string;
  /** Present when the claim states a number that code can recompute. */
  numeric?: { field: NumericField; value: number };
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  ratio?: number;
  kind: 'code' | 'llm';
}

export type Facts = Partial<Record<NumericField, number>>;

export const BANNED = /\b(best[- ]in[- ]class|guaranteed|can[’']?t miss|once in a lifetime|perfect for families|exclusive neighborhood)\b/i;

/** Sources a buyer-facing claim may cite. 'sim' (mock signals) and 'calc' (our estimates) may not. */
const BUYER_SOURCES: SourceKey[] = ['parcel', 'foot', 'fema', 'zoning', 'comps', 'assume'];

/** The text must show the same number the claim declares, with or without thousands separators. */
const textShows = (text: string, v: number) => [v.toLocaleString('en-US'), String(v)].some((s) => text.includes(s));

/**
 * Code checks. These run first and cannot be overruled by the LLM judge.
 * A number matches only if it equals the value recomputed in code AND the sentence states that value.
 */
export function codeChecks(claims: Claim[], facts: Facts): CheckResult[] {
  const total = claims.length;
  const grounded = claims.filter((c) => c.source && BUYER_SOURCES.includes(c.source)).length;
  const numeric = claims.filter((c) => c.numeric);
  const numOk = numeric.filter((c) => {
    const want = facts[c.numeric!.field];
    return want !== undefined && want === c.numeric!.value && textShows(c.text, c.numeric!.value);
  }).length;
  const banned = claims.map((c) => c.text).join(' ').match(BANNED);
  const simUsed = claims.filter((c) => c.source === 'sim').length;
  return [
    { name: 'Groundedness', kind: 'code', pass: total > 0 && grounded === total, ratio: total ? grounded / total : 0, detail: `${grounded} of ${total} claims map to a source field` },
    { name: 'Number match', kind: 'code', pass: numOk === numeric.length, ratio: numeric.length ? numOk / numeric.length : 1, detail: `${numOk} of ${numeric.length} figures match values recomputed in code` },
    { name: 'Banned language', kind: 'code', pass: !banned, detail: banned ? `Found “${banned[0]}”` : 'No superlatives, guarantees or fair housing flags' },
    { name: 'Simulated data guard', kind: 'code', pass: simUsed === 0, detail: simUsed ? `${simUsed} simulated signal used in buyer copy` : 'No simulated signals in buyer copy' },
  ];
}

export const allPass = (checks: CheckResult[]) => checks.length > 0 && checks.every((c) => c.pass);
