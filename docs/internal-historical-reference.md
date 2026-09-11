# Internal historical reference: Preview-only scaffold

Stacked on draft PR #6, `codex/shadow-pricing-benchmark`, reviewed at
`ed53bdbebc92121948ae87278783b37c742a73bc`. This must not merge independently
into main. NO_MODEL_READY remains in effect.

## Focused review

The historical adapter keeps Amount as final completed price, Date as completion
date, and Workers/Actual Loads as outcomes. Blank, invalid and conflicting values
remain distinct; equivalent normalized completion-date aliases resolve without
inventing estimate dates. Segments remain retrospective only. Percentiles use
linear interpolation at `(n - 1) * p`; segment boundaries are mutually exclusive.
No material correction was identified in these relevant calculations/mappings.
No new dataset counts, findings or model rankings were produced.

## What is implemented and what is blocked

An authenticated, independent panel follows a successful estimate. Its endpoint
uses the existing shared internal-token access policy, not a newly invented owner
role. It is enabled only for Vercel Preview/local development. A failure or timeout
does not change the calculated price, quote status, customer message or safeguards.
Only stairs and the projected load count are sent to the reference endpoint, not
prices, outcomes, notes, photos or free-text model output.

Only stairs has a supported crosswalk: none means false, some/heavy mean true.
Historical projected loads have no verified common trailer-capacity unit. Carry is
ordinal; app carry labels have no verified crosswalk. Heavy-debris risk does not
prove the historical heavy-material flag. Demo debris is not demolition-required.
There is no verified shared scope/service grouping. Therefore **every real request
currently abstains**, before any data retrieval. Stairs alone must not pool jobs.
The matched display/matcher is verified with synthetic data only. This is a safe
Preview scaffold, **not a completed live-comparables integration**.

The pure matcher requires a verified shared scope group and load unit, exact
projected loads, and all three binary characteristics. It never sees the new
estimate price, actual crew/loads, profit, identities or price buckets. Missing
inputs cause abstention; unrelated/special scope groups are not pooled. At least
five matched records with positive finite completed prices are required; below
ten is flagged as a small sample, not statistical confidence. Counts mean matched
priced records. Summaries use interpolated p25/median/p75, rounded to cents.
Prices may include added scope; before-quote timing remains unverified. These are
descriptive references, never confidence intervals or predictive accuracy claims.

## Verified mapping contract

| Current field | Historical field | Status / use |
| --- | --- | --- |
| inputs.stairs: none / some / heavy | Stairs | Verified binary false / true / true; missing stays missing |
| analysis.estimatedLoadCount | Estimated Loads / Projected Loads | Both projected counts; app prompt specifies 12 cubic yards, historical capacity unverified, so not comparable yet |
| inputs.carryDistance | Carry Distance | App labels versus historical ordinal 0-5; no conversion established; excluded |
| analysis.heavyDebrisRisk | Heavy Items | Risk level versus binary heavy material; no conversion established |
| inputs.jobType, analysis.materialType(s) | Demolition / service type | Debris/material descriptions do not establish demolition-required or a shared service classification |
| inputs.workers | Workers | Planned versus actual; excluded |
| None | Actual Loads, Net Profit | Actual outcomes; excluded |
| None | Amount / final_completed_price | Completed-price summary only, never match input or original quote |
| None | Date / completion_date | Completion date, never estimate time |

Before-job recording is confirmed; before-quote timing is not. General agreement
between quotes and final prices does not verify any individual original quote.
Binary encodings and aliases reuse the strict PR #6 adapter; blanks, invalids and
conflicts remain missing. No historical service/category, capacity or value is
invented. All three binary indicators and verified scope/units remain matcher
prerequisites, so current live estimates still abstain without fetching data.

## Connected read-only provider

The endpoint now connects to a lazy server-only provider behind that scope gate.
It reuses the existing Google service-account parser, read-only scope, authorized
spreadsheet/GID constants and historical adapter. A single get reads ML Data
A1:AZ2001, verifies title/GID and rejects grids exceeding 2000 data rows or 52
columns instead of silently truncating. Request timeout is 8 seconds, no automatic
Sheet retry. Raw cells are discarded after projection. Cached records contain
only supported scope values and completed price, never identities, notes, photos,
actual loads/workers or profit. They are never returned directly to the browser.

Process-private cache: five-minute TTL, single-flight refresh, 30-second failure
backoff, bounded size, no stale-on-error fallback, no disk or public/Next/CDN cache.
Expired records are dropped on the next cache access. Matching prerequisites are
checked before importing the Google SDK or loading credentials. Browser fields
cannot assert a scope crosswalk or override the source configuration.

One explicitly authorized bounded live development read passed after focused
tests/typecheck. Temporary credential bytes and environment references were
cleared; no raw rows or individual prices were logged/persisted. Its console
aggregate counters were not surfaced by the successful test runner, so no fresh
dataset-count claim is made and the read was not repeated. No model or real match
was evaluated. The opt-in source-check test is skipped in ordinary test runs.

## Preview project correction

The earlier 503 URL belonged to `whs-pricing-tool`, project
`prj_47MVBC1JhtxX9eUMWjBi7hKGZwjB`. The preserved working Production deployment
actually belongs to `whs-pricing-tool-p8kg`, project
`prj_jzzxkDJnnDt2Bu0HiJvwpmrwThPU`, in team `team_GrpmUkPfH7MfZvSZWrNEDMaJ`.
Both are linked to this repository; do not choose by similar name alone.

The latter project's Preview for 2fe2aae was READY and returned 401, Basic realm
WHS Internal Pricing Tool, and no-store. Its existing access configuration is
present. No environment values were inspected or changed, and no unnecessary
credential copy between projects was performed. Use that project's new branch
Preview after the next push. Local internal/OpenAI/Vercel credentials were not
available; live authenticated verification remains manual with Tristan's existing
internal password. Existing Google credentials were used only for the authorized
development source check, not copied to Vercel.

## Minimum outcome capture plan (no writes implemented)

| Meaning | Existing field / required follow-up |
| --- | --- |
| Stable job | `job_id`; generate once and enforce uniqueness/idempotency |
| Original quote amount | `original_quoted_price`; never backfill from Amount |
| Original quote time | canonical `estimate_date`; verify physical header and preserve immutable quote timestamp |
| Original quote scope | Existing estimate-time canonical scope fields where verified; immutable versioned scope snapshot is still required |
| Customer acceptance | `customer_accepted_price`; distinct from original quote and final price |
| Approved additions | No verified structured approval/charge event fields; propose separate versioned events keyed by job/quote ID, with scope delta, amount, approval actor/time |
| Completed price/date | `final_completed_price` (Amount), `completion_date` (Date) |
| Versions | `pricing_rule_version`, `model_version`, `prompt_version`, `data_schema_version` |
| Provenance/quality | `estimate_source`, `data_quality_status`; record field capture timestamps, not inferred before-quote status |

Next: inspect physical headers in a separately authorized task; approve minimal
schema additions/event storage, then implement authenticated/idempotent capture
with validation, audit trail and immutable quote snapshot. Never overwrite actual
Workers/Actual Loads with planned values. Define tax/tip and profit-cost semantics
before economic analysis. General quote/final-price agreement is not row evidence.

## Automated checks

Initial scaffold: 19 focused tests passed (9 reference matching/auth/privacy/failure tests and 10
historical-adapter tests). Typecheck passed. The local Edge/Playwright smoke passed
with synthetic analyze responses: real endpoint abstention, synthetic matched
display at 1280px/390px, no horizontal overflow or page errors, and a simulated
historical failure leaving the quote/customer message unchanged. Screenshots were
visually reviewed. Synthetic images must meet the existing 1280px optimizer
minimum; smaller test images were rejected by unchanged upload code.

The route sets private/no-store; the existing proxy's no-store header is the
observed effective response header. No credentials or live datasets were used in
the initial scaffold validation. This continuation passed 15 focused tests for
mapping, auth, sanitization, read-only bounds, cache expiry/backoff and failure
isolation, plus typecheck and one opt-in live source check. A cold dev compilation
initially exceeded the panel timeout; lazy-loading the provider only after scope
eligibility fixed it. The repeated synthetic smoke passed without a live read.
The browser script requires an available Playwright module and installed Edge
(or PLAYWRIGHT_CHANNEL); it is a local-only synthetic test, not a live accuracy test.

## Preview verification

Use internal Basic auth. Submit an ordinary photograph and normal job inputs.
The ordinary estimate and status must still display, followed by Historical
reference / No reliable comparison available, with scope/timing caveats. Inspect
the reference response: aggregate-only abstention, no-store. Block that
endpoint in browser developer tools and resubmit: the estimate must remain intact
and the panel must report unavailable. Unauthenticated requests must get 401 and
a Basic challenge. No live matched amounts are expected yet.

Production/rollback baseline remains `c2bd1a36cdfb283af04db0eaa32890fb1e1a8524`,
deployment `dpl_BfDLyWKSRYA8xnAzmDmhxgUyUnro`, preserved tag
`pricing-tool-schema-v2-stable-2026-09-05`. No merge, promotion or deletion authorized.
