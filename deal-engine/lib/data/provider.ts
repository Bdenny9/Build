import type { Activity, Asset, AssetKind, CheckResult, Comp, Deal, EvalRun, JudgeResult, Lead, LeadStatus } from '@/types/domain';

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
  draftOutreach(pid: string): Promise<{ text: string; check?: CheckResult }>; // edge: draft-outreach

  // Listing and marketing
  createListing(pid: string): Promise<void>;
  listListings(): Promise<string[]>; // pids, newest first
  /** Returns the stored asset for this kind unless regenerate is set (edge: generate-copy). */
  generateAsset(pid: string, kind: AssetKind, opts?: { plantErrors?: boolean; regenerate?: boolean }): Promise<Asset>;
  /** Copy already stored for this listing, newest first. Never calls the model. */
  listAssets(pid: string): Promise<Asset[]>;
  /** LLM judge over the stored asset, server-side (edge: judge-copy). */
  judgeAsset(asset: Asset): Promise<JudgeResult>;
  /** Enforced in the database: refuses unless every code check and the judge pass. Returns approved_at. */
  approveAsset(assetId: string): Promise<string>;

  // Evals
  listEvalRuns(): Promise<EvalRun[]>; // newest first, without per-case results
  getEvalRun(id: string): Promise<EvalRun | null>;

  // Close and payout
  markSold(input: { pid: string; price: number; closeDate: string; commissionPct: number; brokerSplitPct: number; coBroker: boolean; netToBroker: number }): Promise<Deal>;
  listDeals(): Promise<Deal[]>;
}
