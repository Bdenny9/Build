import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { HttpError } from './http.ts';

/** Models allowed for copy generation and judging. Production picks come from function secrets. */
export const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const;
export type Model = (typeof MODELS)[number];
const pick = (v: string | undefined): Model => (MODELS as readonly string[]).includes(v ?? '') ? (v as Model) : 'claude-opus-5-5';
export const GEN_MODEL: Model = pick(Deno.env.get('GEN_MODEL'));
export const JUDGE_MODEL: Model = pick(Deno.env.get('JUDGE_MODEL'));
export const isModel = (v: unknown): v is Model => (MODELS as readonly unknown[]).includes(v);

/** USD per million tokens (input, output). Haiku's rate is for prompts under 100K tokens, which these always are. */
const PRICE: Record<Model, [number, number]> = {
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
};
/** Server-side refusal fallback is available on Opus 5.5 and Sonnet 5.5, not on Haiku 5.5. */
const HAS_FALLBACK: Record<Model, boolean> = { 'claude-opus-5-5': true, 'claude-sonnet-5-5': true, 'claude-haiku-5-5': false };

/** Accumulates tokens, cost and wall time across calls, for eval cost comparisons. */
export interface Meter { input: number; output: number; usd: number; ms: number; calls: number }
export const newMeter = (): Meter => ({ input: 0, output: 0, usd: 0, ms: 0, calls: 0 });

let client: Anthropic | null = null;
function anthropic() {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new HttpError(503, 'ANTHROPIC_API_KEY secret is not set');
  return (client ??= new Anthropic({ apiKey }));
}

/**
 * One structured call: JSON constrained to `schema`, adaptive thinking (on by default for these models),
 * refusal fallback where the model supports it. Returns the parsed object; callers validate the shape.
 */
export async function structured<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  model?: Model;
  effort?: 'low' | 'medium' | 'high';
  meter?: Meter;
}): Promise<T> {
  // Kill switch for non-deterministic failures: set the AI_PAUSED secret to "true" to stop every model call
  // at once without a deploy. Rule-based features and already-approved copy keep working.
  if (Deno.env.get('AI_PAUSED') === 'true') throw new HttpError(503, 'AI drafting is paused by the operator. Approved copy and all rule-based features still work.');
  const model = opts.model ?? GEN_MODEL;
  const started = Date.now();
  let res;
  try {
    res = await anthropic().beta.messages.create({
      model,
      max_tokens: 16000,
      ...(HAS_FALLBACK[model] ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: { effort: opts.effort ?? 'medium', format: { type: 'json_schema', schema: opts.schema } },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Model is rate limited. Try again shortly.');
    if (e instanceof Anthropic.APIError) { console.error(`anthropic ${model} ${e.status}: ${e.message}`); throw new HttpError(502, `Model call failed (${e.status})`); }
    throw e;
  }
  if (opts.meter) {
    const [pin, pout] = PRICE[model];
    const input = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    opts.meter.input += input;
    opts.meter.output += res.usage.output_tokens;
    opts.meter.usd += (input * pin + res.usage.output_tokens * pout) / 1e6;
    opts.meter.ms += Date.now() - started;
    opts.meter.calls += 1;
  }
  if (res.stop_reason === 'refusal') throw new HttpError(422, `Model declined (${res.stop_details?.category ?? 'unspecified'})`);
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'Model output was cut off');
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try { return JSON.parse(text) as T; } catch { throw new HttpError(502, 'Model returned invalid JSON'); }
}
