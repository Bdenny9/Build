# Charleston Deal Engine: Product Requirements

| | |
|---|---|
| Status | Draft v1, written against the mock-mode prototype in this repo |
| Owner | Brook Denny |
| Last updated | 2026-11-11 |
| Data as of | 2026-11-10 (`AS_OF` in `lib/calc/constants.ts`) |

Independent prototype. Not affiliated with Buildout.

---

## 1. Summary

Deal Engine runs one commercial real estate broker's workflow end to end on real Charleston County public data: find an owner who might sell, make the case for selling, log the outreach, win the listing, produce marketing copy, and calculate the commission at close.

AI does two jobs: drafting outreach and drafting listing copy. Code does everything else, including every number, the lead score, buyer targeting and the payout. Every figure on screen cites its source. Generated copy has to pass code checks plus one LLM judge before a broker can approve it.

The prototype runs fully in mock mode today. This PRD covers what the real build needs: the Supabase backend, the data load, the AI edge functions and the eval loop.

## 2. Problem

A CRE broker's pipeline starts with a cold question: who owns property that could trade soon, and what do I say to them? Answering it today means stitching together the county assessor, GIS footprints, FEMA maps, zoning and rate history by hand. Then the broker writes marketing copy where one overstated claim (an invented cap rate, a "steps from" location claim, a fair-housing phrase) is a liability.

Generic AI tools make the second problem worse. They write fluent copy with no link back to the record.

## 3. Users

| User | Need |
|---|---|
| **Producing broker** (primary) | A short, ranked list of owners worth calling, a defensible reason to call each one, and copy they can publish without rewriting. |
| **Reviewer / hiring audience** (secondary) | Can open the deployed URL anonymously and walk the full flow in under 5 minutes, and can see why each AI output can be trusted or why it was blocked. |

## 4. Goals and non-goals

### Goals

1. **G1. One continuous flow.** Prospect → Outreach → Listing → Payout works on real county parcels with no dead ends.
2. **G2. Every number is traceable.** Each figure is either a source field or calculated in code from cited inputs, and is wrapped in `<Cite>`.
3. **G3. AI output is gated.** No generated copy can be approved unless all code checks and the judge pass. Code checks cannot be overruled.
4. **G4. Safe to share publicly.** Anonymous visitors, isolated by RLS, with no API key reaching the browser and with per-user rate limits on paid calls.
5. **G5. Measurable prompt quality.** A labeled golden set and an `eval_runs` table. A prompt version ships only if no score drops.

### Non-goals (v1)

- Owner contact data (phones, emails, officers). The Ownership tab stops at the public record on purpose.
- A trained likely-to-sell model. The score is transparent rules.
- Sending email or mail. Approving an outreach draft only logs the touch.
- Portfolio or bulk deals, multi-broker teams, or real user accounts.
- Building size beyond footprint. Stories are not estimated.
- Markets outside Charleston County.

## 5. Product principles

These are requirements, not preferences. Each one is enforced somewhere in code.

| Principle | Enforced in |
|---|---|
| Math is deterministic, pure and tested. No AI in loan, value, score, buyer ranking or payout. | `lib/calc/*`, `calc.test.ts` |
| The model returns structured `Claim[]` JSON, never free text. Each claim names a `source` and, if it states a number, the `numeric` field so code can recompute it. | `types/domain.ts`, `generate-copy` |
| Simulated signals are labeled everywhere and never reach buyer-facing copy. | `Simulated data guard` check, `tag sim` UI |
| Zoning at `jurisdiction_default` precision is never presented as verified and never used in buyer copy. | `Zoning.precision`, `templateClaims` |
| The UI never calls Anthropic or Zoneomics. Keys live only in Supabase function secrets. | `lib/data/supabase.ts` calls edge functions only |
| Assumptions are visible and editable where used. | `ASSUMPTIONS`, `Cite source="assume"` |

## 6. User journey

```
Prospect ──► Outreach ──► Listing won ──► Marketing copy ──► Approved ──► Sold ──► Payout
(serve-leads)  (draft-outreach)            (generate-copy + checks + judge-copy)     (computePayout)
```

Lead status moves through `New → Contacted → Conversation → Meeting → Listing pitch → Listing won → Sold`. Some transitions are automatic (first logged touch sets `Contacted`; "Won the listing" sets `Listing won`; "Mark as sold" sets `Sold`). The broker can set any status by hand, and each change is logged as a `Status` activity.

## 7. Functional requirements

Status key: **Mock** = works in mock mode today. **Backend** = UI exists, needs the Supabase or edge function piece. **New** = not started.

### 7.1 Prospect (`/prospecting`)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| P1 | "Generate 5 leads" serves five lead-candidate parcels this visitor has not seen. | No PID is served twice to the same user. `remaining` counts down. Button reads "Pool exhausted" at 0. | Mock / Backend (`serve-leads`) |
| P2 | Served leads persist across reloads. | Reload shows the same list in serve order with current statuses. | Mock / Backend |
| P3 | List, map and detail panes stay in sync. | Clicking a row or a pin selects the lead. The map fits all pins when the list changes and pans (no zoom jump) on selection. | Mock |
| P4 | Filters: location text, property type, owner type (LLC/company, trust, absentee). | Filters apply to both list and map. Empty state explains no matches. | Mock |
| P5 | Row quick tags: Loan due (estimated maturity within ±18 months), Absentee, N simulated, non-New status. | Computed from the row alone with no fetch. | Mock |
| P6 | Summary tab: type, footprint, lot, footprint change, last sale, zoning, permitted uses, max FAR, flood zone, jurisdiction, simulated signals. | Every value cited. Unverified zoning shows "Jurisdiction default, not verified" or "Not fetched". | Mock |
| P7 | Ownership tab: owner, owner type, owner-occupancy guess, mailing address, associated parcels. | Points to an external owner lookup for contacts. No fabricated contact data. | Mock |
| P8 | Opportunity tab: score, level, every rule with points, "Why now" paragraph, and the loan and equity table. | Inputs in §8.1. Simulated rules carry a Simulated tag. | Mock |
| P9 | Comps tab: same class, nearest, sold in the last 3 years, at least $10,000, footprint > 0. Median $/SF. | Fewer than 3 usable comps shows "Thin sample". | Mock / Backend (`get_comps`) |
| P10 | County record link opens the assessor page for the PID. | Opens in a new tab. | Mock |
| P11 | Row photo from Street View Static or county aerial, fetched server-side. | No image key in the browser. Fallback to the class icon. | New |
| P12 | Bulk select acts on checked rows (status change, add to pipeline). | Checkbox and "Add to pipeline" icon do something or are removed. | New (UI is a stub today) |

### 7.2 Outreach (Activity tab)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| O1 | Log a Call, Email or Note. | Appears at the top of the log with date. First non-status touch on a `New` lead sets `Contacted`. | Mock / Backend |
| O2 | Status selector logs each change as a `Status` activity. | | Mock / Backend |
| O3 | Follow-up rule: next touch `followUpDays` (7) after the last non-status activity. | Date shown. No notification in v1. | Mock |
| O4 | AI outreach draft from `lead_view` fields only. | Prompt contains no simulated signals, no owner contacts and no invented figures. Every number in the draft must exist in the lead record or the analysis. Tagged "AI draft". | Backend (`draft-outreach`) |
| O5 | "Approve and log as sent" logs an Email activity. Nothing is sent. | | Mock |

### 7.3 Listing and marketing (`/listings`, `/listings/[pid]`)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| L1 | "Won the listing" creates the listing, logs it and opens the workspace. | Listing appears in `/listings`. | Mock / Backend |
| L2 | Four asset kinds: description, highlights, mailer, email promo. | Each renders from `Claim[]`. Hovering a phrase shows its source. | Mock / Backend (`generate-copy`) |
| L3 | Code checks run on every asset: Groundedness, Number match, Banned language, Simulated data guard. | Logic in `lib/calc/evals.ts`. Any failure blocks approval. | Mock |
| L4 | One LLM judge per asset: does each claim overstate its source? | Returns a `CheckResult` with `kind: 'llm'`. If the judge errors, the asset stays blocked. | Backend (`judge-copy`) |
| L5 | Approve for publishing only when every check passes. Records `approved_at`. | Approved state survives reload. | Mock (approval state is lost on reload today; see §11) |
| L6 | "Plant errors" demo toggle adds a location claim with no source, a 6.8% cap rate with no NOI, and a simulated signal. | All three are caught: Groundedness, Number match, Banned language, Simulated guard and the judge all fail. | Mock / Backend |
| L7 | Buyer profile: rule-based buyer types from zoning, type, acreage, FAR and flood zone. | No AI in ranking. | Mock |
| L8 | Eval panel shows golden-set scores by prompt version. | Reads from `eval_runs`. Placeholder numbers removed. | New |
| L9 | Reuse a stored asset instead of regenerating on every tab switch. | Switching tabs and back makes no new model call unless the broker asks to regenerate. | New |

### 7.4 Close and payout (`/payout`)

| ID | Requirement | Acceptance criteria | Status |
|---|---|---|---|
| C1 | Mark a listing sold with price (defaults to the comp value estimate), close date, commission %, broker split % and co-broker toggle. | Writes a `deals` row and sets status `Sold`. | Mock / Backend |
| C2 | Payout waterfall: gross = price × rate; listing side = gross ÷ 2 if co-broker; net = listing side × split; house = the remainder. | Covered by `calc.test.ts` ($2M, 5%, 70%, co-broker → $35,000 net). | Mock |
| C3 | Stats: closed deals, closed volume, net commission, pending listings. | | Mock |
| C4 | Choose which pending listing to close when there is more than one. | Today only the first is offered. | New |

## 8. Calculations (deterministic)

All in `lib/calc/`. Defaults live in `ASSUMPTIONS` and `TYPES`.

### 8.1 Loan estimate

- Principal = last sale price × LTV (0.65).
- Original rate = 10-year Treasury for the sale month (FRED `DGS10`, nearest month on or before) + spread by type (1.75 apartments to 3.0 hotel).
- 25-year amortization, 10-year term. Balance after the payments made since the sale, capped at the amortization length.
- Maturity = sale date + 120 months. Refi rate = today's 10-year (4.2) + spread.

### 8.2 Value estimate

- Median of comp sale price ÷ comp footprint SF, times subject footprint SF.
- Comps under $10,000 or with no footprint are dropped. Fewer than 3 usable comps is flagged thin.

### 8.3 Sellability score

| Rule | Points | Source |
|---|---|---|
| Held ≥ 7 years | 2 | Parcel |
| Absentee owner (mailing state ≠ SC) | 1 | Parcel |
| Estimated maturity within ±18 months | 2 | Calc |
| Estimated equity ≥ 40% of value | 2 | Calc |
| Refi rate − original rate ≥ 1.5 pts | 1 | Calc |
| Footprint changed since last survey | 1 | Footprints |
| Each simulated signal | 1 | Simulated |

Score ≥ 7 is a Strong opportunity, 4 to 6 is Moderate and under 4 is Watch list.

### 8.4 Payout

See C2.

## 9. AI features and guardrails

| Function | Input | Output | Guardrails |
|---|---|---|---|
| `draft-outreach` | `{ pid }`. Loads `lead_view` and analysis server-side. | `{ text }` | No simulated signals in the prompt. No owner contacts. Draft only, human approves. |
| `generate-copy` | `{ pid, kind, plant_errors }` | `{ id, claims: Claim[], prompt_version }` | JSON claims only, validated against the `Claim` schema before insert. Only fields from the listing record. No zoning unless `precision = 'parcel'`. Stored in `assets` with the prompt version. |
| `judge-copy` | `{ claims }` | `CheckResult` | One call with a fixed rubric: does each claim overstate its source? Cannot pass anything the code checks failed. |
| `lookup-zoning` (not AI) | `{ pid, lat, lng }` | zoning row | Internal only. Fixes in README (output fields, lat/lng, FAR from `controls.far_standard`, whole-word STR match, jurisdiction fallback stored as `jurisdiction_default`). Cached by PID so credits are spent once. |

All edge functions:
- require the caller's Supabase JWT,
- enforce a per-user rate limit (proposal: 20 lead serves, 40 generations and 40 judge calls per user per day, with a global daily cap as a backstop),
- never return or log a key,
- return a clear error the UI can show instead of hanging.

### 9.1 Evals

- **Code checks** (every asset, in the browser): groundedness ratio, number match ratio, banned language regex, simulated guard.
- **Golden set**: about 30 parcels × 4 asset kinds, with labeled pass/fail and overstated claims. Includes planted-error cases.
- **`eval_runs` table**: `prompt_version`, `run_at`, grounded %, numbers %, judge agreement % with human labels, banned hits.
- **Release rule**: a new `prompt_version` ships only if no metric drops against the current one.

## 10. Data

| Dataset | Source | Load |
|---|---|---|
| Parcels | Charleston County GIS `MapServer/7`, class codes listed in the README, whitespace trimmed | One-time, service role |
| Footprints | `MapServer/61` by PID, summed area, percent change | One-time |
| Flood zone | FEMA, via the existing Docker job | One-time |
| 10-year Treasury | FRED `DGS10`, monthly average | One-time, refresh monthly |
| Zoning | Augur (Zoneomics), on demand per served lead | Cached in `zoning_cache` |
| Simulated signals | Seeded mock text, lead candidates only | One-time |

`is_lead_candidate` is false for institutional or government owners and for sales under $10,000. Schema and RLS are in `supabase/migrations/0001_init.sql`.

## 11. Known issues to resolve before or during the build

Found while reading the prototype against this spec.

1. **Class code 250.** The README load step includes code 250, but `ClassCode`, `TYPES` and the `parcels` check constraint do not. Decide whether to add it (with label and spread) or drop it from the load.
2. **Hard-coded date in `get_comps`.** The SQL uses `date '2026-11-10'`. Use `parcels.data_as_of` or a parameter so a data refresh does not silently shift the comp window.
3. **Regeneration cost.** `ListingWorkspace` calls `generateAsset` on every tab switch and every Plant-errors toggle, so each one is a new model call and a new `assets` row. See L9.
4. **Approval is not reloaded.** Approved state is held in component state. On reload, the asset regenerates and approval disappears even though `approved_at` was written. See L5.
5. **Simulated signals count toward the score.** Each simulated signal adds a point, so a mock signal can lift a lead from Moderate to Strong. Either exclude them from the score or show the score with and without them.
6. **"Why now" is tagged "AI draft" but is a code template.** Either relabel it or move it behind `draft-outreach`.
7. **`deal_view.type_label` returns the class code**, while the mock returns the label. `ClosedDeals` handles both. Pick one.
8. **Mock Treasury rates are annual averages**, while the real table is monthly. Fine for mock. Note it in the UI tooltip.
9. **Absentee means out-of-state only.** An owner mailing from Columbia, SC counts as local. Consider comparing the mailing city or ZIP against the property.
10. **Number match uses exact equality.** That works for integers. Rounding rules need to be defined for acreage and $/SF so the model and the check agree.
11. **Anonymous auth can be farmed** for more rate-limit budget. The global daily cap in §9 is the backstop. Consider CAPTCHA on first sign-in.
12. **Stubs in the UI:** bulk select, "Add to pipeline" icon, "Associated properties" link (P12).

## 12. Success criteria

| Metric | Target |
|---|---|
| Full flow walkthrough, cold visitor, deployed URL | ≤ 5 minutes, no errors |
| Figures on screen wrapped in `<Cite>` | 100% |
| Golden set: groundedness / number match | 100% / 100% |
| Golden set: judge agreement with human labels | ≥ 90% |
| Planted errors caught | 100% of planted claims block approval |
| Simulated signals in approved buyer copy | 0 |
| API keys in the client bundle | 0 (grep the build output) |
| p95 time: serve 5 leads (zoning cached) / generate one asset | < 3 s / < 8 s |

## 13. Build plan

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M0. Prototype** (done) | Mock provider, all four stages, calc tests | `npm test` and `npm run typecheck` pass in mock mode |
| **M1. Spec fixes** | Resolve §11 items 1 to 7 that touch schema or types | Migration and types agree. Decisions recorded here. |
| **M2. Data load** | Parcels, footprints, FEMA, rates, candidate flag, seeded signals | Row counts and spot-checked PIDs match the county record |
| **M3. Backend** | Run migration, anonymous auth, `serve-leads`, `lookup-zoning`, rate limits | `NEXT_PUBLIC_DATA_MODE=supabase` runs Prospect and Outreach end to end. A second anonymous user sees none of the first user's rows. |
| **M4. AI functions** | `draft-outreach`, `generate-copy`, `judge-copy`, asset reuse (L9), approval reload (L5) | Planted errors are blocked. Clean copy passes and can be approved. |
| **M5. Evals** | Golden set, `eval_runs`, eval panel reads real data (L8) | Current prompt version has a recorded baseline |
| **M6. Deploy and polish** | Vercel, server-side photos (P11), stub cleanup (P12), multi-listing payout (C4) | §12 targets met on the deployed URL |

## 14. Open questions

1. Should the score shown to brokers include simulated signals at all? (§11.5)
2. What are the per-user and global daily caps, given Anthropic and Zoneomics budgets?
3. Is a reset button wanted, so a visitor can clear their served leads and start over?
4. Which image source for photos: Street View Static (cost, key) or county aerial (free, lower appeal)?
5. Who labels the golden set, and what counts as "overstates"? A written rubric is needed before M5.
