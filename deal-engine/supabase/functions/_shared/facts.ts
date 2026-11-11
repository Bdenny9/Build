import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { Facts } from './checks.ts';
import { HttpError } from './http.ts';

export const TYPE_LABEL: Record<string, string> = {
  '200': 'Apartments', '304': 'Manufacturing / industrial', '500': 'General commercial', '530': 'Retail',
  '580': 'Restaurant', '630': 'Warehouse', '650': 'Office', '700': 'Hotel',
};
const NOMINAL_SALE_FLOOR = 10_000;

export interface Lead {
  pid: string; address: string; area: string; class_code: string; footprint_sf: number; acreage: number | null;
  owner1: string; mail_city: string; mail_state: string; sale_price: number; sale_date: string; flood_zone: string | null;
  jurisdiction: string; data_as_of: string; zone_code: string | null; zone_name: string | null; permitted_uses: string[] | null;
  max_far: number | null; max_height_ft: number | null; zoning_precision: string | null;
}

/** What the model may say, grouped by the source key each claim must cite, plus the numbers code will check. */
export interface Record_ {
  lead: Lead;
  /** Buyer-safe record. Simulated signals and owner details are never in here. */
  record: Record<string, Record<string, unknown> | null>;
  numeric: Facts;
  holdYears: number;
  compsCount: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export async function loadRecord(db: SupabaseClient, pid: string): Promise<Record_> {
  const { data: lead, error } = await db.from('lead_view').select('*').eq('pid', pid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!lead) throw new HttpError(404, `No parcel ${pid}`);
  const l = lead as Lead;
  const { data: comps } = await db.rpc('get_comps', { p_pid: pid, p_limit: 6 });
  const usable = ((comps ?? []) as { sale_price: number; footprint_sf: number }[])
    .filter((c) => Number(c.sale_price) >= NOMINAL_SALE_FLOOR && Number(c.footprint_sf) > 0);
  const psf = median(usable.map((c) => Number(c.sale_price) / Number(c.footprint_sf)));
  const medianPsf = Number.isFinite(psf) ? Math.round(psf) : undefined;
  const verifiedZoning = l.zoning_precision === 'parcel' && l.zone_code;
  const asOf = new Date(l.data_as_of + 'T12:00:00Z'), sold = new Date(l.sale_date + 'T12:00:00Z');
  const holdYears = ((asOf.getUTCFullYear() - sold.getUTCFullYear()) * 12 + asOf.getUTCMonth() - sold.getUTCMonth()) / 12;

  return {
    lead: l,
    holdYears,
    compsCount: usable.length,
    numeric: { footprintSf: Number(l.footprint_sf), acreage: l.acreage ?? undefined, medianPsf },
    record: {
      parcel: { address: l.address, area: l.area, jurisdiction: l.jurisdiction, property_type: TYPE_LABEL[l.class_code], acreage: l.acreage },
      foot: { footprint_sf: Number(l.footprint_sf), note: 'Ground footprint from the 2025 county survey. Number of stories is unknown.' },
      fema: l.flood_zone ? { flood_zone: l.flood_zone } : null,
      zoning: verifiedZoning
        ? { zone_code: l.zone_code, zone_name: l.zone_name, permitted_as_of_right: l.permitted_uses ?? [], max_far: l.max_far, max_height_ft: l.max_height_ft }
        : null,
      comps: medianPsf !== undefined
        ? { median_price_per_footprint_sf: medianPsf, sales_count: usable.length, basis: 'County sales of the same property type in the last 3 years, nearest first' }
        : null,
    },
  };
}
