# Shadow Pricing Benchmark: Confirmed Historical Mappings

Offline CLI only. No estimator integration or Production behavior changes.
Starting commit: c272da080e0009b90a847f757839bb4001ffe3af.
Production baseline: c2bd1a36cdfb283af04db0eaa32890fb1e1a8524.
Rollback: pricing-tool-schema-v2-stable-2026-09-05 and retained deployment history.

## Provenance

Tristan confirmed the following meanings on 2026-09-10. These supersede the
generic Date/Workers mappings in earlier audit/schema documentation for this
benchmark only. The Sheet and those historical migration records are unchanged.

| Source | Adapter canonical field | Meaning / boundary |
| --- | --- | --- |
| Date | completion_date | Job completion date, never estimate date |
| Amount | final_completed_price | Final customer price after the job; target only, never predictor |
| Net Profit | profit | Outcome; cost accounting definition remains unknown |
| Estimated Loads / Estimated_Loads / Projected Loads | projected_loads | Estimated load count recorded before job; pre-quote timing unconfirmed |
| Actual Loads / actual_load_count | actual_loads | Completed load count; common capacity unit unverified |
| Workers / workers | actual_workers | Actual crew used, never planned crew |
| Stairs | stairs | Binary characteristic; pre-quote timing unconfirmed |
| Carry distance / Carry Distance / Carry_Distance / carry_distance | carry_distance_ordinal | Lower means less walking; units, range and tier thresholds unknown |
| Heavy Items / Heavy_Items | heavy_items | Binary heavy-material characteristic; pre-quote timing unconfirmed |
| Demolition | demo_required | Binary requirement; pre-quote timing unconfirmed |

Aliases are explicitly enumerated, then case/space/underscore normalized.
All present aliases are checked together. Different parsed values, blank versus
populated aliases, or invalid duplicate aliases produce a conflict and null value;
none is silently selected. Equivalent parsed values are accepted. Repeated
identical source headers block lossy conversion before analysis.
Dates accept YYYY-MM-DD or M/D/YYYY. Binary formats accept yes/no, true/false,
y/n or 1/0 (case-insensitive); other encodings are invalid, not guessed. Missing
values remain null. Ordinal carry accepts finite numeric levels without assumed
endpoints, units, equal spacing or conversion to short/long or feet/meters.
Actual workers must be a nonnegative integer; projected loads nonnegative.
Final customer price/profit are signed historical outcomes and never predictors.
Tristan's latest confirmation explicitly permits Amount as final_completed_price.
No tips/taxes treatment or profit cost accounting definition is inferred.

The adapter distinguishes absent headers, blank cells, invalid encodings and
valid encodings and conflicts for each field. formatValidHistoricalRows means all ten mapped
field formats are valid, not that incomplete rows are worthless or economically
verified. Historical validity does not establish quote-time eligibility.
Aggregate output contains no mapped row values or identifying details.

The benchmark still requires an actual estimate_date, a positive explicitly
defined final_completed_price target and verified pre-quote predictor provenance.
Default provenance is unknown, even for canonical-looking field names. The CLI
cannot enable verification through Sheet cells or an environment toggle. An
explicit library argument is used only for independently verified inputs
(currently synthetic tests); it must never be inferred from before-job timing.
No historical data is backfilled, relabeled, or guessed.

Predictors: estimate month/year, service_type, city, distance_tier,
estimated_load_count, planned_workers, stairs, carry_distance, heavy_items,
demo_required. planned_workers has no actual-worker fallback. Missing planned
crew remains missing and cannot be invented to complete a tier. Historical
ordinal carry cannot satisfy a categorical quote-time tier threshold without
an independently confirmed scale mapping.

Actual workers, completion dates, revenue, profit, actual loads/labor/costs,
outcomes, accepted prices, overrides, notes, identifiers,
addresses, contact information and photos are excluded from predictors.
Date/target failures exclude a row. Aggregate field-blocker counts can overlap.
Target-valid rows with unknown tier inputs remain eligible for diagnostics only.
Unknown quote-time provenance excludes records from predictive folds separately
from format failures and insufficient tier inputs; blocker counts can overlap.

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

## Descriptive Retrieval Protocol

Run the existing CLI with --descriptive-only for the single authorized read.
This path does not invoke any model fitter. It reports returned data-row slots
(excluding header), blank slots, and nonempty records; allocated empty worksheet
capacity is not counted. Date coverage uses completion dates explicitly.
Valid historical core records have a parseable completion date and final price.
Complete-format records have all ten mapped fields valid. Descriptive-usable
records have at least one valid mapped field; analyses use their own valid subsets.
Unknown provenance never removes records from these descriptive subsets.
Verified-pre-quote and genuine-evaluation counts remain zero for this source;
status is BENCHMARK_BLOCKED_PROVENANCE, decision NO_MODEL_READY.

Report per-field missing/invalid/conflict counts, final-price distribution,
paired projected-minus-actual numeric differences and absolute differences.
These are recorded-number discrepancies only, not capacity-normalized physical
load error or pre-quote accuracy: common trailer capacity/units are undocumented.
Reported percentiles use linear interpolation. Duplicate candidates are exact
matches of confirmed mapped values/statuses among date/price-valid records;
they may be distinct jobs and are counted without deduplication. No hashes or
identifiers are exported. Breakdowns use recorded binaries and ordinal carry
levels without inventing tiers; price statistics need at least five priced records
per group. Ordinal values are syntax-validated, not range-certified.
Service-type breakdown remains unavailable until a source field/category
provenance is verified; arbitrary source text is never published as a category.
No additional field-definition confirmation is being requested here.

## Decision

NO_MODEL_READY remains the only automatic decision in this phase.
Supported descriptive work, once separately authorized to use data: completion
counts by date, reported revenue/profit summaries with accounting caveats,
actual-crew distributions, projected-load and job-characteristic distributions.
Ordinal carry supports ordered summaries, not physical distances or assumed
equal-spaced effects. These summaries cannot demonstrate pre-quote predictive
performance, optimal pricing or economic underpricing. The authorized descriptive
retrieval is recorded separately; no quote-prediction metrics or rankings result.

Remaining limitations: pre-quote timing is UNKNOWN; no estimate date is supplied
by completion Date, actual crew is not planned crew, and ordinal carry has no
approved tier thresholds. Common load-capacity units, verified service-type
source categories and profit cost categories are not documented. These are
limitations, not repeated requests to confirm definitions already provided.
Earlier metrics/rankings are superseded and invalid methodology evidence.
Collect more validated completed outcomes, verify estimate-time provenance,
improve segmentation and assess sufficient independent time-aware holdouts.
Retain controlled champion/challenger evaluation, human approval, versioning,
monitoring and rollback. No uncontrolled learning or Production promotion.
