# Deal Engine: Skill Specs, Quality Bar and Guardrails

How each broker workflow becomes a buildable skill, how we decide rules vs model, what "good enough" means,
and what happens when a non-deterministic skill fails. Companion to `PRD.md`. Every claim here points at code.

## 1. Skill specs

One row per skill. **Trigger** is what starts it, **Reads** and **Writes** are exact tables or fields,
**Guardrail** is what stops a bad output reaching a broker or buyer, **Surface** is where it shows up.

| Skill | Engine | Trigger | Reads | Writes | Guardrail | Surface |
|---|---|---|---|---|---|---|
| **Serve leads** | Rules (SQL) | "Generate 5 leads" | `parcels` where `is_lead_candidate`, `served_leads` | `served_leads` | Visitor sees only unseen candidates; 20 calls/day; served rows writable only by the function | Prospect list + map |
| **Zoning lookup** | External API, parsed in code | New PID served | `parcels.lat/lng`, `zoning_cache` | `zoning_cache` (forever) | Cache first; 25 paid calls/day; no jurisdiction guessing (`precision='none'` instead); visitors can only look up PIDs served to them | Summary tab, Zoning row |
| **Comps + value** | Rules (SQL + math) | Detail opened | `get_comps()` (same class, 3 yrs, ≥$10K, grouped by deed) | nothing | Thin sample (<3) flagged; every figure cited | Comps tab, Opportunity tab |
| **Loan + equity estimate** | Rules | Detail opened | sale price/date, `rates_10y` (FRED), spread table | nothing | Assumptions shown and cited; labeled an estimate | Opportunity tab |
| **Sellability score** | Rules | Detail opened | hold, absentee, maturity, equity, refi gap, footprint change, simulated signals | nothing | Every rule shows points and source; simulated rules tagged | Opportunity tab |
| **Next-step recommender** | Rules (`lib/calc/nextStep.ts`) | Activity tab opened | status, score level, maturity, activity history | `activities`, `lead_status` **only after confirm** | Shows the exact write before confirm; never sends anything | Activity tab, "Next step" card |
| **Outreach draft** | LLM (`draft-outreach`) | Activity tab opened | lead record subset (no simulated signals, no contacts) | `outreach_drafts` (cache) | Every number must appear in the record (one retry, then the failed check is shown); broker approves; nothing is emailed | Activity tab |
| **Listing copy** | LLM (`generate-copy`) | Copy tab opened | buyer-safe record keyed by source; zoning only if verified | `assets` (claims, code checks) | JSON claims only, each with a source; code checks stored server-side | Listing workspace |
| **Copy judge** | LLM (`judge-copy`) | New asset | stored asset + same record | `assets.judge` | Cannot overrule code checks; a skipped claim counts as flagged; a failing re-judge withdraws approval | Checks + Judge verdicts cards |
| **Approve copy** | Rules (`approve_asset()`) | Broker clicks Approve | `assets.code_checks`, `assets.judge` | `assets.approved_at` | Enforced in Postgres: refuses unless every check and the judge pass; visitors cannot write `assets` | Approve button |
| **Buyer profile** | Rules | Buyer tab opened | zoning, type, acreage, FAR, flood zone, value | nothing | Ranking is explainable; no AI judgment | Buyer profile |
| **Payout** | Rules | Mark as sold | price, rate, split, co-broker | `deals` | Tested waterfall; no AI | Payout page |

## 2. Rules or model: how we decide

We use a model only where the task is **open-ended language** and the output can be **checked**.
Everything that is a policy, a calculation, a ranking or a lookup is code.

| Question | If yes | Examples |
|---|---|---|
| Is the right answer a policy the brokerage owns? | Rules | Next step, follow-up timing, lead score |
| Must the same input always give the same output? | Rules | Payout, loan estimate, approval |
| Is it arithmetic or retrieval over structured data? | Rules / SQL | Comps, value, lead serving |
| Would a wrong answer be invisible to the broker? | Rules, or a model **plus** a check | Numbers in copy are recomputed in code |
| Is the output free-form language a broker would otherwise write? | Model, with guardrails | Listing copy, outreach |
| Is the judgment fuzzy but checkable against a source? | Model as judge, never final | Overstatement judge, gated by code checks |

**Worked example: the next-step recommender.** It looks like an AI feature ("what should I do next?"), but the
inputs are structured (status, dates, score), the answer is the brokerage's follow-up policy, and a broker
needs to trust it line by line. A rule engine gives the same answer every time, explains itself, costs nothing
and is unit-tested (`lib/calc/nextStep.test.ts`). A model would add variance, cost and a new failure mode with no gain.

## 3. Prompt, context and retrieval design

- **Context is the record, keyed by source** (`_shared/facts.ts`): `parcel`, `foot`, `fema`, `zoning`, `comps`.
  Sections the model must not use are absent, not hidden: simulated signals and owner contacts never reach a
  copy prompt, and zoning appears only at `precision='parcel'`. A null section tells the model "does not exist".
- **Output is structured** (JSON schema): claims with `source` and a declared `numeric` field, so code can check
  grounding and recompute every figure. Free text is never accepted.
- **Retrieval is SQL, and it is evaluated too**: comps group multi-parcel deeds (the county repeats the full
  price on every parcel), drop nominal sales, and use the snapshot date for the window.
- **Every change is measured, not felt**: prompts carry a version (`PROMPT_VERSION`), every asset and eval run
  records it, and a change ships only through the release gate below. Model choice is a per-role setting
  (`GEN_MODEL`, `JUDGE_MODEL`), measured the same way.

## 4. What "good enough" means

**Golden set v2** (`golden_cases`, 39 cases on 6 real parcels, one per property type):

| Case type | Count | Expectation | Tests |
|---|---|---|---|
| clean | 12 | passes | generation quality, usefulness; 2 remove a record section (missing data) |
| injected | 19 | blocked | judge recall by category: number drift, unit swap, unsupported inference, value/demand, fair housing, wrong source, location |
| planted | 2 | blocked | the demo traps |
| true_claims | 4 | passes | judge false flags on known-true claims |
| adversarial | 2 | passes, ignoring the instruction | prompt injection through record fields |

**Release targets** (`components/evals/EvalSummary.tsx`, `scripts/release_gate.py`):

| Metric | Target | Why |
|---|---|---|
| Claims grounded, numbers match | 100% | A sourceless claim or wrong figure is a liability |
| Bad copy blocked | 100% | Every planted or injected case must end up blocked |
| Judge recall | ≥ 95% overall, reviewed per category | One weak category hides inside an average |
| Clean copy passes | ≥ 90% | False blocks waste broker time |
| Judge false flags (generated / true claims) | ≤ 5% | A jumpy judge trains brokers to ignore it |
| Usefulness (key facts stated) | ≥ 90% | Stops a model from "passing" by saying nothing |
| Ignores planted instructions, leaves out missing data | 100% | Injection and hallucination resistance |

**Stability:** every candidate runs at least 3 times. It ships only if **every** repeat passes. A single run hides
variance; we have already seen the same model and cases block 100% on one run and 95% on the next.

## 5. Release process

1. Change one thing: a prompt (bump `PROMPT_VERSION`), a model setting, or the context builder.
2. Run the golden set 3× on the candidate (`run-evals`, batches of 6, `run_id` to continue).
3. `scripts/release_gate.py --baseline <current prod run> --candidate <run1> <run2> <run3>`.
   Blocked on any missed target, any drop beyond 2.5 points, or any errored case.
4. Read the Reports page before shipping: recall by category, and the claims behind any newly failing case.
5. Ship by changing the secret or deploying the function; record the winning run id as the new baseline.
6. Adding cases bumps the golden set version (`GOLDEN_SET`); runs only compare within one set.

## 6. Guardrails

| Risk | Control | Where |
|---|---|---|
| Hallucinated facts | Claims must cite a source section; null sections; judge checks support | `copy.ts`, `checks.ts`, `judge-copy` |
| Wrong numbers | Declared figure must equal the value recomputed in code **and** appear in the sentence | `checks.ts` |
| Simulated data leaking | Never in copy prompts; `sim` source fails a code check | `facts.ts`, `checks.ts` |
| Prompt injection via data | Record fields are data; adversarial golden cases test it | golden set v2 |
| Over-permission | Anonymous users, RLS on every workflow table; visitors read only; functions write; reference data read-only | migrations 0001–0004 |
| Acting without consent | Approve copy, approve outreach, confirm next step; nothing is ever sent | UI + `approve_asset()` |
| Cost runaway | Per-user and global daily caps; caching; 25 paid zoning calls/day | `fn_usage`, `lookup-zoning` |
| Secret exposure | Keys only in function secrets; browser holds the publishable key only | `.env.example`, functions |

## 7. Rollback plan for non-deterministic failures

| Symptom | First move (minutes) | Then |
|---|---|---|
| Bad copy slipping through, or a model misbehaving | Set `AI_PAUSED=true`: every model call returns a clear message; rules and approved copy keep working | Rerun the golden set, add the failing case, fix, release through the gate |
| A new model is worse in production | Set `GEN_MODEL` / `JUDGE_MODEL` back to the last baseline's models (no deploy) | Compare runs on the Reports page |
| A prompt change regressed | Redeploy the previous function version from git (prompt is versioned in code) | Every asset records its `prompt_version`, so affected copy can be found and re-judged |
| Judge too strict or too loose | Approval is already gated by code checks; re-judge affected assets (`rejudge`) | A failing re-judge withdraws approval automatically |
| Upstream data wrong (zoning) | `zoning_cache` rows can be deleted per PID; copy ignores unverified zoning | Fix the parser; the raw response is stored for audit |
