// Next-step recommender: a deterministic rule engine, not a model.
// Why rules: the inputs are structured (status, dates, score), the right answer is a policy the brokerage
// owns, and the output must be identical every time and explainable line by line. A model would add
// variance and cost with no upside. Rules are ordered; the first that matches wins.
// Pure: no imports from the app, so `node --test` runs it directly.

export type Status = 'New' | 'Contacted' | 'Conversation' | 'Meeting' | 'Listing pitch' | 'Listing won' | 'Sold';
export type ActKind = 'Call' | 'Email' | 'Note' | 'Status';

export interface NextStepInput {
  status: Status;
  scoreLevel: 'Strong opportunity' | 'Moderate opportunity' | 'Watch list';
  monthsToMaturity: number;          // estimated loan maturity, negative = already matured
  activities: { kind: ActKind; createdAt: string }[]; // any order
  now: string;                        // ISO timestamp
  followUpDays: number;
}

export interface NextStep {
  rule: string;                       // stable id, for tests and analytics
  title: string;
  /** What confirming will write. Null means there is nothing to log (wait, or go elsewhere). */
  log: { kind: ActKind; text: string; status?: Status } | null;
  due: string;                        // YYYY-MM-DD
  overdue: boolean;
  reasons: string[];
}

const DAY = 864e5;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

export function nextStep(i: NextStepInput): NextStep {
  const now = Date.parse(i.now);
  const touches = i.activities.filter((a) => a.kind !== 'Status').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const last = touches[0];
  const sinceLast = last ? Math.floor((now - Date.parse(last.createdAt)) / DAY) : null;
  const maturityNear = Math.abs(i.monthsToMaturity) <= 6;
  const timing = maturityNear ? [i.monthsToMaturity >= 0 ? `Estimated loan maturity in ${i.monthsToMaturity} months` : `Estimated loan matured ${-i.monthsToMaturity} months ago`] : [];
  const step = (rule: string, title: string, log: NextStep['log'], dueInDays: number, reasons: string[], overdue = false): NextStep =>
    ({ rule, title, log, due: day(now + dueInDays * DAY), overdue, reasons });

  if (i.status === 'Sold') return step('closed', 'Closed. Nothing to do.', null, 0, ['Deal is marked sold']);
  if (i.status === 'Listing won') return step('market', 'Open the listing and approve marketing copy', null, 0, ['Listing won; copy must pass checks before it is published']);
  if (i.status === 'Meeting' || i.status === 'Listing pitch')
    return step('pitch', 'Prepare the listing pitch: comps, equity estimate, timing', { kind: 'Note', text: 'Prepared listing pitch materials' }, 2, [`Status is ${i.status}`, ...timing]);
  if (i.status === 'Conversation')
    return step('meet', 'Propose a meeting', { kind: 'Call', text: 'Called to schedule a meeting', status: 'Meeting' }, 3, ['Owner is in conversation', ...timing]);

  if (!last) {
    if (i.scoreLevel === 'Strong opportunity' || maturityNear)
      return step('first-call', 'Call the owner today', { kind: 'Call', text: 'First call to owner' }, 0, [i.scoreLevel, ...timing]);
    if (i.scoreLevel === 'Moderate opportunity')
      return step('first-email', 'Send the approved outreach email', { kind: 'Email', text: 'Sent first outreach email' }, 0, [i.scoreLevel]);
    return step('watch', 'Add to watch list and revisit in 90 days', { kind: 'Note', text: 'Watch list: revisit in 90 days' }, 90, [i.scoreLevel, 'No strong signals yet']);
  }

  if (sinceLast! >= i.followUpDays) {
    const other: ActKind = last.kind === 'Call' ? 'Email' : 'Call';
    return step('follow-up', `Follow up by ${other.toLowerCase()}: no reply in ${sinceLast} days`, { kind: other, text: `Follow-up ${other.toLowerCase()} after ${sinceLast} days without reply` }, 0,
      [`Last touch was a ${last.kind.toLowerCase()} ${sinceLast} days ago`, `Follow-up rule: ${i.followUpDays} days`, ...timing], sinceLast! > i.followUpDays);
  }
  return step('wait', `Wait. Next touch on ${day(Date.parse(last.createdAt) + i.followUpDays * DAY)}`, null, i.followUpDays - sinceLast!,
    [`Last touch was a ${last.kind.toLowerCase()} ${sinceLast} days ago`, `Follow-up rule: ${i.followUpDays} days`]);
}
