#!/usr/bin/env python3
"""
Load the snapshot written by fetch_snapshot.py into Supabase (service role).

Usage:
  SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
    python3 scripts/load_snapshot.py [SNAPSHOT_DIR]

Idempotent: parcels and rates are upserted on their primary keys; simulated signals are replaced.
Run locally only. The secret key bypasses RLS and must never reach the browser or the repo.
"""
import json, os, sys, urllib.request

URL = os.environ['SUPABASE_URL'].rstrip('/') + '/rest/v1'
KEY = os.environ['SUPABASE_SECRET_KEY']
DIR = sys.argv[1] if len(sys.argv) > 1 else 'snapshot'


def req(method, path, body=None, prefer=None):
    headers = {'apikey': KEY, 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    r = urllib.request.Request(URL + path, method=method, headers=headers,
                               data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r, timeout=120) as res:
            return res.status
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path} -> {e.code}: {e.read().decode()[:500]}')


def upsert(table, rows, size=500):
    for i in range(0, len(rows), size):
        req('POST', f'/{table}', rows[i:i + size], 'resolution=merge-duplicates,return=minimal')
    print(f'{table}: {len(rows)} rows')


def load(name):
    with open(os.path.join(DIR, f'{name}.json')) as fh:
        return json.load(fh)


parcels = load('parcels')
upsert('parcels', parcels)
upsert('rates_10y', load('rates_10y'))
req('DELETE', '/simulated_signals?id=gt.0', prefer='return=minimal')
sims = load('simulated_signals')
for i in range(0, len(sims), 500):
    req('POST', '/simulated_signals', sims[i:i + 500], 'return=minimal')
print(f'simulated_signals: {len(sims)} rows')
