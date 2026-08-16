# Historical Completed-Job Data Audit

Audit date: 2026-08-16

This document is intentionally aggregate and redacted. No raw spreadsheet rows, customer names, phone numbers, email addresses, full street addresses, free-text customer notes, photographs, or credentials are included.

## Source

- Expected spreadsheet ID: `1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI`
- Expected worksheet GID: `969595299`
- Canonical runtime keys: `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SHEET_TAB`, `GOOGLE_SERVICE_ACCOUNT_JSON`
- Access mode: Google Sheets API read-only scope

## Configuration Status

Vercel environment-variable names were verified as present for Preview and Production:

- `GOOGLE_SPREADSHEET_ID`: present
- `GOOGLE_SHEET_TAB`: present
- `GOOGLE_SERVICE_ACCOUNT_JSON`: present

Local branch environment status:

- `GOOGLE_SPREADSHEET_ID`: missing
- `GOOGLE_SHEET_TAB`: missing
- `GOOGLE_SERVICE_ACCOUNT_JSON`: missing

The local read-only historical-data inspection was blocked because the service-account configuration was available only as hidden Vercel environment variables. The values were not pulled, printed, copied, or written to disk.

## Verification Outcome

- Configured spreadsheet ID verification: blocked locally
- Configured worksheet-name verification: blocked locally
- Worksheet GID `969595299` comparison: blocked locally
- Service-account read access: blocked locally
- Spreadsheet write operations attempted: none

## Coverage

Because local read access was blocked, the following fields could not be verified during this PR:

- actual worksheet name
- total row count
- non-empty completed-job count
- earliest recorded job date
- latest recorded job date
- date formats
- currency formats
- duplicate rate
- missing-value frequency by column
- service-type vocabulary
- city/geographic coverage
- price coverage

The prior business belief that the data extends only through approximately June 1, 2026 remains unverified.

## Readiness Assessment

- Descriptive reporting: blocked pending read-only inspection, but likely feasible if dates, service categories, prices, and status fields are present.
- Comparable-job retrieval: blocked pending inspection; requires material type, load size, location at an aggregate level, labor/access factors, and final price.
- Statistical baselines: blocked pending inspection; requires enough completed jobs with reliable final prices and consistent service labels.
- Supervised machine learning: not currently sufficient until field coverage, row count, outcome labels, leakage controls, and held-out evaluation are verified.

No model was trained during this pull request.

## Privacy Classification

- Required operational data: opportunity ID, estimate ID, service type, estimate date, status, final completed price, actual load count, labor inputs, disposal cost, and quote outcome.
- Modeling data: compacted volume, material category, access difficulty, travel distance/time, workers, labor hours, disposal weight/cost, lead source, geography at privacy-safe granularity.
- Optional contextual data: seasonality, route density, capacity, employee correction notes after redaction.
- Personally identifiable information: customer name, phone, email, full street address.
- Sensitive free-text data: job notes, customer descriptions, internal notes.
- Exclude from training: raw customer identifiers, full addresses, unredacted notes, credential fields, private competitor records, and raw images unless governed by a separate secure image policy.

## Recommended Canonical Mapping

- `opportunity_id`: stable pseudonymous opportunity identifier.
- `estimate_id`: estimate attempt identifier.
- `estimate_date`: date the estimate was produced.
- `service_type`: normalized service category.
- `photo_reference_count`: count or secure references, not raw photos.
- `ai_analysis_version`: model, prompt, and schema version.
- `pricing_rule_version`: deterministic rule version.
- `estimated_load_percent`: compacted trailer utilization estimate.
- `estimated_load_count`: expected number of loads.
- `quote_status`: `analysis_failed`, `needs_manager_review`, `conditional_estimate`, or `direct_quote_eligible`.
- `recommended_price` and `recommended_range`: pricing output.
- `final_quoted_price`: price sent to customer.
- `booking_outcome`: accepted, lost, cancelled, completed, unknown.
- `completed_price`: final completed job revenue.
- `actual_load_count`, `actual_workers`, `actual_labor_hours`, `actual_mileage`, `actual_travel_time`.
- `disposal_facility`, `disposal_weight`, `disposal_cost`.
- `direct_job_cost` and `actual_gross_margin`.
- `override_reason` and `employee_correction_notes`.

## Additional Fields To Collect

- Photograph references and metadata
- AI observed facts, assumptions, warnings, confidence, and schema version
- Customer-entered details separated from employee notes
- Manager review state and override reason
- Actual number of loads and trailer utilization
- Actual workers and labor hours
- Actual mileage and travel time
- Disposal facility, weight, cost, and special fees
- Gross revenue, direct job cost, and actual gross margin
- Lead source and loss/cancellation reason
- Privacy-safe city/zone, not full address in modeling tables

## Proposed Pipeline

Phase A: clean the historical dataset and map it to a canonical schema.

Phase B: collect ongoing completed-job outcomes for every estimate.

Phase C: build rule-based and statistical baselines.

Phase D: add comparable-job retrieval for manager review.

Phase E: evaluate candidate machine-learning models only after sufficient clean labels exist.

Phase F: run held-out evaluation and business validation.

Phase G: introduce controlled production inference only after measurable improvement.

Phase H: monitor drift, calibration, overrides, acceptance, and margin.

## Duplicate Detection

Use a stable pseudonymous job key built from non-secret internal IDs where available. If no ID exists, use a privacy-preserving hash over normalized date, service category, approximate city/zone, and final price bucket. Do not hash raw names, phone numbers, emails, or full street addresses into repository fixtures.

## Data Validation Rules

- Required dates must parse to a valid calendar date.
- Currency fields must parse to non-negative values.
- Status values must map to a controlled vocabulary.
- Load percent should be between 0 and a documented multi-load maximum.
- Actual workers and labor hours must be non-negative.
- Disposal cost and weight must be separated.
- Free text must be reviewed for PII before modeling.

## Correction Workflow

Managers should be able to correct estimated material type, load percent, labor estimate, disposal estimate, final price, actual load count, and override reason. Corrections should be timestamped and attributed to an internal user without exposing customer identity in modeling exports.

## Retention And Photograph References

Store customer identity separately from modeling features. Keep photographs in private object storage with short-lived signed access, retention limits, deletion procedures, and audit logging. The modeling dataset should reference photos through secure IDs, not public URLs or committed files.

