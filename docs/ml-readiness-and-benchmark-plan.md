# ML Readiness And Benchmark Plan

No model should be promoted during this phase. The live `ML Data` worksheet has 70 non-empty records, with 60 records containing the current load/labor operational fields. That is enough for reporting, comparable retrieval, segmented medians, and shadow-mode robust baselines, but not enough for autonomous Production ML.

## Permanent Pricing Architecture

The source-of-truth architecture is:

1. Customer input: photographs, job description, service area, access information, requested work, and relevant constraints.
2. GPT vision and text analysis: GPT converts photos and customer details into structured job features such as visible materials, estimated volume/load, dense material risk, restricted-item indicators, demolition requirements, labor complexity, worker need, access difficulty, uncertainty, and missing questions. GPT must not independently invent or control the final customer price.
3. Rule-based job tiering: current data size requires deterministic, explainable tier routing for small/routine, mid-tier, large/project, and special-risk/manual-review jobs.
4. Historical pricing intelligence: compare structured jobs against completed WHS jobs through segmented medians, comparable retrieval, and later robust/quantile regression in shadow mode.
5. Deterministic safeguards: minimum charge, labor rates, disposal prices, travel policy, equipment/subcontractor costs, restricted-item charges, required margin, risk contingency, and manager-review rules remain outside the statistical model.
6. Output: operational requirements, recommended price/range, redacted comparable jobs, uncertainty, assumptions, underpricing warning, quote status, missing questions, and direct/conditional/manager-review recommendation.
7. Outcome feedback: every completed or lost opportunity should record validated labels, final quote/outcome, actual operations, costs, margin, overrides, loss reason, and model/rule versions.

Large/project jobs are a separate operating regime. They should use component-based cost buildup for labor, disposal, travel, equipment, subcontractors, risk contingency, and target gross margin, with manager review until enough genuinely comparable completed projects exist.

## Target Readiness Rules

| Target | Current status | Minimum evidence before modeling | Baseline | Metric |
| --- | --- | --- | --- | --- |
| Compacted load percentage/load count | shadow-mode only, 60 rows | actual load labels, quote-time photo/load features | median by service/load category | median absolute load error |
| Actual number of loads | shadow-mode only, 60 rows | completed jobs with actual load count | historical median by service | mean absolute load-count error |
| Labor hours | shadow-mode only, 60 rows | actual labor hours and access features | median labor by service/access | mean absolute hour error |
| Disposal weight | blocked pending real audit | disposal weight labels | median by material/load | mean absolute weight error |
| Disposal cost | blocked pending real audit | disposal cost labels and material/facility fields | median by material/facility | mean absolute cost error |
| Direct job cost | descriptive/shadow-mode, 70 rows | labor plus disposal plus travel costs | rules-based cost floor | mean absolute cost error |
| Final completed price | descriptive/shadow-mode, 70 rows | final completed revenue and override flags | current deterministic pricing | mean absolute price error |
| Gross margin | blocked | final price and direct cost or explicit margin | deterministic margin estimate | gross-margin error |
| Quote acceptance probability | blocked | accepted/lost/cancelled outcomes and loss reasons | historical acceptance rate | calibration, log loss |
| Underpricing risk | blocked pending margin policy | final price, cost, margin, override flags | current rules plus margin floor | underpricing frequency |

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
2. Global and tier-specific medians.
3. Nearest or comparable-job retrieval.
4. Huber regression or regularized quantile regression on log-transformed price or operational targets.
5. Elastic Net.
6. Decision tree or random forest where appropriate.
7. Gradient-boosted trees only after more high-quality records exist.
8. CatBoost as a future challenger after enough categorical and missing-value coverage exists.
9. LightGBM or XGBoost only if data size and ops complexity justify them.
10. AI-only estimate.
11. Hybrid ensemble combining AI vision features, historical tabular model, deterministic WHS safeguards, and manager review.

Do not deploy neural networks, deep learning, photograph-to-final-price models, or complex boosting models from approximately 60 operational records. CatBoost remains a future challenger, not the current recommendation.

## Evaluation Design

- Use a time-based holdout where possible.
- Use group-aware validation to keep repeated customers and duplicate jobs together.
- Preserve a final untouched test set.
- Report mean absolute error, median absolute error, percentage error, underpricing frequency, severe-underpricing frequency, gross-margin error, load error, labor-hour error, disposal-cost error, calibration, and manager-override rate.
- Slice results by service type, geography, load size, material category, and time period.
- Require manager review when model confidence is low, job type is risky, or predicted price deviates beyond the allowed change threshold.
- Evaluate small, mid-tier, and large/project jobs separately.

## Current Recommendation

The current recommendation is a guarded hybrid architecture:

- GPT structures customer text and photos into job features.
- Deterministic rules route jobs into small/routine, mid-tier, large/project, and special-risk/manual-review tiers.
- The historical layer provides segmented medians and redacted comparable jobs.
- Robust regression or regularized quantile regression may run in shadow mode only.
- Deterministic WHS pricing safeguards remain authoritative.
- Large/project jobs use component-based costing and manager review.
- No Production model should be promoted until held-out benchmarks prove improvement without worsening underpricing, margin, or high-risk segments.
