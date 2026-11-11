import type { ClassCode, SourceKey } from '@/types/domain';

export const AS_OF = '2026-11-10';

export const TYPES: Record<ClassCode, { label: string; spreadPts: number }> = {
  '200': { label: 'Apartments', spreadPts: 1.75 },
  '304': { label: 'Manufacturing / industrial', spreadPts: 2.0 },
  '500': { label: 'General commercial', spreadPts: 2.5 },
  '530': { label: 'Retail', spreadPts: 2.5 },
  '580': { label: 'Restaurant', spreadPts: 2.5 },
  '630': { label: 'Warehouse', spreadPts: 2.0 },
  '650': { label: 'Office', spreadPts: 2.5 },
  '700': { label: 'Hotel', spreadPts: 3.0 },
};

/** Editable assumptions. Shown in the UI wherever they are used. */
export const ASSUMPTIONS = {
  ltv: 0.65,
  amortMonths: 300,
  termMonths: 120,
  today10y: 4.2,
  nominalSaleFloor: 10_000,
  followUpDays: 7,
};

export const SOURCES: Record<SourceKey, string> = {
  parcel: 'Charleston County parcels, layer 7',
  foot: 'Charleston County 2025 building footprints, layer 61',
  fema: 'FEMA flood zone',
  zoning: 'Zoning via Augur (Zoneomics), cached by PID',
  fred: '10-year Treasury, FRED',
  comps: 'Comps: county sales of the same type, last 3 years',
  assume: 'Editable assumption',
  calc: 'Calculated in code from cited inputs',
  sim: 'Simulated signal, mock data',
};

export const countyRecordUrl = (pid: string) =>
  `https://sc-charleston.publicaccessnow.com/RealPropertyRecordSearch/RealPropertyInfo.aspx?p=${encodeURIComponent(pid)}`;
