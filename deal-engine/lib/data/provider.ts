import type { Activity, Asset, AssetKind, Claim, CheckResult, Comp, Deal, Lead, LeadStatus } from '@/types/domain';

/**
 * Everything the UI needs, behind one interface.
 * - MockProvider: local fixtures, runs with no backend.
 * - SupabaseProvider: tables via RLS + Edge Functions for anything external or AI.
 * Deterministic math never lives here; it is in lib/calc and runs on the returned data.
 */
export interface DataProvider {
  // Prospecting
  serveLeads(count: number): Promise<{ leads: Lead[]; remaining: number }>; // edge: serve-leads
  listServedLeads(): Promise<Lead[]>;
  getLead(pid: string): Promise<Lead | null>;
  getComps(pid: string): Promise<Comp[]>;
  getTreasuryPct(saleDate: string): Promise<number>; // rates_10y, nearest month on or before
  setStatus(pid: string, status: LeadStatus): Promise<void>;

  // Light CRM
  listActivities(pid: string): Promise<Activity[]>;
  addActivity(pid: string, kind: Activity['kind'], text: string): Promise<Activity>;
  draftOutreach(pid: string): Promise<{ text: string }>; // edge: draft-outreach

  // Listing and marketing
  createListing(pid: string): Promise<void>;
  listListings(): Promise<string[]>; // pids, newest first
  generateAsset(pid: string, kind: AssetKind, opts?: { plantErrors?: boolean }): Promise<Asset>; // edge: generate-copy
  judgeAsset(claims: Claim[]): Promise<CheckResult>; // edge: judge-copy (LLM judge only)
  approveAsset(assetId: string): Promise<void>;

  // Close and payout
  markSold(input: { pid: string; price: number; closeDate: string; commissionPct: number; brokerSplitPct: number; coBroker: boolean; netToBroker: number }): Promise<Deal>;
  listDeals(): Promise<Deal[]>;
}
