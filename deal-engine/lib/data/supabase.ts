import { ensureSession, supabase } from '@/lib/supabase/client';
import type { Activity, Asset, AssetKind, Claim, CheckResult, Comp, Deal, EvalMetrics, EvalRun, JudgeResult, Lead, LeadStatus } from '@/types/domain';
import type { DataProvider } from './provider';

// Row shapes match supabase/migrations/0001_init.sql
interface LeadRow {
  pid: string; address: string; area: string; class_code: Lead['classCode']; footprint_sf: number; footprint_change_pct: number;
  acreage: number; owner1: string; mail_city: string; mail_state: string; sale_price: number; sale_date: string; flood_zone: string;
  jurisdiction: string; other_parcels: number; lat: number; lng: number; zone_code: string | null; zone_name: string | null; permitted_uses: string[] | null;
  commercial_permitted: boolean | null; industrial_permitted: boolean | null; multi_family_permitted: boolean | null;
  max_height_ft: number | null; max_far: number | null; zoning_precision: Lead['zoning']['precision'] | null;
  zoning_source: Lead['zoning']['source'] | null; simulated: string[] | null;
}

const toLead = (r: LeadRow, status: LeadStatus = 'New'): Lead => ({
  pid: r.pid, address: r.address, area: r.area, classCode: r.class_code, footprintSf: r.footprint_sf, footprintChangePct: r.footprint_change_pct,
  acreage: r.acreage, owner: r.owner1, mailCity: r.mail_city, mailState: r.mail_state, salePrice: r.sale_price, saleDate: r.sale_date,
  floodZone: r.flood_zone, jurisdiction: r.jurisdiction, otherParcels: r.other_parcels, lat: r.lat, lng: r.lng, status,
  simulated: (r.simulated ?? []).map((text) => ({ pid: r.pid, text })),
  zoning: {
    zoneCode: r.zone_code, zoneName: r.zone_name, permittedUses: r.permitted_uses ?? [],
    commercialPermitted: r.commercial_permitted, industrialPermitted: r.industrial_permitted, multiFamilyPermitted: r.multi_family_permitted,
    maxHeightFt: r.max_height_ft, maxFar: r.max_far, precision: r.zoning_precision ?? 'none', source: r.zoning_source ?? 'none',
  },
});

async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  await ensureSession();
  const { data, error } = await supabase().functions.invoke(fn, { body });
  if (error) {
    // Surface the function's own message (rate limit, not served, blocked) instead of a generic HTTP error.
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return data as T;
}

interface AssetRow { id: string; claims: Claim[]; prompt_version: string; code_checks: CheckResult[] | null; judge: JudgeResult | null; approved_at: string | null }
const toAsset = (pid: string, kind: AssetKind, r: AssetRow): Asset => ({
  id: r.id, pid, kind, claims: r.claims, promptVersion: r.prompt_version, approvedAt: r.approved_at,
  codeChecks: r.code_checks ?? undefined, judge: r.judge,
});
interface EvalRow { id: string; prompt_version: string; model: string; gen_model: string | null; judge_model: string | null; golden_set: string; run_at: string; cases: number; metrics: EvalMetrics; results?: { results: EvalRun['results'] } }
const toRun = (r: EvalRow): EvalRun => ({
  id: r.id, promptVersion: r.prompt_version, model: r.model, genModel: r.gen_model ?? r.model, judgeModel: r.judge_model ?? r.model, goldenSet: r.golden_set, runAt: r.run_at, cases: r.cases, metrics: r.metrics,
  results: r.results?.results,
});
async function uid() { const s = await ensureSession(); return s!.user.id; }
async function statuses(): Promise<Record<string, LeadStatus>> {
  const { data } = await supabase().from('lead_status').select('pid,status');
  return Object.fromEntries((data ?? []).map((r) => [r.pid, r.status as LeadStatus]));
}
function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const supabaseProvider: DataProvider = {
  async serveLeads(count) {
    // Edge function picks unseen parcels, marks them served for this user,
    // and fetches zoning for new leads only (cached by PID, credits protected).
    const r = await call<{ leads: LeadRow[]; remaining: number }>('serve-leads', { count });
    return { leads: r.leads.map((x) => toLead(x)), remaining: r.remaining };
  },
  async listServedLeads() {
    await ensureSession();
    const served = must(await supabase().from('served_leads').select('pid').order('served_at'));
    if (!served.length) return [];
    const rows = must(await supabase().from('lead_view').select('*').in('pid', served.map((s) => s.pid))) as LeadRow[];
    const st = await statuses();
    const byPid = new Map(rows.map((r) => [r.pid, r]));
    return served.map((s) => byPid.get(s.pid)).filter(Boolean).map((r) => toLead(r!, st[r!.pid]));
  },
  async getLead(pid) {
    await ensureSession();
    const row = must(await supabase().from('lead_view').select('*').eq('pid', pid).maybeSingle()) as LeadRow | null;
    if (!row) return null;
    return toLead(row, (await statuses())[pid]);
  },
  async getComps(pid) {
    const rows = must(await supabase().rpc('get_comps', { p_pid: pid, p_limit: 6 })) as { pid: string; address: string; sale_date: string; sale_price: number; footprint_sf: number }[];
    return rows.map<Comp>((r) => ({ pid: r.pid, address: r.address, saleDate: r.sale_date, salePrice: r.sale_price, footprintSf: r.footprint_sf }));
  },
  async getTreasuryPct(saleDate) {
    const row = must(await supabase().from('rates_10y').select('rate_pct').lte('month', saleDate).order('month', { ascending: false }).limit(1).maybeSingle()) as { rate_pct: number } | null;
    if (!row) throw new Error(`No 10-year rate on or before ${saleDate}`);
    return row.rate_pct;
  },
  async setStatus(pid, status) { must(await supabase().from('lead_status').upsert({ user_id: await uid(), pid, status })); },

  async listActivities(pid) {
    const rows = must(await supabase().from('activities').select('*').eq('pid', pid).order('created_at', { ascending: false })) as { id: string; pid: string; kind: Activity['kind']; body: string; created_at: string }[];
    return rows.map((r) => ({ id: r.id, pid: r.pid, kind: r.kind, text: r.body, createdAt: r.created_at }));
  },
  async addActivity(pid, kind, text) {
    const r = must(await supabase().from('activities').insert({ user_id: await uid(), pid, kind, body: text }).select().single()) as { id: string; created_at: string };
    return { id: r.id, pid, kind, text, createdAt: r.created_at };
  },
  draftOutreach: (pid) => call<{ text: string; check?: CheckResult }>('draft-outreach', { pid }),

  async createListing(pid) {
    must(await supabase().from('listings').upsert({ user_id: await uid(), pid }));
    await this.setStatus(pid, 'Listing won');
  },
  async listListings() {
    await ensureSession();
    const rows = must(await supabase().from('listings').select('pid').order('created_at', { ascending: false })) as { pid: string }[];
    return rows.map((r) => r.pid);
  },
  async generateAsset(pid, kind, opts) {
    // generate-copy builds Claim[] server-side from the listing record, runs the code checks and stores both.
    const r = await call<AssetRow>('generate-copy', { pid, kind, plant_errors: !!opts?.plantErrors, regenerate: !!opts?.regenerate });
    return toAsset(pid, kind, r);
  },
  async listAssets(pid) {
    await ensureSession();
    const rows = must(await supabase().from('assets').select('id, kind, claims, prompt_version, code_checks, judge, approved_at, plant_errors')
      .eq('pid', pid).eq('plant_errors', false).order('created_at', { ascending: false })) as (AssetRow & { kind: AssetKind })[];
    return rows.map((r) => toAsset(pid, r.kind, r));
  },
  judgeAsset: (asset) => call<JudgeResult>('judge-copy', { asset_id: asset.id }),
  async approveAsset(assetId) {
    await ensureSession();
    return must(await supabase().rpc('approve_asset', { p_asset_id: assetId })) as string;
  },

  async listEvalRuns() {
    // Runs with no completed cases are failed starts, not results.
    const rows = must(await supabase().from('eval_runs').select('id, prompt_version, model, gen_model, judge_model, golden_set, run_at, cases, metrics')
      .gt('cases', 0).order('run_at', { ascending: false }).limit(40)) as EvalRow[];
    return rows.map(toRun);
  },
  async getEvalRun(id) {
    const row = must(await supabase().from('eval_runs').select('*').eq('id', id).maybeSingle()) as EvalRow | null;
    return row ? toRun(row) : null;
  },

  async markSold(input) {
    const r = must(await supabase().from('deals').insert({
      user_id: await uid(), pid: input.pid, price: input.price, close_date: input.closeDate, commission_pct: input.commissionPct,
      broker_split_pct: input.brokerSplitPct, co_broker: input.coBroker, net_to_broker: input.netToBroker,
    }).select('id').single()) as { id: string };
    await this.setStatus(input.pid, 'Sold');
    const lead = await this.getLead(input.pid);
    return { id: r.id, pid: input.pid, address: lead?.address ?? input.pid, typeLabel: lead?.classCode ?? '', price: input.price, closeDate: input.closeDate, netToBroker: input.netToBroker } satisfies Deal;
  },
  async listDeals() {
    await ensureSession();
    const rows = must(await supabase().from('deal_view').select('*').order('close_date', { ascending: false })) as { id: string; pid: string; address: string; type_label: string; price: number; close_date: string; net_to_broker: number }[];
    return rows.map((r) => ({ id: r.id, pid: r.pid, address: r.address, typeLabel: r.type_label, price: r.price, closeDate: r.close_date, netToBroker: r.net_to_broker }));
  },
};
