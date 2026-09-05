# Historical Outcome Schema V2

Schema V2 expands the existing `ML Data` worksheet for controlled outcome learning while preserving every existing row, column, and value. It is append-only and exists to make future shadow benchmarks reproducible; it does not train, select, deploy, or promote a model.

## Source And Backup

- Spreadsheet: `1VKZgdAwWURAkACKSUrEGSoNib1xQaQ7zzpBGfwneOeI`
- Worksheet: `ML Data`
- Expected worksheet GID: `969595299`
- Migration command: `npm run migrate:historical-schema-v2`
- Apply command: `ALLOW_GOOGLE_SHEET_SCHEMA_WRITE=true npm run migrate:historical-schema-v2 -- --apply`
- Backup title pattern: `ML Data Backup YYYY-MM-DD Pre Schema V2`

The command is dry-run by default. Apply mode requires both `--apply` and `ALLOW_GOOGLE_SHEET_SCHEMA_WRITE=true`. Credentials must be process-scoped and must not be stored in `.env`, committed, logged, or pasted into chat.

## Migration Guarantees

- No public API route is created.
- The existing read-only audit module keeps the read-only Sheets scope.
- Write-capable code is isolated in the administrative CLI module.
- The worksheet ID and GID must match exactly.
- Duplicate normalized headers block the migration.
- A complete duplicate worksheet is created before any original worksheet write.
- Backup verification compares row count, column count, original headers, and a non-reversible in-memory verification hash.
- The source manifest is checked again immediately before applying appended headers.
- Historical row values are not guessed or backfilled.
- Only approved missing headers are appended to the right side of row 1.
- Raw customer rows, notes, photographs, credential values, prompts, and model responses are never printed.

## Existing-To-Canonical Mapping

| Existing header meaning | Canonical field |
| --- | --- |
| Date | `estimate_date` |
| Job type/service | `service_type` |
| Price/final price | `final_completed_price` |
| City | `city` |
| Direct job cost | `direct_job_cost` |
| Completed | `completed` |
| Notes | `notes` |
| Estimated load count | `estimated_load_count` |
| Actual load count | `actual_load_count` |
| Workers | `workers` |
| Labor hours | `labor_hours` |
| Stairs | `stairs` |
| Carry distance | `carry_distance` |
| Heavy items | `heavy_items` |
| Demo required | `demo_required` |
| Won job | `won_job` |

## Appended Columns

The migration appends only missing Schema V2 fields:

`job_id`, `model_version`, `prompt_version`, `pricing_rule_version`, `data_schema_version`, `estimate_source`, `data_quality_status`, `original_quoted_price`, `customer_accepted_price`, `completion_date`, `opportunity_outcome`, `loss_reason`, `cancellation_reason`, `actual_load_percent`, `disposal_facility`, `disposal_weight`, `disposal_cost`, `mileage`, `travel_time_minutes`, `equipment_cost`, `subcontractor_cost`, `gross_margin_dollars`, `gross_margin_percent`, `manager_override`, `manager_override_reason`, `photo_reference_id`.

`employee_correction_notes` is skipped when the existing `notes` column is present, because it is the existing free-text correction/review surface. Keep it redacted and reviewed before any modeling use.

## Data Entry Definitions

Required estimate-time fields:

- `estimate_date`: date the estimate was made.
- `service_type`: controlled service category.
- `estimated_load_count`: estimated truck/load count.
- `carry_distance`, `stairs`, `heavy_items`, `demo_required`: access and scope controls.
- `workers`: planned worker count when known.
- `estimate_source`: source of the estimate, such as `manual`, `ai_assisted`, or `manager_review`.
- `pricing_rule_version`: deterministic rules version used for the quote.

Required completed-job fields:

- `job_id`: stable non-PII job identifier.
- `completion_date`: completed job date.
- `customer_accepted_price`: accepted quote or final accepted price.
- `final_completed_price`: completed revenue label.
- `actual_load_count` and `actual_load_percent`: completed load labels.
- `labor_hours`: completed labor label.
- `direct_job_cost`, `disposal_cost`, `equipment_cost`, `subcontractor_cost`: cost labels when applicable.
- `gross_margin_dollars`, `gross_margin_percent`: completed profitability labels.
- `data_quality_status`: `verified`, `needs_review`, or `exclude`.

Required lost/cancelled-job fields:

- `opportunity_outcome`: `accepted`, `lost`, `cancelled`, or `completed`.
- `loss_reason`: required for lost work.
- `cancellation_reason`: required for cancelled work.
- `original_quoted_price`: quoted price before the customer decision.

## Privacy And Photo Rules

Do not enter customer names, phone numbers, emails, full street addresses, public photo URLs, local file paths, base64 image data, or identifying filenames into Schema V2 fields. `photo_reference_id` must contain only an opaque secure identifier managed by an approved private storage process.

Free-text fields remain sensitive. They require human review and redaction before use in any benchmark.

## Versioning And Model Architecture

Schema V2 preserves the agreed architecture:

1. GPT analyzes customer photographs and details into structured features.
2. Deterministic logic assigns routine, mid-tier, large/project, or special-review tiers.
3. Historical medians and comparable jobs provide decision support.
4. Huber and quantile regression remain future shadow-model candidates.
5. WHS rules enforce minimums, costs, margins, restricted items, and review requirements.
6. Large projects remain component-priced and manager-reviewed.
7. Outcomes support controlled champion/challenger evaluation.
8. No uncontrolled online learning is allowed.
9. No Production model promotion occurs without human approval and rollback.

## Verification Record

Migration executed on 2026-09-01 from `codex/historical-outcome-schema-v2` using process-scoped credentials only.

- Backup worksheet: `ML Data Backup 2026-09-01 Pre Schema V2`
- Backup GID: `224320500`
- Backup verification: passed
- Original worksheet before migration: 73 returned rows, 25 value columns
- Original worksheet after migration: 73 returned rows, 51 value columns
- Original worksheet GID: `969595299`
- Original worksheet title: `ML Data`
- Original headers preserved in order: yes
- Existing cells unchanged: yes
- Source manifest unchanged between preflight and apply: yes
- Append-only verification: passed
- Post-apply dry-run idempotency: passed, 0 remaining columns to append
- Read-only audit after migration: passed
- Non-empty records after header: 70
- Eligible completed rows after parser correction: 70
- Historical rows backfilled or guessed: none
- Raw rows, credentials, photographs, prompts, and model responses printed or committed: none

Pre-migration verification hash: `fe84492648fea26db65a29724923e74291ac44b4bc902b90af1e82d89d63a229`

Post-migration verification hash: `b93b8fcd17b626b34b2e94241b4a82472f0fe277832a11f42d9a8bab3789e8a3`

The read-only audit snapshot checksum changed after the migration because the header schema intentionally changed from 25 to 51 columns. Existing historical row values were verified unchanged before that schema-only difference was accepted.
