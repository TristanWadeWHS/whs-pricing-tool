# Shadow Pricing Benchmark: Methodology V2

Offline CLI only. No estimator integration or Production behavior changes.
Starting commit: c272da080e0009b90a847f757839bb4001ffe3af.
Production baseline: c2bd1a36cdfb283af04db0eaa32890fb1e1a8524.
Rollback: pricing-tool-schema-v2-stable-2026-09-05 and retained deployment history.

## Provenance

Require explicit canonical estimate_date and positive final_completed_price.
Dates accept YYYY-MM-DD or M/D/YYYY. Price is target-only.
Legacy Date, Amount, Workers and other aliases are not evidence of provenance.
Missing or blank canonical fields never fall back to these aliases.
No historical data is backfilled, relabeled, or guessed.

Predictors: estimate month/year, service_type, city, distance_tier,
estimated_load_count, planned_workers, stairs, carry_distance, heavy_items,
demo_required. Only lowercase workers is an alternate for absent planned_workers:
Schema V2 explicitly defines it as planned workers. A blank planned_workers wins.
Canonical names still require truthful data entry and human provenance validation.

Actual loads/labor/costs, outcomes, accepted prices, overrides, notes, identifiers,
addresses, contact information and photos are excluded from predictors.
Date/target failures exclude a row. Aggregate field-blocker counts can overlap.
Target-valid rows with unknown tier inputs remain eligible for diagnostics only.

## Tiers And Missingness

Blank/invalid numeric values remain null. Tier inputs are never imputed.
Load, workers, stairs, carry, heavy items and demo must all be known.
Carry accepts short/medium/long, optionally followed by "carry".
Otherwise tier is unknown_inputs and candidate methods abstain.

Priority: special review (demo plus heavy, crew >=3 or loads >=2), then
large/project (loads >=2 or crew >=3), then mid (loads >=1, heavy, demo, stairs,
or long carry), otherwise small. Price/outcomes never determine tiers.
Large/project and special-review jobs remain component-priced and manager-reviewed.

## Fixed Evaluation

Sort by canonical date and extend every boundary to preserve entire date groups.
Every training date is strictly earlier than its holdout dates.
Initial training size: max(8, min(30, floor(45% of records))).
Nominal block size: max(3, floor(remaining rows / 4)), extended for date groups.
Holdout records occur once; require at least two folds. No random splits or tuning.

Fit each model only on its exact small or mid tier. All other tiers abstain.
Median/retrieval require eight same-tier training records. Retrieval uses up to
five same-tier neighbors and excludes evaluated rows. No cross-tier fallback.
Imputation medians, MAD scales and category encodings fit only that training
segment. Missing numerics are excluded from statistics. An all-missing numeric
training column has an explicit zero fallback, which cannot supply tier inputs.

Experimental Huber now uses training-only target scaling, L2=0.001 and a
Lipschitz-bounded step. Require max absolute gradient <=1e-5 within 10,000 steps
and at least max(20, twice encoded dimension) training records; otherwise abstain.
This existing implementation is not a certified solver.

Quantile regression is unavailable: the defective optimizer is removed and no
validated offline quantile library is installed. No dependency was added.
Future quantile work needs a proven pinned solver and independent validation.
Interval contract: nominal 60% (20th to 80th percentile), inclusive bounds.
Reject and count crossed/nonfinite intervals; never silently sort bounds.
Synthetic interval tests validate this contract, not model calibration.

Compare the three available methods on the exact intersection of their
predicted holdout records. Quantile is excluded. Report fold boundaries,
holdout/matched counts, method abstentions, and per-tier counts/errors.
Empty metrics are null, not zero. Global median is separately diagnostic only
on all eligible holdouts: it pools tiers and is not a small-job recommendation
or a comparable ranking. No automatic winner is selected.

MAE/RMSE measure error against historical charged prices. Below-historical-price
frequency and summed shortfalls are descriptive differences, not economic
underpricing, lost profit or evidence that historical prices were optimal.

## Privacy And Execution

Run npm run benchmark:shadow-pricing with BENCHMARK_CREDENTIAL_FILE.
Use Sheets read-only OAuth scope and one spreadsheets.get request that validates
the authorized tab GID. API retries are disabled; there are no writes or routes.
Credentials stay in process memory. Clear buffers/references and exit the
short-lived process; JavaScript cannot guarantee physical erasure of strings.
Suppress raw provider errors. Clear rows after aggregate evaluation.
No raw rows, identities, arbitrary category values, row-level predictions,
row-derived hashes or credentials are printed or committed.
Manifest reports aggregate counts/dates and code/method versions. Dirty code
is explicitly labeled. It does not authenticate individual source records.

## Decision

NO_MODEL_READY remains the only automatic decision in this phase.
Earlier metrics/rankings are superseded and invalid methodology evidence.
Collect more validated completed outcomes, verify estimate-time provenance,
improve segmentation and assess sufficient independent time-aware holdouts.
Retain controlled champion/challenger evaluation, human approval, versioning,
monitoring and rollback. No uncontrolled learning or Production promotion.
