import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { HttpError } from './http.ts';

export const MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;
function anthropic() {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new HttpError(503, 'ANTHROPIC_API_KEY secret is not set');
  return (client ??= new Anthropic({ apiKey }));
}

/**
 * One structured call: JSON constrained to `schema`, adaptive thinking (always on for this model),
 * server-side refusal fallback on. Returns the parsed object; callers validate the shape.
 */
export async function structured<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort?: 'low' | 'medium' | 'high';
}): Promise<T> {
  let res;
  try {
    res = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: { effort: opts.effort ?? 'medium', format: { type: 'json_schema', schema: opts.schema } },
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(429, 'Model is rate limited. Try again shortly.');
    if (e instanceof Anthropic.APIError) { console.error(`anthropic ${e.status}: ${e.message}`); throw new HttpError(502, `Model call failed (${e.status})`); }
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new HttpError(422, `Model declined (${res.stop_details?.category ?? 'unspecified'})`);
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'Model output was cut off');
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  try { return JSON.parse(text) as T; } catch { throw new HttpError(502, 'Model returned invalid JSON'); }
}
