# Shadow Pricing Benchmark

This PR adds an offline, shadow-only benchmark for historical Wade Home Services completed-job pricing. It does not select, deploy, or connect a Production pricing model.

## Verified Scope

- Source: authorized Google Sheets `ML Data` worksheet, read only.
- Target: `final_completed_price`, mapped from the historical completed-job amount when valid.
- Interpretation: the target reflects historical WHS completed-job pricing behavior, not optimal price, profit, close probability, or customer willingness to pay.
- Runtime boundary: command-line tooling only; no public API route, page, estimator flow, upload path, authentication rule, or Production environment value is changed.

## Read-Only Access

The live command uses the Google Sheets `spreadsheets.readonly` OAuth scope and calls only `spreadsheets.values.get`. It does not call update, append, batchUpdate, clear, delete, or write methods.

Credentials are loaded from the process environment only for the benchmark run. The command does not create `.env` files, print secret values, or persist credentials.

## Feature Allowlist

Only estimate-time structured fields are eligible:

- estimate month and year
- service type
- city or service region
- distance tier
- estimated load count
- planned workers
- stairs
- carry distance
- heavy-items flag
- demo-required flag

## Leakage Exclusions

The benchmark excludes post-quote, outcome, identity, and sensitive fields:

- final completed price except as the target
- actual loads, labor, disposal, direct costs, gross margin, completed status/date, won/lost status, accepted price, manager overrides, and loss/cancel reasons
- customer name, phone, email, address, free-text notes, photo references, raw prompts, and raw model responses

## Deterministic Tiers

The tiering function uses only pre-quote structured fields:

- `small_routine`: no load, worker, stair, carry, heavy-item, or demo signal requiring escalation
- `mid_tier`: one-load or operational-complexity jobs
- `large_project`: multi-load or larger-crew jobs
- `special_risk_manual_review`: demo plus heavy, larger crew, or multi-load signals

Large and special-risk jobs remain candidates for component pricing and manager review. No tier classifier is trained.

## Benchmarks

The command evaluates these candidates with aggregate metrics only:

- global historical median
- deterministic job-tier median
- comparable-job retrieval
- Huber regression
- regularized quantile regression

Elastic Net is intentionally omitted for this pass because it would add another statistical implementation without changing the shadow-only decision gate.

## Evaluation

Rows are sorted by estimate date. Each fold trains only on earlier rows and evaluates on the next contiguous holdout block. Preprocessing is fit within each fold.

Reported metrics:

- MAE
- median absolute error
- RMSE
- mean absolute percentage error
- underpricing frequency
- total underpricing dollars
- large-underquote frequency
- quantile coverage where applicable

No raw rows, row-level predictions, reversible row identifiers, customer details, notes, photos, prompts, model responses, or secret values are printed or committed.

## Decision Policy

The command returns one of:

- `NO_MODEL_READY`
- `SHADOW_MODEL_READY`
- `CANDIDATE_FOR_INTERNAL_REVIEW`

Any result is advisory for internal review only. Production promotion requires a separate approved PR, larger validated completed-job data, champion-versus-challenger review, time-aware holdout performance, human approval, monitoring, and rollback.

## Run Command

```bash
npm run benchmark:shadow-pricing
```

The command fails closed when credentials are unavailable or the configured source is not the approved historical benchmark worksheet.
