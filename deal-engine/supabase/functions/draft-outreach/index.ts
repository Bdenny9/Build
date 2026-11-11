// draft-outreach: a short first-touch note to the owner, written only from the lead record.
// No simulated signals and no owner contact data reach the prompt. Every number in the draft must
// come from the record; one retry with feedback, then the draft is returned with the failed check.
// Cached per user and PID. Request { pid, regenerate? } -> { text, check }
import { admin, rateLimit, requireUser } from '../_shared/auth.ts';
import { structured } from '../_shared/claude.ts';
import { loadRecord } from '../_shared/facts.ts';
import { handle, HttpError } from '../_shared/http.ts';

const PROMPT_VERSION = 'outreach-v1';

const SYSTEM = `You draft a first-touch note from a commercial real estate broker to a property owner.
- Under 110 words, plain and specific, no subject line, no signature block.
- Use only the facts provided. Do not invent numbers: every number you write must appear in the facts.
- Do not claim to know anything about the owner's loan, tenants, finances or plans. You may say financing terms on long holds often come up for review, without asserting theirs has.
- Offer a short call to compare options (sale, 1031 exchange, refinance). No pressure, no superlatives.`;

const numbersIn = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));

Deno.serve(handle(async (req, body) => {
  const userId = await requireUser(req);
  const pid = String(body.pid ?? '');
  const db = admin();

  const { data: served } = await db.from('served_leads').select('pid').eq('user_id', userId).eq('pid', pid).maybeSingle();
  if (!served) throw new HttpError(403, 'This lead was not served to you');

  if (!body.regenerate) {
    const { data: cached } = await db.from('outreach_drafts').select('body, checks').eq('user_id', userId).eq('pid', pid)
      .eq('prompt_version', PROMPT_VERSION).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cached) return { text: cached.body, check: cached.checks };
  }
  await rateLimit(db, userId, 'draft-outreach', 30);

  const r = await loadRecord(db, pid);
  const l = r.lead;
  const facts = {
    owner: l.owner1, property: `${l.address}, ${l.area}`, property_type: r.record.parcel?.property_type,
    footprint_sf: Number(l.footprint_sf), acquired_year: Number(l.sale_date.slice(0, 4)), years_held: Math.floor(r.holdYears),
    nearby_median_price_per_footprint_sf: r.numeric.medianPsf ?? null, nearby_sales_count: r.compsCount,
  };
  const allowed = new Set(numbersIn(JSON.stringify(facts)).concat(['1031']));
  // A call length such as "15-minute" is allowed; it is not a factual claim.
  ['10', '15', '20', '30'].forEach((n) => allowed.add(n));

  let text = '', bad: string[] = [], feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await structured<{ text: string }>({
      system: SYSTEM,
      user: `Facts (JSON):\n${JSON.stringify(facts, null, 2)}${feedback}`,
      schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
      effort: 'low',
    });
    text = String(out?.text ?? '').trim();
    bad = numbersIn(text).filter((n) => !allowed.has(n));
    if (!bad.length) break;
    feedback = `\n\nYour last draft used numbers not in the facts: ${bad.join(', ')}. Remove them.`;
  }
  const check = { name: 'Numbers from the record', kind: 'code', pass: !bad.length, detail: bad.length ? `Not in the record: ${bad.join(', ')}` : 'Every number comes from the lead record' };
  await db.from('outreach_drafts').insert({ user_id: userId, pid, body: text, prompt_version: PROMPT_VERSION, checks: check });
  return { text, check };
}));
