import { ASSUMPTIONS, TYPES } from '@/lib/calc/constants';
import { BANNED, allPass, codeChecks } from '@/lib/calc/evals';
import { estimateValue } from '@/lib/calc/value';
import { money } from '@/lib/calc/format';
import type { Activity, Asset, Deal, EvalRun, JudgeResult, Lead, LeadStatus } from '@/types/domain';
import { LEADS, TREASURY_10Y, sampleComps } from './fixtures';
import { templateClaims } from './copy';
import type { DataProvider } from './provider';

const KEY = 'deal-engine-mock-v1';
interface Store { served: string[]; status: Record<string, LeadStatus>; activities: Activity[]; listings: string[]; assets: (Asset & { plant?: boolean })[]; deals: Deal[] }
const empty = (): Store => ({
  served: [], status: {}, activities: [], listings: [], assets: [],
  deals: [
    { id: 'd1', pid: 'x1', address: '42 Cannon St', typeLabel: 'Office', price: 1320000, closeDate: '2026-08-14', netToBroker: 46200 },
    { id: 'd2', pid: 'x2', address: '2900 Ashley Phosphate Rd', typeLabel: 'Warehouse', price: 2650000, closeDate: '2026-06-30', netToBroker: 92750 },
  ],
});
function load(): Store { if (typeof window === 'undefined') return empty(); try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty(); } }
function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } }
const id = () => Math.random().toString(36).slice(2, 10);
const withStatus = (s: Store, l: Lead): Lead => ({ ...l, status: s.status[l.pid] ?? 'New' });

export const mockProvider: DataProvider = {
  async serveLeads(count) {
    const s = load();
    const next = LEADS.filter((l) => !s.served.includes(l.pid)).slice(0, count);
    s.served.push(...next.map((l) => l.pid)); save(s);
    return { leads: next.map((l) => withStatus(s, l)), remaining: LEADS.length - s.served.length };
  },
  async listServedLeads() { const s = load(); return s.served.map((p) => LEADS.find((l) => l.pid === p)!).filter(Boolean).map((l) => withStatus(s, l)); },
  async getLead(pid) { const s = load(); const l = LEADS.find((x) => x.pid === pid); return l ? withStatus(s, l) : null; },
  async getComps(pid) { const l = LEADS.find((x) => x.pid === pid); return l ? sampleComps(l) : []; },
  async getTreasuryPct(saleDate) { return TREASURY_10Y[Number(saleDate.slice(0, 4))] ?? ASSUMPTIONS.today10y; },
  async setStatus(pid, status) { const s = load(); s.status[pid] = status; save(s); },

  async listActivities(pid) { return load().activities.filter((a) => a.pid === pid); },
  async addActivity(pid, kind, text) { const s = load(); const a: Activity = { id: id(), pid, kind, text, createdAt: new Date().toISOString() }; s.activities.unshift(a); save(s); return a; },
  async draftOutreach(pid) {
    const l = LEADS.find((x) => x.pid === pid)!;
    const v = estimateValue(l.footprintSf, sampleComps(l));
    return { text: `Hi, I’m reaching out about ${l.address}. You’ve held it since ${l.saleDate.slice(0, 4)}, and nearby sales of similar properties are trading around ${money(v.medianPsf)} per square foot. If the financing is coming up for renewal, it may be worth comparing a refinance against a sale or 1031 exchange. Would a 15-minute call next week be useful?` };
  },

  async createListing(pid) { const s = load(); if (!s.listings.includes(pid)) s.listings.push(pid); s.status[pid] = 'Listing won'; save(s); },
  async listListings() { return [...load().listings].reverse(); },
  async generateAsset(pid, kind, opts) {
    const l = LEADS.find((x) => x.pid === pid)!;
    const v = estimateValue(l.footprintSf, sampleComps(l));
    const s = load();
    const plant = !!opts?.plantErrors;
    const cached = !opts?.regenerate && [...s.assets].reverse().find((a) => a.pid === pid && a.kind === kind && !!a.plant === plant);
    if (cached) return cached;
    const claims = templateClaims(l, v.medianPsf, kind, plant);
    const facts = { footprintSf: l.footprintSf, acreage: l.acreage, medianPsf: Math.round(v.medianPsf) };
    const asset = { id: id(), pid, kind, claims, promptVersion: 'mock-template', approvedAt: null, codeChecks: codeChecks(claims, facts), judge: null, plant };
    s.assets.push(asset); save(s); return asset;
  },
  async listAssets(pid) { return load().assets.filter((a) => a.pid === pid && !a.plant).reverse(); },
  async judgeAsset(asset) {
    // Stand-in for the judge-copy function: flags unsourced, simulated and overstating sentences.
    const verdicts = asset.claims.map((c, index) => {
      const over = !c.source || c.source === 'sim' || BANNED.test(c.text) || /steps from/i.test(c.text);
      return { index, overstates: over, reason: over ? 'Not supported by the cited source.' : 'Matches the cited source.' };
    });
    const flagged = verdicts.filter((v) => v.overstates).length;
    const judge: JudgeResult = { verdicts, result: { name: 'LLM judge: overstating', kind: 'llm', pass: !flagged, detail: flagged ? `${flagged} claim${flagged > 1 ? 's' : ''} judged to overstate the source` : 'Each claim fairly reflects its source' } };
    const s = load(); const a = s.assets.find((x) => x.id === asset.id); if (a) a.judge = judge; save(s);
    return judge;
  },
  async approveAsset(assetId) {
    const s = load(); const a = s.assets.find((x) => x.id === assetId);
    if (!a) throw new Error('No such asset');
    if (!allPass(a.codeChecks ?? [])) throw new Error('Blocked: a code check failed');
    if (!a.judge?.result.pass) throw new Error('Blocked: the judge has not passed this copy');
    a.approvedAt ??= new Date().toISOString(); save(s); return a.approvedAt;
  },

  async listEvalRuns() { return [SAMPLE_RUN]; },
  async getEvalRun(runId) { return runId === SAMPLE_RUN.id ? SAMPLE_RUN : null; },

  async markSold(input) {
    const s = load(); const l = LEADS.find((x) => x.pid === input.pid)!;
    const d: Deal = { id: id(), pid: input.pid, address: l.address, typeLabel: TYPES[l.classCode].label, price: input.price, closeDate: input.closeDate, netToBroker: input.netToBroker };
    s.deals.unshift(d); s.status[input.pid] = 'Sold'; save(s); return d;
  },
  async listDeals() { return load().deals; },
};

/** Mock mode has no eval history. This sample is labeled as such in the UI. */
const SAMPLE_RUN: EvalRun = {
  id: 'sample', promptVersion: 'sample', model: 'mock', genModel: 'mock', judgeModel: 'mock', runAt: '2026-11-11T00:00:00Z', cases: 18,
  metrics: { grounded_pct: 100, numbers_pct: 100, clean_pass_pct: 100, blocked_pct: 100, judge_recall_pct: 100, judge_false_flag_pct: 0, banned_hits: 0, failed_cases: 0 },
  results: [],
};
