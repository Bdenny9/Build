import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceAfter, median, payment } from './amortize.ts';
import { computePayout } from './payout.ts';

test('payment matches standard amortization', () => {
  assert.equal(Math.round(payment(100_000, 6, 360)), 600);
});
test('balance is principal at k=0 and ~0 at maturity', () => {
  assert.equal(Math.round(balanceAfter(100_000, 6, 360, 0)), 100_000);
  assert.ok(Math.abs(balanceAfter(100_000, 6, 360, 360)) < 1);
});
test('payout waterfall', () => {
  const p = computePayout({ price: 2_000_000, commissionPct: 5, brokerSplitPct: 70, coBroker: true });
  assert.equal(p.gross, 100_000); assert.equal(p.listingSide, 50_000); assert.equal(p.netToBroker, 35_000);
});
test('median', () => { assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); });
