#!/usr/bin/env python3
"""
One-time snapshot of Charleston County commercial parcels for Deal Engine.

Fetches from public sources only and writes JSON files to OUT_DIR (default ./snapshot):
  parcels.json            one row per PID, shaped like public.parcels
  simulated_signals.json  mock signals for lead candidates only
  rates_10y.json          FRED DGS10 monthly averages

Sources
  County GIS  GIS_VIEWER/External_GIS_Website/MapServer
    7   Parcels (owner, class code, sale, acreage, geometry)
    1   Address points (PID -> situs address, postal town)
    61  2025 building footprints (area, previous area)
    19  Municipal boundaries (jurisdiction)
    36  Current FEMA flood data (FLD_ZONE)
  FRED  DGS10 daily CSV, averaged by month

Usage: pip install shapely && python3 scripts/fetch_snapshot.py [OUT_DIR]
"""
import csv, hashlib, io, json, os, re, sys, time, urllib.parse, urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

GIS = 'https://gisccapps.charlestoncounty.org/arcgis/rest/services/GIS_VIEWER/External_GIS_Website/MapServer'
FRED = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10'
CLASS_CODES = ['200', '304', '500', '530', '580', '630', '650', '700']  # 250 (commercial condo) excluded: units share one footprint
DATA_AS_OF = datetime.now(timezone.utc).date().isoformat()
NOMINAL_SALE_FLOOR = 10_000
INSTITUTIONAL_SALE_CEILING = 50_000_000  # sales above this are treated as institutional
NON_LEAD_OWNER = re.compile(
    r'\b(CITY OF|TOWN OF|COUNTY|STATE OF|SOUTH CAROLINA|SC DEPT|S C DEPT|UNITED STATES|USA|FEDERAL|'
    r'HOUSING AUTH\w*|AUTHORITY|COMMISSION|SCHOOL|UNIVERSITY|COLLEGE|ACADEMY|CHURCH|MINISTR\w*|DIOCESE|'
    r'CONGREGATION|TEMPLE|HOSPITAL|MEDICAL UNIVERSITY|MUSC|DISTRICT|STATE PORTS|REIT|'
    r'WAL[- ]?MART|HOME DEPOT|LOWES|TARGET CORP|MCDONALDS|KROGER|PUBLIX|CVS|WALGREEN)\b', re.I)

OUT = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'


def get(url, params=None, tries=5, post=False):
    data = None
    if params and post:
        data = urllib.parse.urlencode(params).encode()
    elif params:
        url += ('&' if '?' in url else '?') + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, data=data, timeout=120) as r:
                return r.read()
        except Exception as e:  # network blips: back off and retry
            if i == tries - 1:
                raise
            time.sleep(2 ** i)


def query(layer, where, fields='*', geometry=False, extra=None):
    """Paged ArcGIS query. Returns a list of features."""
    out, offset = [], 0
    while True:
        p = {'where': where, 'outFields': fields, 'returnGeometry': str(geometry).lower(), 'f': 'json',
             'resultOffset': offset, 'resultRecordCount': 1000, 'orderByFields': 'OBJECTID'}
        if geometry:
            p.update(outSR=4326, geometryPrecision=6)
        if extra:
            p.update(extra)
        d = json.loads(get(f'{GIS}/{layer}/query', p))
        if 'error' in d:
            raise RuntimeError(f'layer {layer}: {d["error"]}')
        feats = d.get('features', [])
        out += feats
        if not d.get('exceededTransferLimit') or not feats:
            return out
        offset += len(feats)


def esri_polygon(g):
    return shape({'type': 'Polygon', 'coordinates': g['rings']}) if len(g['rings']) == 1 else \
        shape({'type': 'MultiPolygon', 'coordinates': [[r] for r in g['rings']]}).buffer(0)


def clean(s):
    return re.sub(r'\s+', ' ', (s or '')).strip()


def title(s):
    small = {'OF': 'of', 'AND': 'and'}
    return ' '.join(w if w in ('LLC', 'LP', 'SC', 'US') else small.get(w.upper(), w.capitalize()) for w in clean(s).split())


def chunks(xs, n):
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


def in_list(field, values):
    return f"{field} IN ({','.join(chr(39) + v.replace(chr(39), chr(39) * 2) + chr(39) for v in values)})"


def main():
    os.makedirs(OUT, exist_ok=True)

    # 1. Parcels with geometry -> interior point
    where = ' OR '.join(f"CLASS_CODE LIKE '{c}%'" for c in CLASS_CODES)
    feats = query(7, where, 'PID,OWNER1,CLASS_CODE,MAIL_CITY,MAIL_STATE,ACREAGE,SALE_PRICE,RECORDED_DATE', geometry=True,
                  extra={'maxAllowableOffset': 0.00002})
    parcels = {}
    for f in feats:
        a = f['attributes']
        pid = clean(a['PID'])
        if not pid or pid in parcels or not f.get('geometry'):
            continue
        try:
            pt = esri_polygon(f['geometry']).representative_point()
        except Exception:
            continue
        rd = a.get('RECORDED_DATE')
        parcels[pid] = {
            'pid': pid, 'address': None, 'area': None, 'class_code': clean(a['CLASS_CODE']).split(' ')[0],
            'footprint_sf': 0, 'footprint_change_pct': 0, 'acreage': a.get('ACREAGE'),
            'owner1': clean(a['OWNER1']), 'mail_city': title(a['MAIL_CITY']), 'mail_state': clean(a['MAIL_STATE']).upper(),
            'sale_price': a.get('SALE_PRICE'),
            'sale_date': datetime.fromtimestamp(rd / 1000, timezone.utc).date().isoformat() if rd else None,
            'flood_zone': None, 'jurisdiction': None, 'other_parcels': 0,
            'lat': round(pt.y, 6), 'lng': round(pt.x, 6), 'is_lead_candidate': False, 'data_as_of': DATA_AS_OF,
            '_rings': f['geometry']['rings'],
        }
    pids = sorted(parcels)
    print(f'parcels: {len(pids)}', flush=True)

    def per_batch(fn, size=150):
        with ThreadPoolExecutor(6) as ex:
            return [r for rs in ex.map(fn, list(chunks(pids, size))) for r in rs]

    # 2. Addresses (first address point per PID by OBJECTID)
    for f in per_batch(lambda b: query(1, in_list('PID', b), 'PID,WHOLE_ADDRESS,POSTAL_TOWN')):
        a = f['attributes']
        p = parcels.get(clean(a['PID']))
        if p and not p['address'] and clean(a['WHOLE_ADDRESS']):
            p['address'] = title(a['WHOLE_ADDRESS'])
            p['area'] = title(a['POSTAL_TOWN'])
    print(f'addresses by PID: {sum(1 for p in parcels.values() if p["address"])}', flush=True)

    # 3. Footprints: sum 2025 area; percent change on the summed previous area
    cur, prev = defaultdict(float), defaultdict(float)
    for f in per_batch(lambda b: query(61, in_list('PID', b), 'PID,SDE_S_BLDG_2025_area,prev_area')):
        a = f['attributes']
        pid = clean(a['PID'])
        cur[pid] += a['SDE_S_BLDG_2025_area'] or 0
        prev[pid] += a['prev_area'] or 0
    for pid, sf in cur.items():
        if pid in parcels:
            parcels[pid]['footprint_sf'] = round(sf)
            parcels[pid]['footprint_change_pct'] = round((sf - prev[pid]) / prev[pid] * 100) if prev[pid] > 0 else 0
    print(f'footprints: {sum(1 for p in parcels.values() if p["footprint_sf"] > 0)}', flush=True)

    # 4. Jurisdiction: point in municipal boundary, else unincorporated county
    munis = [(esri_polygon(f['geometry']), title(f['attributes']['NAME']))
             for f in query(19, '1=1', 'NAME', geometry=True, extra={'maxAllowableOffset': 0.0001}) if f.get('geometry')]
    tree = STRtree([m[0] for m in munis])
    for p in parcels.values():
        pt = Point(p['lng'], p['lat'])
        hit = next((munis[i][1] for i in tree.query(pt) if munis[i][0].contains(pt)), None)
        p['jurisdiction'] = hit if hit and hit != 'County of Charleston' else 'Charleston County (unincorporated)'
    print('jurisdictions done', flush=True)

    # 4b. Address fallback: address points inside the parcel, from the matching city layer
    CITY = {'City of Charleston': (30, 'ADDRLABEL', 'CMTYNAME'), 'City of North Charleston': (43, 'COMPLETE_A', 'INC_MUNI'),
            'Town of Mt Pleasant': (27, 'WHOLE_ADDRESS', None)}
    def spatial_address(p):
        layer, field, town = CITY.get(p['jurisdiction'], (1, 'WHOLE_ADDRESS', 'POSTAL_TOWN'))
        d = json.loads(get(f'{GIS}/{layer}/query', {
            'geometry': json.dumps({'rings': p['_rings'], 'spatialReference': {'wkid': 4326}}), 'geometryType': 'esriGeometryPolygon',
            'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'returnGeometry': 'false', 'f': 'json'}, post=True))
        cands = [(clean((f['attributes'].get(field) or '').split(',')[0]), f['attributes'].get(town) if town else None)
                 for f in d.get('features', [])]
        cands = sorted({c for c in cands if c[0]}, key=lambda c: (len(c[0]), c[0]))
        return p['pid'], cands[0] if cands else None
    missing = [p for p in parcels.values() if not p['address']]
    with ThreadPoolExecutor(10) as ex:
        for pid, hit in ex.map(spatial_address, missing):
            if hit:
                p = parcels[pid]
                p['address'] = title(hit[0])
                p['area'] = title(hit[1]) if hit[1] else re.sub(r'^(City|Town) of ', '', p['jurisdiction']).replace('Mt Pleasant', 'Mount Pleasant')
    print(f'addresses total: {sum(1 for p in parcels.values() if p["address"])}', flush=True)

    # 5. Flood zone: one point query per parcel against current FEMA data
    def flood(p):
        d = json.loads(get(f'{GIS}/36/query', {
            'geometry': f'{p["lng"]},{p["lat"]}', 'geometryType': 'esriGeometryPoint', 'inSR': 4326,
            'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'FLD_ZONE', 'returnGeometry': 'false', 'f': 'json'}))
        zones = [clean(f['attributes']['FLD_ZONE']) for f in d.get('features', [])]
        return p['pid'], (zones[0] if zones else None)
    with ThreadPoolExecutor(12) as ex:
        for pid, z in ex.map(flood, parcels.values()):
            parcels[pid]['flood_zone'] = z
    print(f'flood zones: {sum(1 for p in parcels.values() if p["flood_zone"])}', flush=True)

    # 6. Other parcels countywide with the same OWNER1
    owners = sorted({p['owner1'] for p in parcels.values() if p['owner1']})
    counts = {}
    def owner_counts(b):
        d = json.loads(get(f'{GIS}/7/query', {
            'where': in_list('OWNER1', b), 'groupByFieldsForStatistics': 'OWNER1', 'returnGeometry': 'false', 'f': 'json',
            'outStatistics': json.dumps([{'statisticType': 'count', 'onStatisticField': 'OBJECTID', 'outStatisticFieldName': 'n'}])}))
        return [(clean(f['attributes']['OWNER1']), f['attributes']['n']) for f in d.get('features', [])]
    with ThreadPoolExecutor(6) as ex:
        for rs in ex.map(owner_counts, list(chunks(owners, 100))):
            for o, n in rs:
                counts[o] = counts.get(o, 0) + n
    for p in parcels.values():
        p['other_parcels'] = max(counts.get(p['owner1'], 1) - 1, 0)

    # 7. Lead candidates
    for p in parcels.values():
        p['is_lead_candidate'] = bool(
            p['address'] and p['sale_date'] and p['footprint_sf'] > 0 and p['owner1']
            and NOMINAL_SALE_FLOOR <= (p['sale_price'] or 0) <= INSTITUTIONAL_SALE_CEILING
            and not NON_LEAD_OWNER.search(p['owner1']))
    for p in parcels.values():
        p.pop('_rings', None)
    rows = [p for p in parcels.values() if p['address']]  # no address, nothing to show
    print(f'loadable: {len(rows)}, lead candidates: {sum(p["is_lead_candidate"] for p in rows)}', flush=True)

    # 8. Simulated signals (mock, lead candidates only, deterministic per PID)
    sims = []
    for p in rows:
        if p['is_lead_candidate']:
            h = int(hashlib.sha1(p['pid'].encode()).hexdigest(), 16)
            pool = SIMULATED[p['class_code']] + SIMULATED['*']
            for k in range(h % 3):  # 0 to 2 signals
                sims.append({'pid': p['pid'], 'body': pool[(h >> (8 * k + 4)) % len(pool)]})

    # 9. FRED DGS10 monthly average
    by_month = defaultdict(list)
    for r in csv.DictReader(io.StringIO(get(FRED).decode())):
        v = r.get('DGS10')
        if v and v != '.':
            by_month[r['observation_date'][:7] + '-01'].append(float(v))
    rates = [{'month': m, 'rate_pct': round(sum(v) / len(v), 2)} for m, v in sorted(by_month.items())]

    for name, data in [('parcels', rows), ('simulated_signals', sims), ('rates_10y', rates)]:
        with open(os.path.join(OUT, f'{name}.json'), 'w') as fh:
            json.dump(data, fh)
        print(f'wrote {name}.json ({len(data)})')


SIMULATED = {
    '200': ['Insurance premium up sharply at renewal', 'Two units offline for repairs', 'Submarket rents flat year over year'],
    '304': ['Equipment lease expiring next year', 'Owner exploring relocation inland'],
    '500': ['Tenant lease on month-to-month', 'Neighboring parcel recently listed'],
    '530': ['Anchor tenant lease ends 2027', 'Submarket retail sales up year over year'],
    '580': ['Operator lease on month-to-month', 'Restaurant permit renewal pending'],
    '630': ['Island industrial vacancy under 3%', 'Tenant expanding to a larger facility'],
    '650': ['Two suites vacant 9+ months', 'Medical tenant expanding elsewhere'],
    '700': ['Brand flag renewal due 2027', 'Occupancy below submarket average'],
    '*': ['Late county tax payment, 2025', 'Ownership entity recently re-registered'],
}

if __name__ == '__main__':
    main()
