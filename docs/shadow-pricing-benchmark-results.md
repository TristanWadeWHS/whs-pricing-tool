# Shadow Pricing Benchmark Results

## Corrected Read-Only Run

Executed once at 2026-09-05T08:42:22.362Z after 13 targeted tests and typecheck
passed. Google authentication and the read succeeded; the authorized worksheet
GID was verified. Evaluation correctly returned `blocked` due to eligibility.
No provider error occurred and no retry was made.

Source code: c272da080e0009b90a847f757839bb4001ffe3af plus the methodology-v2
working-tree changes committed with this report. Feature version shadow-pricing-v2;
target version canonical-final-completed-price-v2. No source rows were retained.

| Aggregate | Corrected result |
| --- | ---: |
| Returned non-empty records | 70 |
| Eligible canonical date/target records | 0 |
| Excluded records | 70 |
| Missing/invalid canonical estimate_date | 70 |
| Missing/invalid canonical final_completed_price | 70 |
| Missing/invalid tier inputs | 70 |
| Folds / holdout / matching evaluated records | 0 / 0 / 0 |

Blocker counts overlap; they do not represent 210 separate rows. These checks
do not prove that legacy values are absent or wrong, only that the canonical
provenance contract was not met. We did not reinterpret legacy values to force
eligibility. Eligible date coverage and fold boundaries are unavailable.

| Eligible tier | Eligible | Holdout | Matched | All candidate error metrics |
| --- | ---: | ---: | ---: | --- |
| Small/routine | 0 | 0 | 0 | null |
| Mid-tier | 0 | 0 | 0 | null |
| Large/project | 0 | 0 | 0 | null |
| Special review | 0 | 0 | 0 | null |
| Unknown inputs | 0 | 0 | 0 | null |

Deterministic tier median, comparable retrieval and Huber each evaluated zero
matching records. MAE, RMSE, below-historical-price frequency and summed
historical-price shortfall are all null, not zero. The diagnostic global median
also has zero observations and null metrics. No model-level abstentions were
reached because all source rows were excluded before fold construction.
Quantile regression is unavailable; corrected coverage is null. No baseline
or statistical challenger can be ranked. Decision: **NO_MODEL_READY**.

Next action requires human validation of historical estimate-time and
completed-revenue provenance, followed by separately authorized canonical data
entry or an explicitly documented, reviewed legacy mapping. Sufficient
validated outcomes and per-tier holdouts are required before another benchmark.
This run made no Sheet writes, data repairs, model connection, or Production
changes. Output was aggregate/redacted; no credentials, customer data or
row-level predictions were printed or persisted. No dependencies changed.

## Archived V1 Results: Invalid Evidence

**SUPERSEDED: all original metrics and rankings in this section are invalid methodology evidence.**
The original run had ambiguous legacy mappings, date-boundary overlap risk,
missing-value coercion, pooled tiers, and a defective quantile fitter. Its
7.50% coverage cannot establish genuine calibration quality. Original values
are retained only as an archived experiment, not evidence for model selection.
"Underpricing" in the archived table means below historical charged price,
not proven economic underpricing. Corrected results appear above.

Generated from one authorized read-only benchmark run on 2026-09-05.

## Dataset

- Returned rows: 70
- Eligible completed-price rows: 70
- Date coverage: 2025-10-25 to 2026-06-01
- Target: `final_completed_price`
- Target meaning: historical WHS completed-job pricing behavior, not optimal price, profit, acceptance probability, or customer willingness to pay

## Tier Distribution

- `small_routine`: 44
- `mid_tier`: 18
- `large_project`: 5
- `special_risk_manual_review`: 3

Large and special-risk segments are too small for automated Production pricing and remain manager-review/component-pricing candidates.

## Evaluation

- Method: time-aware expanding blocked holdout
- Folds: 4
- Evaluated holdout rows per benchmark: 40
- Fold rule: every fold trains only on rows earlier than the contiguous holdout block

| Benchmark | MAE | Median Abs Error | RMSE | MAPE | Underpricing Frequency | Total Underpricing Dollars | Large Underquote Frequency | Quantile Coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Global historical median | 600.75 | 87.50 | 2229.36 | 56.09% | 42.50% | 22295.00 | 17.50% | n/a |
| Deterministic job-tier median | 519.00 | 100.00 | 2179.64 | 51.10% | 42.50% | 18835.00 | 15.00% | n/a |
| Comparable-job retrieval | 465.52 | 52.06 | 1944.68 | 35.59% | 52.50% | 17617.33 | 17.50% | n/a |
| Huber regression | 406.01 | 39.01 | 2140.08 | 28.38% | 30.00% | 14290.52 | 2.50% | n/a |
| Regularized quantile regression | 599.30 | 86.69 | 2228.66 | 55.73% | 50.00% | 22249.85 | 17.50% | 7.50% |

## Benchmark Interpretation

- Best deterministic/statistical baseline: `comparable_job_retrieval`
- Best statistical challenger: `huber_regression`
- Decision: `NO_MODEL_READY`

Although Huber regression produced the lowest aggregate MAE in this small shadow run, the data volume remains too small for Production ML selection. The quantile benchmark also showed poor interval coverage, and large/special-risk segments have very limited sample counts.

## Feature Allowlist

- `estimate_month`
- `estimate_year`
- `service_type`
- `city_service_region`
- `distance_tier`
- `estimated_load_count`
- `planned_workers`
- `stairs`
- `carry_distance`
- `heavy_items`
- `demo_required`

## Leakage Exclusions

- `actual_load_count`
- `actual_labor_hours`
- `actual_disposal_cost`
- `direct_job_cost`
- `gross_margin`
- `won_job`
- `completed_status`
- `completed_date`
- `accepted_price`
- `manager_override`
- `loss_or_cancel_reason`
- `customer_name`
- `phone`
- `email`
- `address`
- `notes_free_text`
- `photo_references`
- `raw_prompts`
- `raw_model_responses`

## Privacy Verification

- Raw rows returned: no
- Row-level predictions returned: no
- Reversible row hashes returned: no
- Secret values returned: no
- Sheet writes performed: no

## Required Next Data

Before any Production model decision, collect materially more validated completed-job outcomes with stable estimate-time fields, final completed prices, manager-review labels, and enough examples for large and special-risk jobs to support reliable segmented holdout evaluation.
