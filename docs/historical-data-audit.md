# Historical Data Audit

Audit branch: `codex/historical-data-ml-readiness`

This document is intentionally aggregate and redacted. It must not contain raw Google Sheet rows, customer names, phone numbers, email addresses, full street addresses, free-text notes, photograph contents, spreadsheet exports, or credential values.

## Source

- Expected spreadsheet ID: `1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI`
- Canonical runtime keys: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_TAB`, `GOOGLE_SERVICE_ACCOUNT_JSON`
- Required access mode: Google Sheets API scope `https://www.googleapis.com/auth/spreadsheets.readonly`
- Sheet modification policy: no appends, updates, deletes, formatting changes, sorting, filtering, tab renames, or exports

## Access Result

The real Google Sheet audit succeeded on 2026-08-29 using process-scoped environment variables only:

- `GOOGLE_SPREADSHEET_ID`: matched expected spreadsheet
- `GOOGLE_SHEET_TAB`: `ML Data`
- Worksheet GID: `969595299`
- Access scope: read-only
- Spreadsheet write operations attempted: none

The rotated service-account JSON was loaded directly from the authorized local file into a process-scoped variable for the audit command, then cleared. No credential value was printed, copied into code, persisted to `.env.local`, committed, or requested in chat.

## Production Baseline

- Stable tag: `pricing-tool-production-stable-2026-08-29`
- Production commit: `106e49eb2b90a2c235e7035149f0246580c64f5c`
- Production deployment: `dpl_2Cc9WWaMuGd3X9Pz8jyBFzF89f9G`
- Production URL: `https://whs-pricing-tool-p8kg-hqyoi5kmn-wade-home-services.vercel.app`
- Rollback commit: `02a6c0051b75814facda7cad647faf75c438da77`
- Rollback deployment: `dpl_Eb7naVBHZaoSis1dHyhJEN7wqkve`

## Reproducible Audit Command

Run the local read-only audit only from an authorized server-side environment:

```bash
npm run audit:historical-data
```

The command can load a gitignored `.env.local` for local development, authenticates only with the read-only Sheets scope, reads only the configured spreadsheet and tab, and prints aggregate/redacted JSON. It returns a nonzero exit code for missing configuration, malformed credentials, unexpected spreadsheet IDs, worksheet mismatches, or access failures.

The command reports:

- source metadata and worksheet dimensions
- header row and canonical field mapping
- aggregate missing and invalid rates
- duplicate and likely duplicate counts
- date coverage
- privacy classifications
- outcome availability
- target readiness
- deterministic redacted snapshot manifest

It does not write raw rows to disk and does not print customer identity fields or unredacted free text.

## Dataset Summary

- Total sheet rows returned: 73
- Non-empty records after header: 70
- Column count: 25
- Earliest valid date: 2025-10-25
- Latest valid date: 2026-06-01
- The prior belief that coverage ends around June 1, 2026 is confirmed.
- Newer completed jobs after 2026-06-01 are not present in the audited worksheet.
- Duplicate full rows: 0
- Likely duplicate jobs by available aggregate key: 0
- Rows classified as non-completed by the available status field: 0
- Missing stable job/opportunity/estimate identifiers: 70 records
- Formula cells detected in returned values: none
- Merged or blank header complications detected: none

Normalized fields found:

`estimate_date`, `service_type`, `final_completed_price`, `owner`, `city`, `payment_expense`, `distance`, `direct_job_cost`, `roi`, `client`, `net_profit`, `completed`, `notes`, `estimated_load_count`, `actual_load_count`, `workers`, `labor_hours`, `stairs`, `carry_distance`, `heavy_items`, `demo_required`, `resale_value`, `won_job`, `historical_data_completeness`, `historical_data_confidence`.

Important missingness and quality findings:

- Estimate date, service type, completed-price field, city, direct job cost, and completed status: 0% missing.
- Estimated load count, actual load count, workers, labor hours, stairs, carry distance, heavy-items flag, demo-required flag, resale-value flag, won-job flag, historical completeness, and historical confidence: 14.29% missing each.
- Notes: 77.14% missing and treated as sensitive text requiring redaction/review.
- Completion date, accepted/lost/cancelled outcome reason, mileage, travel time, disposal facility, disposal weight, disposal cost, gross margin, manager override, override reason, photo references, model version, prompt version, and pricing-rule version: unavailable as dedicated fields.
- Zero or negative values were detected in price-like/cost-like fields and require business review before target use.
- City naming is inconsistent enough to require normalization/generalization.
- Outlier counts are material for price, direct job cost, load count, and labor hours; this supports robust methods and large-project separation.

Outcome availability:

- Supported for reporting/backtesting: estimate date, service type, city/geography, final completed price, direct job cost, completed status, won-job indicator, estimated/actual loads, workers, labor hours, stairs, carry distance, heavy-items flag, demo-required flag, resale-value flag.
- `won_job` is present on 60 records, but acceptance modeling remains not ready because lost/declined/cancelled outcomes and loss reasons are not available as dedicated validated fields.
- Not available as dedicated fields: completion date, stable job ID, estimate ID, original quoted price, accepted price, loss/cancel reason, disposal facility, disposal weight, disposal cost, mileage, travel time, gross margin, manager override, override reason, photographs, model version, prompt version, and pricing-rule version.

## Current ML Readiness

Overall readiness: limited, not Production-ML ready.

- Descriptive reporting: supported for current fields.
- Comparable-job retrieval: supportable in an internal/redacted manager-assist mode using service type, date, generalized city, load count, labor hours, access flags, direct job cost, and completed price.
- Segmented median baselines: supportable for coarse segments only; 70 records and 2 service types are too small for fine-grained slicing.
- Robust regression or regularized quantile regression: supportable only in shadow-mode experiments, preferably with log-transformed price or operational targets and strong review of large-project influence.
- Gradient boosting, CatBoost, LightGBM, XGBoost, neural networks, or photograph-to-final-price models: not supported for Production use at this data size.
- Acceptance modeling: not supportable until lost/declined/cancelled opportunities and loss reasons are consistently recorded and enough negative examples exist.
- Margin modeling: blocked until gross margin or complete direct-cost components are reliably recorded.
- Large-project prediction: not supportable as an ordinary supervised model; large jobs need a separate component-based manager-review regime.

No machine-learning model was trained, selected, deployed, or promoted.

## Data Risks To Evaluate On First Real Audit

- Completed-job selection bias if lost or declined quotes are absent.
- Human pricing embedded in final price labels.
- Discount, family/friend, returning-customer, and commercial/residential mixing.
- Time-based price changes and disposal-cost drift.
- Geographic, service-type, and multi-load imbalance.
- Duplicate customer or duplicate job leakage across train/test splits.
- Leakage from final outcome fields, manager overrides, completion fields, or notes created after quote time.
- Photograph leakage if related photos or repeat customers are split randomly.
- Small-sample overfitting and unstable manager-override patterns.

Only information available at estimate time may be used as model features.

## Proposed Google Sheet Updates

These are proposed for Tristan approval only; this branch does not modify the Sheet.

| Priority | Column | Purpose | Type | Required | Owner | Timing | Allowed values or example |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P0 | `completed_job_id` | Stable non-PII job key | text | yes | manager/admin | closeout | `job_2026_0001` |
| P0 | `estimate_date` | Time-aware validation | date | yes | estimator | estimate | `2026-08-29` |
| P0 | `completion_date` | Outcome timing | date | yes for completed | manager/admin | closeout | `2026-08-30` |
| P0 | `quote_outcome` | Accepted/lost/cancelled/completed target | category | yes | manager/admin | closeout | `accepted`, `lost`, `cancelled`, `completed` |
| P0 | `final_completed_price` | Revenue label | currency | yes for completed | manager/admin | closeout | `$425` |
| P0 | `actual_load_count` | Operational label | number | yes for junk jobs | crew/manager | closeout | `1.25` |
| P0 | `actual_labor_hours` | Labor label | number | yes | crew/manager | closeout | `3.5` |
| P0 | `disposal_cost` | Direct cost label | currency | yes when disposal occurs | manager/admin | closeout | `$68.40` |
| P1 | `direct_job_cost` | Margin analysis | currency | preferred | manager/admin | closeout | `$180` |
| P1 | `gross_margin` | Margin target | percentage | preferred | manager/admin | closeout | `0.42` |
| P1 | `manager_override` | Override contamination control | boolean | yes | manager | quote approval | `true`, `false` |
| P1 | `override_reason` | Explain non-model price changes | category/text | if override | manager | quote approval | `access`, `discount`, `heavy_material` |
| P1 | `loss_reason` | Acceptance modeling | category | if lost/cancelled | manager/admin | closeout | `price`, `timing`, `scope`, `unknown` |
| P2 | `model_version` | Reproducibility | text | future | system | estimate | `rules-only-2026-08-29` |
| P2 | `pricing_rule_version` | Deterministic baseline version | text | future | system | estimate | `whs-rules-v1` |
