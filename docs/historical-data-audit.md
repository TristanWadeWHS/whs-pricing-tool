# Historical Data Audit

Audit branch: `codex/historical-data-ml-readiness`

This document is intentionally aggregate and redacted. It must not contain raw Google Sheet rows, customer names, phone numbers, email addresses, full street addresses, free-text notes, photograph contents, spreadsheet exports, or credential values.

## Source

- Expected spreadsheet ID: `1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI`
- Canonical runtime keys: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_TAB`, `GOOGLE_SERVICE_ACCOUNT_JSON`
- Required access mode: Google Sheets API scope `https://www.googleapis.com/auth/spreadsheets.readonly`
- Sheet modification policy: no appends, updates, deletes, formatting changes, sorting, filtering, tab renames, or exports

## Access Result

The real Google Sheet audit is blocked in this branch because the required local server-side environment variables are unavailable:

- `GOOGLE_SPREADSHEET_ID`: missing locally
- `GOOGLE_SHEET_TAB`: missing locally
- `GOOGLE_SERVICE_ACCOUNT_JSON`: missing locally

Two non-interactive attempts to pull Preview environment configuration into the gitignored `.env.local` file did not complete through the local Vercel CLI. They were stopped without printing secret values.

No credential value was printed, copied into code, committed, or requested in chat. No spreadsheet read was completed and no spreadsheet write was attempted.

## Production Baseline

- Stable tag: `pricing-tool-production-stable-2026-08-29`
- Production commit: `106e49eb2b90a2c235e7035149f0246580c64f5c`
- Production deployment: `dpl_2Cc9WWaMuGd3X9Pz8jyBFzF89f9G`
- Production URL: `https://whs-pricing-tool-p8kg-hqyoi5kmn-wade-home-services.vercel.app`
- Rollback commit: `02a6c0051b75814facda7cad647faf75c438da77`
- Rollback deployment: `dpl_Eb7naVBHZaoSis1dHyhJEN7wqkve`

## Reproducible Audit Command

Run the local read-only audit after a safe `.env.local` is available:

```bash
npm run audit:historical-data
```

The command loads `.env.local`, authenticates only with the read-only Sheets scope, reads only the configured spreadsheet and tab, and prints aggregate/redacted JSON. It returns a nonzero exit code for missing configuration, malformed credentials, unexpected spreadsheet IDs, worksheet mismatches, or access failures.

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

Real dataset summary is blocked pending secure read-only credentials.

The audit command is ready to measure:

- total rows and non-empty rows
- actual configured tab name
- earliest and latest parsed dates
- whether coverage ends around June 1, 2026
- whether newer completed jobs appear missing
- column count and schema mapping
- duplicate row and likely duplicate job rates
- missing identifiers, dates, prices, and operational labels
- invalid date, price, currency, percentage, and numeric values
- inconsistent city, service-type, and status values
- formula cells and merged/blank header complications
- rows that are not completed jobs

## Current ML Readiness

Because the real sheet could not be read, the honest readiness rating is `blocked`.

Allowed conclusions at this point:

- Reporting: likely feasible only after read-only access confirms date and price fields.
- Comparable-job retrieval: cannot be certified until service, geography, load, access, and final price coverage are measured.
- Statistical baselines: cannot be certified until row count and label quality are measured.
- Gradient-boosted models: not supportable from evidence yet.
- Production ML: not supportable in this phase.

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

