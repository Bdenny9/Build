# Charleston Deal Engine

Prototype of an AI-assisted CRE broker workflow, from first contact to commission, on Charleston County data.
Independent prototype by Brook Denny, not affiliated with Buildout.

**Stack:** Next.js 14 (App Router) on Vercel · Supabase Postgres + Auth (anonymous) + Edge Functions · Anthropic API (server-side only).

## Run it

```bash
cp .env.example .env.local     # NEXT_PUBLIC_DATA_MODE=mock runs with no backend
npm install
npm run dev                    # http://localhost:3000
npm test                       # deterministic math tests
npm run typecheck
```

Switch to the real backend with `NEXT_PUBLIC_DATA_MODE=supabase` plus the two public Supabase variables.

## Layers

| Layer | Where | Rule |
|---|---|---|
| Pages | `app/` | Thin. Load data, hand it to components. |
| Components | `components/` | Display only, modeled on Buildout's app UI: list, map and detail panes, icon tabs, striped label/value rows. Every number is wrapped in `<Cite>` with its source. |
| Hooks | `hooks/` | `useAnalysis` fetches comps + rate, then runs all calcs in one place. |
| Deterministic math | `lib/calc/` | Loan, value, scoring, payout, code evals. Pure, tested, no AI. |
| Data access | `lib/data/` | One `DataProvider` interface. `mock` and `supabase` implementations. |
| Supabase client | `lib/supabase/` | Anon key only. Each visitor is an anonymous user so RLS isolates their rows. |
| Schema | `supabase/migrations/` | Snapshot tables (read-only) + per-visitor workflow tables (RLS). |

The UI never calls Anthropic or Zoneomics directly. Those keys live only in Supabase function secrets.

## Edge Functions (`supabase/functions/`)

Deployed with `verify_jwt` off; each function checks the caller itself. Keys live only in function secrets
(`ANTHROPIC_API_KEY`, `ZONING_API_KEY`, optional `ZONEOMICS_DAILY_CAP`, `ZONEOMICS_BASE_URL`, `GLOBAL_DAILY_CAP`).
Visitor calls are capped per user per day and globally (`fn_usage`, `bump_usage()`).

| Function | Caller | Request | Response | Notes |
|---|---|---|---|---|
| `serve-leads` | visitor | `{ count }` | `{ leads, remaining }` | Unseen candidates, strongest signals first. Calls `lookup-zoning` for new PIDs. |
| `lookup-zoning` | service / visitor | `{ pids }` | zoning rows | Zoneomics `zoneDetail` by lat/lng, cached by PID forever, 25 paid calls/day, no jurisdiction guessing. |
| `draft-outreach` | visitor | `{ pid }` | `{ text, check }` | Lead record only. Numbers not in the record fail the check (one retry). Cached. |
| `generate-copy` | visitor | `{ pid, kind, plant_errors, regenerate? }` | asset | Claude returns JSON claims only. Code checks run server-side and are stored. Cached per kind. |
| `judge-copy` | visitor | `{ asset_id }` | `{ result, verdicts }` | Judges the stored asset against the server-side record. Stored on the asset. |
| `run-evals` | service | `{ case_ids, run_id? }` | run + metrics | Golden set (`golden_cases`), max 6 cases per call; pass `run_id` to continue a run. |

Skill specs, rules-vs-model decisions, the quality bar, release process, guardrails and rollback plan: [`docs/AI_SKILLS.md`](docs/AI_SKILLS.md).
Release gate: `python3 scripts/release_gate.py --baseline <run> --candidate <run> [...]`. Kill switch: set the `AI_PAUSED` function secret to `true`.

Approval goes through `approve_asset()`, which refuses unless every code check and the judge passed. Visitors cannot write `assets` directly.
Code checks live in `supabase/functions/_shared/checks.ts` and are imported by both the functions and the browser.

## One-time data load (service role, run locally)

```bash
pip install shapely
python3 scripts/fetch_snapshot.py snapshot      # public sources only, writes snapshot/*.json
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_... python3 scripts/load_snapshot.py snapshot
```

`fetch_snapshot.py` reads `GIS_VIEWER/External_GIS_Website/MapServer` on `gisccapps.charlestoncounty.org`:

1. Parcels: layer 7, class codes 200, 304, 500, 530, 580, 630, 650, 700 (250, commercial condo, is excluded because units share one footprint). Interior point of the polygon for lat/lng.
2. Address: layer 1 by PID, else address points inside the parcel from the city layers (30 Charleston, 43 North Charleston, 27 Mount Pleasant).
3. Footprints: layer 61 by PID, summed 2025 area, percent change against the summed previous area.
4. Jurisdiction: layer 19 municipal boundaries, else unincorporated county.
5. Flood zone: layer 36 current FEMA flood data, point query per parcel.
6. Other parcels: countywide count of parcels with the same `OWNER1`.
7. Rates: FRED `DGS10` daily CSV averaged by month.
8. `is_lead_candidate`: has address, footprint and sale; sale between $10,000 and $50M; owner not government, institutional, religious or a national chain.
9. `simulated_signals`: 0 to 2 mock signals per lead candidate, deterministic by PID.

Comps (`get_comps`) treat parcels sharing a sale date, price and owner as one deed and sum their footprints.

## Deploy

- **Supabase:** run the migration, enable Anonymous sign-ins, `supabase secrets set ANTHROPIC_API_KEY=... ZONING_API_KEY=...`, deploy functions.
- **Vercel:** import the repo, set `NEXT_PUBLIC_DATA_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## UI notes

- Map: Leaflet (free, no key) with OpenStreetMap standard tiles and a USGS National Map imagery toggle (public domain, no key). Keep the attribution on screen. No Google, Esri or CARTO (CARTO basemaps now require an API key). OSM tiles are fine for a demo under the OSM tile usage policy; move to a hosted tile plan if traffic grows.
- Photos: each row has a photo slot (`components/ui/Thumb.tsx`). In the build, fill it server-side with a Street View Static or county aerial image so no key reaches the browser.
- Owner contacts are intentionally not faked. The Ownership tab stops at the public record and points to Buildout’s owner lookup.

## Known gaps, on purpose

- Building size is footprint only; stories are not estimated.
- No portfolio or bulk deals.
- Assessor property card is linked by PID, not scraped.
- Golden-set numbers in the eval panel are placeholders until `eval_runs` exists.
