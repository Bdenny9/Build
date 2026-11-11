import { ASSUMPTIONS, TYPES } from '@/lib/calc/constants';
import { BANNED } from '@/lib/calc/evals';
import { estimateValue } from '@/lib/calc/value';
import { money } from '@/lib/calc/format';
import type { Activity, Asset, Deal, Lead, LeadStatus } from '@/types/domain';
import { LEADS, TREASURY_10Y, sampleComps } from './fixtures';
import { templateClaims } from './copy';
import type { DataProvider } from './provider';

const KEY = 'deal-engine-mock-v1';
interface Store { served: string[]; status: Record<string, LeadStatus>; activities: Activity[]; listings: string[]; assets: Asset[]; deals: Deal[] }
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
    const asset: Asset = { id: id(), pid, kind, claims: templateClaims(l, v.medianPsf, kind, opts?.plantErrors), promptVersion: 'v2-mock', approvedAt: null };
    s.assets.push(asset); save(s); return asset;
  },
  async judgeAsset(claims) {
    const flagged = claims.filter((c) => BANNED.test(c.text) || /steps from/i.test(c.text)).length;
    return { name: 'LLM judge: overstating', kind: 'llm', pass: flagged === 0, detail: flagged ? `${flagged} sentence${flagged > 1 ? 's' : ''} judged to overstate the source` : 'Each sentence fairly reflects its source' };
  },
  async approveAsset(assetId) { const s = load(); const a = s.assets.find((x) => x.id === assetId); if (a) a.approvedAt = new Date().toISOString(); save(s); },

  async markSold(input) {
    const s = load(); const l = LEADS.find((x) => x.pid === input.pid)!;
    const d: Deal = { id: id(), pid: input.pid, address: l.address, typeLabel: TYPES[l.classCode].label, price: input.price, closeDate: input.closeDate, netToBroker: input.netToBroker };
    s.deals.unshift(d); s.status[input.pid] = 'Sold'; save(s); return d;
  },
  async listDeals() { return load().deals; },
};
