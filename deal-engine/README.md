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

1. Parcels: county `External_GIS_Website/MapServer/7`, class codes 200, 250, 304, 500, 530, 580, 630, 650, 700; trim class code whitespace. Query directly, no proxy.
2. Footprints: `MapServer/61` by PID, sum area, keep percent change.
3. Flood zone: existing FEMA Docker job.
4. Rates: FRED `DGS10` monthly into `rates_10y`.
5. Set `is_lead_candidate` false for institutional or government owners and sales under $10,000.
6. Seed `simulated_signals` for lead candidates only.

## Deploy

- **Supabase:** run the migration, enable Anonymous sign-ins, `supabase secrets set ANTHROPIC_API_KEY=... ZONING_API_KEY=...`, deploy functions.
- **Vercel:** import the repo, set `NEXT_PUBLIC_DATA_MODE=supabase`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## UI notes

- Map: Leaflet with CARTO Voyager tiles and an Esri imagery toggle. Both need their attribution kept on screen.
- Photos: each row has a photo slot (`components/ui/Thumb.tsx`). In the build, fill it server-side with a Street View Static or county aerial image so no key reaches the browser.
- Owner contacts are intentionally not faked. The Ownership tab stops at the public record and points to Buildout’s owner lookup.

## Known gaps, on purpose

- Building size is footprint only; stories are not estimated.
- No portfolio or bulk deals.
- Assessor property card is linked by PID, not scraped.
- Golden-set numbers in the eval panel are placeholders until `eval_runs` exists.
