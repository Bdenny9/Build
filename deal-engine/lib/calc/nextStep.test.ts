import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, type NextStepInput } from './nextStep.ts';

const base: NextStepInput = { status: 'New', scoreLevel: 'Moderate opportunity', monthsToMaturity: 40, activities: [], now: '2026-11-11T12:00:00Z', followUpDays: 7 };
const ago = (d: number) => new Date(Date.parse(base.now) - d * 864e5).toISOString();

test('same input, same answer', () => {
  assert.deepEqual(nextStep(base), nextStep({ ...base }));
});
test('untouched strong lead or near maturity: call today', () => {
  assert.equal(nextStep({ ...base, scoreLevel: 'Strong opportunity' }).rule, 'first-call');
  assert.equal(nextStep({ ...base, monthsToMaturity: -3 }).rule, 'first-call');
});
test('untouched moderate lead: email; watch list: revisit in 90 days', () => {
  assert.equal(nextStep(base).rule, 'first-email');
  const w = nextStep({ ...base, scoreLevel: 'Watch list' });
  assert.equal(w.rule, 'watch'); assert.equal(w.due, '2027-02-09');
});
test('follow-up switches channel and flags overdue', () => {
  const s = nextStep({ ...base, status: 'Contacted', activities: [{ kind: 'Email', createdAt: ago(10) }] });
  assert.equal(s.rule, 'follow-up'); assert.equal(s.log?.kind, 'Call'); assert.equal(s.overdue, true);
});
test('inside the follow-up window: wait, nothing to log', () => {
  const s = nextStep({ ...base, status: 'Contacted', activities: [{ kind: 'Call', createdAt: ago(2) }] });
  assert.equal(s.rule, 'wait'); assert.equal(s.log, null);
});
test('status changes are not touches', () => {
  assert.equal(nextStep({ ...base, activities: [{ kind: 'Status', createdAt: ago(30) }] }).rule, 'first-email');
});
test('later stages', () => {
  assert.equal(nextStep({ ...base, status: 'Conversation' }).log?.status, 'Meeting');
  assert.equal(nextStep({ ...base, status: 'Listing won' }).log, null);
  assert.equal(nextStep({ ...base, status: 'Sold' }).rule, 'closed');
});
