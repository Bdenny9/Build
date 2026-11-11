// Domain types shared by UI, data providers and calc modules.

export type ClassCode = '200' | '304' | '500' | '530' | '580' | '630' | '650' | '700';

export type { SourceKey } from '@/supabase/functions/_shared/checks';

export interface Parcel {
  pid: string;
  address: string;
  area: string;
  classCode: ClassCode;
  footprintSf: number;
  footprintChangePct: number;
  acreage: number;
  owner: string;
  mailCity: string;
  mailState: string;
  salePrice: number;
  saleDate: string; // YYYY-MM-DD
  floodZone: string;
  jurisdiction: string;
  otherParcels: number;
  lat: number;
  lng: number;
}

export interface Zoning {
  zoneCode: string | null;
  zoneName: string | null;
  permittedUses: string[];
  commercialPermitted: boolean | null;
  industrialPermitted: boolean | null;
  multiFamilyPermitted: boolean | null;
  maxHeightFt: number | null;
  maxFar: number | null;
  /** 'parcel' = verified for this PID; 'jurisdiction_default' must never reach buyer copy. */
  precision: 'parcel' | 'jurisdiction_default' | 'none';
  source: 'zonomics_api' | 'zonomics_cache' | 'zoning_districts' | 'none';
}

export interface SimulatedSignal { pid: string; text: string }

export interface Lead extends Parcel {
  zoning: Zoning;
  simulated: SimulatedSignal[];
  status: LeadStatus;
}

export type LeadStatus = 'New' | 'Contacted' | 'Conversation' | 'Meeting' | 'Listing pitch' | 'Listing won' | 'Sold';

export interface Comp {
  pid: string;
  address: string;
  saleDate: string;
  salePrice: number;
  footprintSf: number;
}

export interface Activity {
  id: string;
  pid: string;
  kind: 'Call' | 'Email' | 'Note' | 'Status';
  text: string;
  createdAt: string;
}

export type AssetKind = 'description' | 'highlights' | 'mailer' | 'email';

// Claim and CheckResult live with the code checks so server and browser share one definition.
export type { Claim, CheckResult } from '@/supabase/functions/_shared/checks';
import type { Claim, CheckResult } from '@/supabase/functions/_shared/checks';

export interface EvalResult { pass: boolean; checks: CheckResult[] }

export interface Asset {
  id: string;
  pid: string;
  kind: AssetKind;
  claims: Claim[];
  promptVersion: string;
  approvedAt: string | null;
  /** Stored server-side; present for Supabase assets. */
  codeChecks?: CheckResult[];
  judge?: JudgeResult | null;
}

export interface JudgeVerdict { index: number; overstates: boolean; reason: string }
export interface JudgeResult { result: CheckResult; verdicts: JudgeVerdict[] }

export interface EvalRun {
  id: string;
  promptVersion: string;
  model: string;
  runAt: string;
  cases: number;
  metrics: Record<string, number>;
}

export interface Deal {
  id: string;
  pid: string;
  address: string;
  typeLabel: string;
  price: number;
  closeDate: string;
  netToBroker: number;
}
