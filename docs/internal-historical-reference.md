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
No outcomes, notes, photos or model output are sent to the reference endpoint.

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

## Deferred read-only provider

No Google API client or credentials are introduced into this runtime feature.
There are zero Sheet reads/writes and no historical rows cached or shipped. A live
provider is deliberately blocked until a documented crosswalk supports meaningful
comparison; it cannot be enabled by request fields or browser-supplied flags.

The follow-up must reuse the existing strict adapter/read-only scope, but not the
offline full-Sheet fetch on every submit. Require a server-only provider with an
explicit maximum range/row cap (reject truncation), verified spreadsheet/tab/GID,
timeout, no automatic retry, process-private sanitized-record cache with bounded
TTL, single-flight refresh and short negative cache. Never use public/CDN caching;
responses remain private/no-store. Retrieve only after comparison prerequisites
pass. No Vercel environment changes or credential copying are part of this PR.

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

19 focused tests passed (9 reference matching/auth/privacy/failure tests and 10
historical-adapter tests). Typecheck passed. The local Edge/Playwright smoke passed
with synthetic analyze responses: real endpoint abstention, synthetic matched
display at 1280px/390px, no horizontal overflow or page errors, and a simulated
historical failure leaving the quote/customer message unchanged. Screenshots were
visually reviewed. Synthetic images must meet the existing 1280px optimizer
minimum; smaller test images were rejected by unchanged upload code.

The route sets private/no-store; the existing proxy's no-store header is the
observed effective response header. No credentials or live datasets were used.
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
