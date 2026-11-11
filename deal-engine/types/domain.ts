// Domain types shared by UI, data providers and calc modules.

export type ClassCode = '200' | '304' | '500' | '530' | '580' | '630' | '650' | '700';

export type SourceKey = 'parcel' | 'foot' | 'fema' | 'zoning' | 'fred' | 'comps' | 'assume' | 'calc' | 'sim';

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

/** One sentence or bullet of generated copy. The model must return claims, never free text. */
export interface Claim {
  text: string;
  source: SourceKey | null;
  detail: string;
  /** Present when the claim states a number that code can recompute. */
  numeric?: { field: 'footprintSf' | 'acreage' | 'medianPsf' | 'capRate'; value: number };
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  ratio?: number;
  kind: 'code' | 'llm';
}

export interface EvalResult { pass: boolean; checks: CheckResult[] }

export interface Asset {
  id: string;
  pid: string;
  kind: AssetKind;
  claims: Claim[];
  promptVersion: string;
  approvedAt: string | null;
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
