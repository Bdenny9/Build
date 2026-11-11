import type { ClassCode, Comp, Lead } from '@/types/domain';

// Sample data shaped exactly like the Supabase snapshot. Owners are fictional.
type Seed = Omit<Lead, 'status' | 'simulated' | 'zoning'> & { sim: string[]; zone: [string, string, string[]] };

const seeds: Seed[] = [
  { pid: '3100400212', lat: 32.7835, lng: -80.036, address: '1830 Savannah Hwy', area: 'West Ashley', classCode: '530', footprintSf: 9800, footprintChangePct: 0, acreage: 1.1, owner: 'Ashley Retail Partners LLC', mailCity: 'Atlanta', mailState: 'GA', salePrice: 1450000, saleDate: '2016-05-12', floodZone: 'X', jurisdiction: 'City of Charleston', otherParcels: 3, zone: ['GB', 'General Business', ['Retail', 'Office', 'Restaurant']], sim: ['Anchor tenant lease ends 2027', 'Submarket retail sales up 14% YoY'] },
  { pid: '4690800031', lat: 32.856, lng: -79.99, address: '4975 Rivers Ave', area: 'North Charleston', classCode: '630', footprintSf: 22400, footprintChangePct: 12, acreage: 2.6, owner: 'Rivers Industrial Holdings LLC', mailCity: 'Charlotte', mailState: 'NC', salePrice: 2100000, saleDate: '2017-03-08', floodZone: 'X', jurisdiction: 'City of North Charleston', otherParcels: 1, zone: ['M-1', 'Light Industrial', ['Warehouse', 'Light manufacturing', 'Flex']], sim: ['Late county tax payment, 2025'] },
  { pid: '4580402115', lat: 32.7905, lng: -79.944, address: '61 Spring St', area: 'Upper King', classCode: '650', footprintSf: 4200, footprintChangePct: 0, acreage: 0.18, owner: 'Spring Street Office LLC', mailCity: 'Charleston', mailState: 'SC', salePrice: 1250000, saleDate: '2015-08-21', floodZone: 'AE', jurisdiction: 'City of Charleston', otherParcels: 0, zone: ['MU-2', 'Mixed Use 2', ['Office', 'Retail', 'Residential above']], sim: ['Two suites vacant 9+ months', 'Peninsula office pricing up 9% YoY'] },
  { pid: '4721000044', lat: 32.879, lng: -79.996, address: '2211 Remount Rd', area: 'North Charleston', classCode: '500', footprintSf: 6100, footprintChangePct: 0, acreage: 0.9, owner: 'Kessler Family Trust', mailCity: 'Charleston', mailState: 'SC', salePrice: 680000, saleDate: '2014-02-27', floodZone: 'X', jurisdiction: 'City of North Charleston', otherParcels: 2, zone: ['B-2', 'General Business', ['Retail', 'Service', 'Office']], sim: ['Trust beneficiary change recorded'] },
  { pid: '4610300087', lat: 32.808, lng: -79.938, address: '960 Morrison Dr', area: 'Charleston Neck', classCode: '304', footprintSf: 15600, footprintChangePct: -8, acreage: 1.4, owner: 'Morrison Works LLC', mailCity: 'New York', mailState: 'NY', salePrice: 1900000, saleDate: '2018-10-03', floodZone: 'AE', jurisdiction: 'City of Charleston', otherParcels: 0, zone: ['LI', 'Light Industrial', ['Industrial', 'Flex', 'Creative office']], sim: ['Neck redevelopment interest rising'] },
  { pid: '4690201318', lat: 32.8775, lng: -79.9765, address: '4730 Montague Ave', area: 'Park Circle', classCode: '580', footprintSf: 3400, footprintChangePct: 4, acreage: 0.35, owner: 'Montague Hospitality LLC', mailCity: 'Charleston', mailState: 'SC', salePrice: 610000, saleDate: '2019-06-14', floodZone: 'X', jurisdiction: 'City of North Charleston', otherParcels: 1, zone: ['GB', 'General Business', ['Restaurant', 'Retail']], sim: ['Operator lease on month-to-month'] },
  { pid: '5170902044', lat: 32.792, lng: -79.878, address: '1101 Coleman Blvd', area: 'Mount Pleasant', classCode: '650', footprintSf: 7800, footprintChangePct: 0, acreage: 0.7, owner: 'Coleman Professional Center LLC', mailCity: 'Mount Pleasant', mailState: 'SC', salePrice: 1750000, saleDate: '2017-11-30', floodZone: 'AE', jurisdiction: 'Town of Mount Pleasant', otherParcels: 0, zone: ['CC', 'Commercial Core', ['Office', 'Medical office', 'Retail']], sim: ['Medical tenant expanding elsewhere'] },
  { pid: '2790000310', lat: 32.739, lng: -80.087, address: '3001 Maybank Hwy', area: 'Johns Island', classCode: '630', footprintSf: 11200, footprintChangePct: 0, acreage: 1.9, owner: 'Island Storage Partners LLC', mailCity: 'Charleston', mailState: 'SC', salePrice: 950000, saleDate: '2016-09-19', floodZone: 'X', jurisdiction: 'City of Charleston', otherParcels: 2, zone: ['CR', 'Community Commercial', ['Warehouse', 'Retail', 'Service']], sim: ['Island industrial vacancy under 3%'] },
  { pid: '4180700125', lat: 32.765, lng: -79.999, address: '1730 Wappoo Rd', area: 'West Ashley', classCode: '200', footprintSf: 18000, footprintChangePct: 0, acreage: 1.6, owner: 'Wappoo Garden Apartments LLC', mailCity: 'Columbia', mailState: 'SC', salePrice: 2400000, saleDate: '2015-04-02', floodZone: 'AE', jurisdiction: 'City of Charleston', otherParcels: 4, zone: ['DR-1F', 'Diverse Residential', ['Multifamily', 'Townhomes']], sim: ['Insurance premium up 31% at renewal'] },
  { pid: '4020000216', lat: 32.896, lng: -80.059, address: '7401 Dorchester Rd', area: 'North Charleston', classCode: '700', footprintSf: 14000, footprintChangePct: 0, acreage: 2.2, owner: 'Aviation Hospitality LLC', mailCity: 'Houston', mailState: 'TX', salePrice: 4800000, saleDate: '2018-04-11', floodZone: 'X', jurisdiction: 'City of North Charleston', otherParcels: 0, zone: ['GB', 'General Business', ['Hotel', 'Retail', 'Restaurant']], sim: ['Brand flag renewal due 2027'] },
];

export const LEADS: Lead[] = seeds.map(({ sim, zone, ...p }) => ({
  ...p,
  status: 'New',
  simulated: sim.map((text) => ({ pid: p.pid, text })),
  zoning: {
    zoneCode: zone[0], zoneName: zone[1], permittedUses: zone[2],
    commercialPermitted: null, industrialPermitted: null, multiFamilyPermitted: null,
    maxHeightFt: null, maxFar: null, precision: 'parcel', source: 'zonomics_cache',
  },
}));

/** Approximate annual averages for the sample. The real table is monthly from FRED. */
export const TREASURY_10Y: Record<number, number> = { 2014: 2.54, 2015: 2.14, 2016: 1.84, 2017: 2.33, 2018: 2.91, 2019: 2.14, 2020: 0.89, 2021: 1.45 };

const PSF: Record<ClassCode, number> = { '200': 165, '304': 105, '500': 175, '530': 210, '580': 310, '630': 115, '650': 285, '700': 260 };
const STREETS: Record<ClassCode, string[]> = {
  '200': ['Ashley River Rd', 'Sam Rittenberg Blvd', 'Folly Rd', 'Rivers Ave'],
  '304': ['Meeting St', 'Leeds Ave', 'King St Ext', 'Azalea Dr'],
  '500': ['Dorchester Rd', 'Ashley Phosphate Rd', 'Rivers Ave', 'Savannah Hwy'],
  '530': ['Sam Rittenberg Blvd', 'Folly Rd', 'Savannah Hwy', 'Ashley River Rd'],
  '580': ['East Montague Ave', 'Spruill Ave', 'Rivers Ave', 'Reynolds Ave'],
  '630': ['Leeds Ave', 'Palmetto Commerce Pkwy', 'Azalea Dr', 'River Rd'],
  '650': ['Meeting St', 'King St', 'Johnnie Dodds Blvd', 'Calhoun St'],
  '700': ['International Blvd', 'Rivers Ave', 'Tanger Outlet Blvd', 'Ashley Phosphate Rd'],
};

export function sampleComps(lead: Lead): Comp[] {
  const mult = [0.92, 0.98, 1.04, 1.1], sizes = [0.8, 1.15, 0.95, 1.3], dates = ['2024-02-15', '2024-09-15', '2025-05-15', '2026-03-15'];
  return mult.map((m, i) => {
    const sf = Math.round((lead.footprintSf * sizes[i]) / 100) * 100;
    return { pid: `C${lead.pid.slice(-4)}${i}`, address: `${1200 + i * 317 + Number(lead.pid.slice(-3))} ${STREETS[lead.classCode][i]}`, saleDate: dates[i], footprintSf: sf, salePrice: Math.round((sf * PSF[lead.classCode] * m) / 1000) * 1000 };
  });
}
