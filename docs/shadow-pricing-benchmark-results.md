# Shadow Pricing Benchmark Results

## Current Retrospective Price Segments

Measured in one authorized read after 15 focused tests and typecheck passed.
Source version: 5cd85ff8a643c936dd95af4c47fe3ff803e82585 plus price-segments-v1
working-tree changes committed with this report. No raw snapshot was persisted.
Earlier aggregate-only checkpoints could not reconstruct these segments.

Verified returned data rows/nonempty records: 101/101; blank returned slots: 0.
Priced and descriptive-usable jobs: 101; unclassified prices: 0.
Valid date/price historical core: 101; complete-ten-field records: 92.
Paired load records: 92. Before-quote provenance remains unverified for all 101;
genuine quote-evaluation records: 0. BENCHMARK_BLOCKED_PROVENANCE / NO_MODEL_READY.

### Segment Price Distribution

| Retrospective segment | Jobs (% of 101) | Revenue (% of $71,035) | Median | Mean | P25 | P75 | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Small | 75 (74.26%) | 14695 (20.69%) | 185 | 195.93 | 130 | 250 | 80 | 450 |
| Medium | 11 (10.89%) | 7190 (10.12%) | 600 | 653.64 | 587.5 | 747.5 | 480 | 875 |
| Large | 9 (8.91%) | 13200 (18.58%) | 1350 | 1466.67 | 1200 | 1800 | 1050 | 2200 |
| Major project | 6 (5.94%) | 35950 (50.61%) | 4025 | 5991.67 | 3212.5 | 7200 | 2900 | 13800 |

All money values are dollars. Small <=450; Medium >450 to 1000; Large >1000
to 2500; Major project >2500. No commercial/residential inference is made.
Large (9) and Major project (6) are flagged small samples (<10 jobs), not given
statistical confidence claims. Percentiles use linear interpolation at (n-1)*p;
summaries round to two decimals using JavaScript Math.round (ties toward positive
infinity). Percentages may not sum exactly to 100 after rounding.

### Paired Recorded Load Discrepancy

| Segment | Paired | Unavailable | Mean projected minus actual | Mean absolute difference |
| --- | ---: | ---: | ---: | ---: |
| Small | 70 | 5 | -0.02 | 0.02 |
| Medium | 11 | 0 | -0.05 | 0.05 |
| Large | 8 | 1 | -0.12 | 0.13 |
| Major project | 3 | 3 | suppressed | suppressed |

Major project load magnitudes are privacy-suppressed because only 3 pairs exist.
The pairs are in the same memory-only retrieval. Differences are in recorded
numeric counts, not documented common trailer-capacity units, physical volume,
pre-quote prediction accuracy or confidence percentages. Missing values are not zero.

### Characteristics And Denominators

| Segment | Characteristic/outcome | Valid / segment jobs | Blank | Absent/invalid/conflict | Recorded value: count |
| --- | --- | ---: | ---: | --- | --- |
| Small | stairs | 70/75 | 5 | 0/0/0 | false: 69, true: 1 |
| Small | heavy_items | 70/75 | 5 | 0/0/0 | false: 60, true: 10 |
| Small | demo_required | 70/75 | 5 | 0/0/0 | false: 69, true: 1 |
| Small | carry_distance_ordinal | 70/75 | 5 | 0/0/0 | 0: 8, 1: 47, 2: 10, 3: 3, 4: 1, 5: 1 |
| Small | actual_workers | 70/75 | 5 | 0/0/0 | 1: 67, 2: 3 |
| Medium | stairs | 11/11 | 0 | 0/0/0 | false: 8, true: 3 |
| Medium | heavy_items | 11/11 | 0 | 0/0/0 | false: 5, true: 6 |
| Medium | demo_required | 11/11 | 0 | 0/0/0 | false: 9, true: 2 |
| Medium | carry_distance_ordinal | 11/11 | 0 | 0/0/0 | 1: 3, 2: 2, 3: 3, 4: 1, 5: 2 |
| Medium | actual_workers | 11/11 | 0 | 0/0/0 | 1: 6, 2: 5 |
| Large | stairs | 8/9 | 1 | 0/0/0 | true: 1, false: 7 |
| Large | heavy_items | 8/9 | 1 | 0/0/0 | true: 7, false: 1 |
| Large | demo_required | 8/9 | 1 | 0/0/0 | false: 5, true: 3 |
| Large | carry_distance_ordinal | 8/9 | 1 | 0/0/0 | 1: 1, 3: 2, 4: 1, 5: 4 |
| Large | actual_workers | 8/9 | 1 | 0/0/0 | 1: 2, 2: 2, 3: 4 |
| Major project | stairs | 3/6 | 3 | 0/0/0 | false: 3 |
| Major project | heavy_items | 3/6 | 3 | 0/0/0 | true: 3 |
| Major project | demo_required | 3/6 | 3 | 0/0/0 | false: 2, true: 1 |
| Major project | carry_distance_ordinal | 3/6 | 3 | 0/0/0 | 3: 2, 4: 1 |
| Major project | actual_workers | 3/6 | 3 | 0/0/0 | 3: 2, 5: 1 |

Binary frequencies use true/false; carry is ordinal and no physical units or
equal spacing are implied. Actual workers are completed-job outcomes only.
No price-selected group is used to fit a model, select a prediction baseline or
route a quote. Future routing needs verified quote-time scope/features.

### Completion-Date Diagnosis

All 101 rows have one or more blank completion-date aliases alongside a valid
populated completion date. All 101 resolve without conflicting populated dates.
Absent date-header rows: 0; all-blank rows: 0; invalid-populated-alias rows: 0;
equivalent-multiple-populated-date rows: 0; genuinely conflicting populated-date
rows: 0. Completion-date coverage: 2025-10-25 through 2026-09-09 (101 rows).
A blank alias is not a contradictory date. Invalid populated aliases still block,
and disagreeing populated dates are never arbitrarily selected. No date was
relabeled as an estimate date. No date clarification is currently necessary.

Duplicate screening assessed 101 date/price-core records and found one candidate
group of two identical mapped records (one excess record). They could be distinct
jobs; neither was removed. Earlier reports of 101 date conflicts reflect the
older blank-versus-populated policy, not evidence of conflicting populated dates.

The seven load/worker/characteristic fields each have 92 valid values and 9 blanks;
price, profit and completion date each have 101 valid values. No invalid formats
or unresolved field conflicts were counted in this read. Service-type source
provenance remains unverified, so no service-type breakdown is published.
Before-job recording still does not establish before-quote timing. Quantile
regression remains unavailable, model rankings remain invalid, and no training,
Sheet writes, deployment, Production integration or pricing changes occurred.

## Updated 101-Record Retrieval

One authorized read succeeded after 23 affected tests and typecheck passed.
No retry, Sheet write, model fitting or quote-prediction benchmark occurred.
The following are new measured aggregates, not the prior 70-record findings.
Source: 21f1c342e9f36130d6468125c39ef9726752c86d plus historical-v4 working changes.
Worksheet identity was checked in the same request. Only redacted aggregates
were output; temporary credential buffers and raw rows were cleared.

- Returned data-row slots: 101 (header excluded); nonempty records: 101; blank slots: 0.
- Valid historical core (unambiguous completion date AND final price): 0.
- All-ten-field format-valid records: 0.
- Descriptive-usable records (at least one valid mapped field): 101.
- Final-price analysis: 101; profit format-valid: 101.
- Paired projected/actual load analysis: 92.
- Each recorded binary/carry characteristic has 92 valid values.
- Verified pre-quote records: 0; genuine quote-evaluation records: 0.
- Unknown pre-quote provenance: 101; decision: NO_MODEL_READY.
- Benchmark status: BENCHMARK_BLOCKED_PROVENANCE.

### Field Quality

| Field | Valid | Blank | Invalid format | Conflicting aliases | Absent header |
| --- | ---: | ---: | ---: | ---: | ---: |
| completion_date | 0 | 0 | 0 | 101 | 0 |
| final_completed_price | 101 | 0 | 0 | 0 | 0 |
| profit | 101 | 0 | 0 | 0 | 0 |
| projected_loads | 92 | 9 | 0 | 0 | 0 |
| actual_loads | 92 | 9 | 0 | 0 | 0 |
| actual_workers | 92 | 9 | 0 | 0 | 0 |
| stairs | 92 | 9 | 0 | 0 | 0 |
| carry_distance_ordinal | 92 | 9 | 0 | 0 | 0 |
| heavy_items | 92 | 9 | 0 | 0 | 0 |
| demo_required | 92 | 9 | 0 | 0 | 0 |

The date conflict occurs across present completion-date aliases; aggregates do
not identify whether this is blank-versus-populated or disagreeing populated
values. We did not choose a source silently. Accepted completion-date coverage
is unavailable (0 resolved dates); no earlier date range is reused.
Duplicate candidates cannot be assessed under the date/price-core criterion:
0 records assessed. The zero candidate counter is NOT evidence of no duplicates.
No records were deduplicated. These limitations need separate conflict resolution
before date-based descriptive analysis; no extra retrieval was attempted.

### Final Customer Prices

101 prices: minimum $80; 25th percentile $145; median $200; 75th percentile $480;
maximum $13,800; mean $703.32. These are recorded final prices, not optimal prices.
Profit cost categories remain unspecified; no margin interpretation is made.

### Recorded Load Differences

92 paired numeric values. Projected minus actual: mean -0.06; median 0;
25th/75th percentiles 0/0; range -2.5 to 0. Mean absolute difference: 0.06.
Values are rounded to two decimals. Capacity-unit comparability is UNVERIFIED.
These are arithmetic differences in recorded numbers, not established physical
load error, pre-quote model accuracy, or confidence percentages.

### Recorded Characteristics

| Characteristic | Recorded value | Records | Median final price |
| --- | --- | ---: | ---: |
| stairs | true | 5 | 845 |
| stairs | false | 87 | 200 |
| stairs | blank | 9 | 320 |
| carryOrdinal | 5 | 7 | 1200 |
| carryOrdinal | 3 | 10 | 687.5 |
| carryOrdinal | 4 | 4 | suppressed (<5) |
| carryOrdinal | 1 | 51 | 200 |
| carryOrdinal | 2 | 12 | 200 |
| carryOrdinal | blank | 9 | 320 |
| carryOrdinal | 0 | 8 | 152.5 |
| heavyMaterials | true | 26 | 625 |
| heavyMaterials | false | 66 | 200 |
| heavyMaterials | blank | 9 | 320 |
| demolition | false | 85 | 200 |
| demolition | true | 7 | 1050 |
| demolition | blank | 9 | 320 |

Carry levels observed: 0, 1, 2, 3, 4, 5; these are ordinal levels only, not
physical units or approved tier thresholds. Counts do not certify allowed range.
Binary formats parsed successfully for 92 records per binary field.
Groups with fewer than five priced records have price summaries suppressed.
These marginal descriptive relationships are not causal or predictive evidence.
Service-type breakdown is unavailable: no source field/category provenance is
verified for this retrieval. No arbitrary source text was published.
No tiers or rankings were generated.

### Remaining Boundaries

Quote timing remains UNKNOWN despite before-job recording. Completion Date is
not an estimate date; actual workers/loads, final customer price and profit are
outcomes, never quote-time predictors. No planned crew is invented. Carry tier
thresholds, common load capacity and verified service categories are unavailable.
Quantile regression remains disabled. Production behavior and Sheet values
are unchanged. Existing historical sections below remain archived checkpoints.

## 2026-09-10 Adapter Correction: No New Live Run

Tristan confirmed Date is completion date, Workers actual crew, Amount revenue,
and Net Profit profit. Projected loads and job characteristics were recorded
before the job; availability before the quote is not confirmed. See the updated
benchmark methodology for exact adapter mappings and remaining factual questions.

The adapter now separates format-valid history from unknown quote-time provenance,
with per-field absent-header/blank/invalid/valid aggregate diagnostics. No live
read or benchmark was run for this change. The saved counts below belong to the
2026-09-05 implementation; they are not new counts for the corrected adapter.
New diagnostic counts remain unmeasured. NO_MODEL_READY remains unchanged.

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
