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

## Edge Functions to build (`supabase/functions/`)

All require the caller's Supabase JWT, enforce a per-user rate limit, and never return a key.

| Function | Request | Response | Notes |
|---|---|---|---|
| `serve-leads` | `{ count }` | `{ leads: LeadRow[], remaining }` | Picks unseen `is_lead_candidate` parcels, inserts `served_leads`, calls zoning only for new PIDs not in `zoning_cache`. |
| `lookup-zoning` | `{ pid, lat, lng }` | zoning row | Internal, called by `serve-leads`. Augur function with fixes: `output_fields=zoning,plu,plu-tags,controls,gde-controls,parcels` (no `geom`), lat/lng not address, read flags from `permitted_land_uses`, FAR from `controls.far_standard`, whole-word STR match, jurisdiction fallback stored as `precision='jurisdiction_default'`. |
| `draft-outreach` | `{ pid }` | `{ text }` | Claude drafts from `lead_view` fields only. No simulated signals in the prompt. |
| `generate-copy` | `{ pid, kind, plant_errors }` | `{ id, claims: Claim[], prompt_version }` | Claude returns **JSON claims only**, each with `source` and optional `numeric`. Inserts into `assets`. `plant_errors` appends the demo trap claims. |
| `judge-copy` | `{ claims }` | `CheckResult` | One LLM judge call with a rubric: does each claim overstate its source? Code checks run in the app and cannot be overruled. |

`Claim` and `CheckResult` shapes are in `types/domain.ts`.

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

- Map: Leaflet (free, no key) with CARTO Voyager tiles and a USGS National Map imagery toggle (public domain, no key). Keep the attribution on screen. No Google or Esri services.
- Photos: each row has a photo slot (`components/ui/Thumb.tsx`). In the build, fill it server-side with a Street View Static or county aerial image so no key reaches the browser.
- Owner contacts are intentionally not faked. The Ownership tab stops at the public record and points to Buildout’s owner lookup.

## Known gaps, on purpose

- Building size is footprint only; stories are not estimated.
- No portfolio or bulk deals.
- Assessor property card is linked by PID, not scraped.
- Golden-set numbers in the eval panel are placeholders until `eval_runs` exists.
