# ML Readiness And Benchmark Plan

No model should be promoted during this phase. The first real audit must determine whether the historical sheet contains enough clean, completed-job labels to support each target.

## Target Readiness Rules

| Target | Current status | Minimum evidence before modeling | Baseline | Metric |
| --- | --- | --- | --- | --- |
| Compacted load percentage | blocked pending real audit | actual load labels, quote-time photo/load features | median by service/load category | median absolute load error |
| Actual number of loads | blocked pending real audit | completed jobs with actual load count | historical median by service | mean absolute load-count error |
| Labor hours | blocked pending real audit | actual labor hours and access features | median labor by service/access | mean absolute hour error |
| Disposal weight | blocked pending real audit | disposal weight labels | median by material/load | mean absolute weight error |
| Disposal cost | blocked pending real audit | disposal cost labels and material/facility fields | median by material/facility | mean absolute cost error |
| Direct job cost | blocked pending real audit | labor plus disposal plus travel costs | rules-based cost floor | mean absolute cost error |
| Final completed price | blocked pending real audit | final completed revenue and override flags | current deterministic pricing | mean absolute price error |
| Gross margin | blocked pending real audit | final price and direct cost | deterministic margin estimate | gross-margin error |
| Quote acceptance probability | blocked pending real audit | accepted/lost/cancelled outcomes | historical acceptance rate | calibration, log loss |
| Underpricing risk | blocked pending real audit | final price, cost, margin, override flags | current rules plus margin floor | underpricing frequency |

Operational cost, historical human price, strategic price recommendation, and customer acceptance are separate problems. They need separate targets, features, and evaluation gates.

## Bias And Leakage Controls

- Completed-job-only data overrepresents accepted work and hides rejected prices.
- Lost/cancelled quotes are required for acceptance modeling.
- Human discounts, returning-customer pricing, family/friend pricing, and manager overrides must be flagged.
- Commercial and residential work should be segmented before model comparison.
- Time-based pricing and disposal-cost changes require time-aware validation.
- Duplicate customers, duplicate jobs, and related photographs must stay in the same validation fold.
- Final outcome fields, completion details, and after-the-fact notes cannot be used as estimate-time features.
- Random row splits are not acceptable when repeated customers or time drift exist.
- A final untouched test set must remain sealed until candidate selection is complete.

## Benchmark Sequence

Models must be compared in this order:

1. Current deterministic pricing rules.
2. Historical median by service/load category.
3. Nearest or comparable-job retrieval.
4. Regularized linear or generalized regression.
5. Decision tree or random forest where appropriate.
6. Gradient-boosted trees.
7. CatBoost.
8. LightGBM or XGBoost when justified by data size and ops complexity.
9. AI-only estimate.
10. Hybrid ensemble combining AI vision features, historical tabular model, deterministic WHS safeguards, and manager review.

CatBoost is a plausible candidate for small-to-medium tabular data with categorical fields and missing values, but it is not the winner until it beats simpler baselines on a held-out set.

## Evaluation Design

- Use a time-based holdout where possible.
- Use group-aware validation to keep repeated customers and duplicate jobs together.
- Preserve a final untouched test set.
- Report mean absolute error, median absolute error, percentage error, underpricing frequency, severe-underpricing frequency, gross-margin error, load error, labor-hour error, disposal-cost error, calibration, and manager-override rate.
- Slice results by service type, geography, load size, material category, and time period.
- Require manager review when model confidence is low, job type is risky, or predicted price deviates beyond the allowed change threshold.

## Current Recommendation

Because real sheet access is blocked, the only evidence-based recommendation is to complete the read-only data audit first. After that, start with reporting, current-rule backtesting, and median/comparable-job baselines. Do not train or deploy a Production ML model until labels, leakage controls, and validation splits are proven.

