import { codeChecks, type CheckResult, type Claim, type NumericField, type SourceKey } from './checks.ts';
import { GEN_MODEL, JUDGE_MODEL, structured, type Meter, type Model } from './claude.ts';
import type { Record_ } from './facts.ts';
import { HttpError } from './http.ts';

/** Bump when the generation or judge prompt changes. eval_runs and assets record it. */
export const PROMPT_VERSION = 'copy-v1';
export type AssetKind = 'description' | 'highlights' | 'mailer' | 'email';
export const KINDS: AssetKind[] = ['description', 'highlights', 'mailer', 'email'];

const SHAPE: Record<AssetKind, string> = {
  description: 'A listing description of 4 to 6 claims that read as one paragraph when joined with spaces.',
  highlights: 'Listing highlights: 4 to 6 short bullet claims.',
  mailer: 'A postcard mailer: 3 claims, the last a call to action.',
  email: 'An email promo: 4 claims, the last a call to action to request the offering memorandum.',
};

const GEN_SYSTEM = `You write commercial real estate marketing copy for a broker, using only a county property record.

Return claims, not prose. Each claim is one sentence or bullet that states facts from exactly one source section of the record, and cites that section as "source".
- Use only facts present in the record. A section that is null does not exist: do not mention it.
- State numbers exactly as given. When a claim states the footprint, acreage or comps median, set numeric_field to footprintSf, acreage or medianPsf and numeric_value to that exact number, and write the same number in the text (thousands separators allowed). Otherwise numeric_field is "none" and numeric_value is 0.
- Building size is a ground footprint only. Do not call it total or rentable square footage.
- Do not state or imply price, value, cap rate, income, occupancy, condition, renovations, tenants, proximity to landmarks, or anything about the neighborhood's residents.
- No superlatives or guarantees, and nothing that could raise a fair housing concern.
- A call to action cites source "assume" and states no facts.
- "detail" names the record field the claim relies on.`;

const CLAIMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['claims'],
  properties: {
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'source', 'detail', 'numeric_field', 'numeric_value'],
        properties: {
          text: { type: 'string' },
          source: { type: 'string', enum: ['parcel', 'foot', 'fema', 'zoning', 'comps', 'assume'] },
          detail: { type: 'string' },
          numeric_field: { type: 'string', enum: ['none', 'footprintSf', 'acreage', 'medianPsf'] },
          numeric_value: { type: 'number' },
        },
      },
    },
  },
};

type RawClaim = { text: string; source: SourceKey; detail: string; numeric_field: NumericField | 'none'; numeric_value: number };

export async function generateClaims(r: Record_, kind: AssetKind, model: Model = GEN_MODEL, meter?: Meter): Promise<Claim[]> {
  const out = await structured<{ claims: RawClaim[] }>({
    model, meter,
    system: GEN_SYSTEM,
    user: `Format: ${SHAPE[kind]}\n\nRecord (JSON, keyed by source):\n${JSON.stringify(r.record, null, 2)}`,
    schema: CLAIMS_SCHEMA,
  });
  if (!Array.isArray(out?.claims) || !out.claims.length) throw new HttpError(502, 'Model returned no claims');
  return out.claims.map((c) => ({
    text: String(c.text).trim(),
    source: c.source,
    detail: String(c.detail ?? ''),
    ...(c.numeric_field && c.numeric_field !== 'none' ? { numeric: { field: c.numeric_field, value: Number(c.numeric_value) } } : {}),
  }));
}

/** Demo trap claims: an unsourced location claim, an invented cap rate, and a simulated signal. */
export function plantedClaims(simulated: string | null): Claim[] {
  const c: Claim[] = [
    { text: 'just steps from Marion Square,', source: null, detail: 'No source field supports this location claim.' },
    { text: 'It offers a best-in-class 6.8% cap rate.', source: null, detail: 'No NOI in the record, so no cap rate can be stated.', numeric: { field: 'capRate', value: 6.8 } },
  ];
  if (simulated) c.push({ text: `${simulated}.`, source: 'sim', detail: 'Simulated signal. Blocked from buyer copy.' });
  return c;
}

const JUDGE_SYSTEM = `You review commercial real estate marketing copy against the property record it was written from.

For every claim, decide whether it overstates its cited source. A claim overstates when it:
- states a fact that is not in the cited section, or cites a section that is null or missing,
- changes, rounds up or inflates a number,
- implies quality, condition, value, income, demand, location advantages or suitability that the record does not support,
- treats a building footprint as total or rentable area,
- relies on simulated data (source "sim") or has no source.
A call to action citing "assume" that states no facts does not overstate.
Judge each claim on its own. Give a one-sentence reason for every verdict.`;

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'overstates', 'reason'],
        properties: { index: { type: 'integer' }, overstates: { type: 'boolean' }, reason: { type: 'string' } },
      },
    },
  },
};

export interface JudgeVerdict { index: number; overstates: boolean; reason: string }
export interface JudgeResult { result: CheckResult; verdicts: JudgeVerdict[] }

export async function judgeClaims(r: Record_, claims: Claim[], model: Model = JUDGE_MODEL, meter?: Meter): Promise<JudgeResult> {
  const out = await structured<{ verdicts: JudgeVerdict[] }>({
    model, meter,
    system: JUDGE_SYSTEM,
    user: `Record (JSON, keyed by source):\n${JSON.stringify(r.record, null, 2)}\n\nClaims:\n${JSON.stringify(
      claims.map((c, i) => ({ index: i, text: c.text, source: c.source ?? 'none' })), null, 2)}`,
    schema: JUDGE_SCHEMA,
  });
  const byIndex = new Map((out?.verdicts ?? []).map((v) => [v.index, v]));
  // A claim the judge skipped counts as overstated: missing verdicts must not pass.
  const verdicts = claims.map((_, i) => byIndex.get(i) ?? { index: i, overstates: true, reason: 'No verdict returned for this claim.' });
  const flagged = verdicts.filter((v) => v.overstates).length;
  return {
    verdicts,
    result: {
      name: 'LLM judge: overstating', kind: 'llm', pass: flagged === 0,
      detail: flagged ? `${flagged} claim${flagged > 1 ? 's' : ''} judged to overstate the source` : 'Each claim fairly reflects its source',
    },
  };
}

export { codeChecks };
