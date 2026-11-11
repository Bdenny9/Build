import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allPass, codeChecks, type Claim } from '../../supabase/functions/_shared/checks.ts';

const facts = { footprintSf: 9800, acreage: 1.1, medianPsf: 210 };
const clean: Claim[] = [
  { text: '1830 Savannah Hwy is a 9,800 SF retail property', source: 'foot', detail: 'Footprint', numeric: { field: 'footprintSf', value: 9800 } },
  { text: 'on 1.1 acres in West Ashley.', source: 'parcel', detail: 'Acreage', numeric: { field: 'acreage', value: 1.1 } },
  { text: 'Nearby retail sales trade around $210 per SF.', source: 'comps', detail: 'Median', numeric: { field: 'medianPsf', value: 210 } },
  { text: 'Call for a tour.', source: 'assume', detail: 'Call to action' },
];
const byName = (c: ReturnType<typeof codeChecks>) => Object.fromEntries(c.map((x) => [x.name, x.pass]));

test('clean copy passes every code check', () => {
  assert.ok(allPass(codeChecks(clean, facts)));
});
test('unsourced, simulated and banned claims fail their checks', () => {
  const r = byName(codeChecks([...clean,
    { text: 'just steps from Marion Square,', source: null, detail: '' },
    { text: 'Anchor tenant lease ends 2027.', source: 'sim', detail: '' },
    { text: 'A best-in-class location.', source: 'parcel', detail: '' },
  ], facts));
  assert.equal(r['Groundedness'], false);
  assert.equal(r['Simulated data guard'], false);
  assert.equal(r['Banned language'], false);
});
test('a figure must equal the recomputed value and appear in the sentence', () => {
  assert.equal(byName(codeChecks([{ ...clean[0], numeric: { field: 'footprintSf', value: 9900 } }], facts))['Number match'], false);
  assert.equal(byName(codeChecks([{ ...clean[0], text: 'A 10,000 SF retail property' }], facts))['Number match'], false);
  assert.equal(byName(codeChecks([{ text: 'A 6.8% cap rate.', source: 'comps', detail: '', numeric: { field: 'capRate', value: 6.8 } }], facts))['Number match'], false);
});
test('no claims never passes', () => {
  assert.equal(allPass(codeChecks([], facts)), false);
});
