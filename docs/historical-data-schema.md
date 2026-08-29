# Historical Data Schema

This schema separates customer identity, estimate-time features, post-quote outcomes, and model governance. Google Sheets remains the source of truth for now; this document defines the canonical learning shape without adding a database.

## Entities

| Entity | Purpose | Required fields |
| --- | --- | --- |
| Job/opportunity | Customer-safe work request record | `completed_job_id`, `service_type`, `estimate_date`, privacy-safe `city_or_zone` |
| Estimate | What was known at quote time | `estimated_load_percent`, `estimated_load_count`, `carry_distance`, `stairs_or_elevator`, `access_difficulty`, `workers_planned` |
| AI photo analysis | Model-produced visual facts | `model_version`, `prompt_version`, `photo_reference_count`, `confidence_percent`, `material_type`, `warnings` |
| Quote | Price recommendation and sent price | `pricing_rule_version`, `recommended_price`, `recommended_range_low`, `recommended_range_high`, `final_quoted_price`, `quote_status` |
| Outcome | Customer and job result | `quote_outcome`, `completion_date`, `final_completed_price`, `loss_reason` |
| Actual operations | What happened on the job | `actual_load_count`, `actual_labor_hours`, `actual_workers`, `actual_mileage`, `actual_travel_minutes` |
| Direct costs | Cost labels | `disposal_facility`, `disposal_weight_lb`, `disposal_cost`, `direct_job_cost`, `gross_margin` |
| Manager override | Human intervention | `manager_override`, `override_reason`, `approved_by_role`, `override_timestamp` |
| Versioning | Reproducibility | `snapshot_id`, `feature_definition_version`, `target_definition_version`, `code_commit` |

## Feature Dictionary

| Field | Type | Unit | Required | Timing | Supplied by | Validation | Modeling purpose |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `completed_job_id` | string | none | yes | closeout | manager/admin | stable non-PII ID | grouping, leakage prevention |
| `estimate_date` | date | date | yes | estimate | system/estimator | valid date | time split, seasonality |
| `completion_date` | date | date | completed only | closeout | manager/admin | valid date after estimate | outcome recency |
| `service_type` | category | none | yes | estimate | estimator | controlled vocabulary | feature and segment metric |
| `city_or_zone` | category | generalized geography | yes | estimate | estimator/system | no street address | geography feature |
| `estimated_load_percent` | number | percent | preferred | estimate | AI/estimator | 0 to documented multi-load max | feature, load target comparison |
| `estimated_load_count` | number | loads | preferred | estimate | AI/estimator | non-negative | feature |
| `material_type` | category | none | preferred | estimate | AI/estimator | controlled vocabulary | feature and segment metric |
| `carry_distance` | category | none | preferred | estimate | estimator | `curbside`, `short`, `medium`, `long` | feature |
| `stairs_or_elevator` | category | none | preferred | estimate | estimator | controlled vocabulary | feature |
| `access_difficulty` | category | none | preferred | estimate | AI/estimator | `easy`, `medium`, `hard` | feature |
| `workers_planned` | number | count | optional | estimate | estimator | positive integer | feature only if known at quote time |
| `final_quoted_price` | currency | USD | yes for acceptance modeling | quote | manager/system | non-negative | human-price target |
| `quote_outcome` | category | none | yes | closeout | manager/admin | `accepted`, `lost`, `cancelled`, `completed` | acceptance target |
| `final_completed_price` | currency | USD | yes for completed jobs | closeout | manager/admin | positive value | revenue target |
| `actual_load_count` | number | loads | preferred | closeout | crew/manager | non-negative | operational target |
| `actual_labor_hours` | number | hours | preferred | closeout | crew/manager | non-negative | operational target |
| `disposal_cost` | currency | USD | when applicable | closeout | manager/admin | non-negative | cost target |
| `direct_job_cost` | currency | USD | preferred | closeout | manager/admin | non-negative | margin target input |
| `gross_margin` | percentage | fraction | preferred | closeout | manager/admin | -1 to 1 | margin target |
| `manager_override` | boolean | none | yes | quote approval | manager | true/false | contamination flag |
| `override_reason` | category/text | none | if override | quote approval | manager | controlled category preferred | exclusion or segment |
| `loss_reason` | category | none | if lost/cancelled | closeout | manager/admin | controlled category | acceptance analysis |
| `model_version` | string | none | future | estimate | system | semantic version | reproducibility |
| `prompt_version` | string | none | future | estimate | system | semantic version | reproducibility |
| `pricing_rule_version` | string | none | future | quote | system | semantic version | deterministic baseline |

## Verified ML Data Fields

The audited `ML Data` worksheet currently maps to these canonical fields:

`estimate_date`, `service_type`, `final_completed_price`, `owner`, `city`, `payment_expense`, `distance`, `direct_job_cost`, `roi`, `client`, `net_profit`, `completed`, `notes`, `estimated_load_count`, `actual_load_count`, `workers`, `labor_hours`, `stairs`, `carry_distance`, `heavy_items`, `demo_required`, `resale_value`, `won_job`, `historical_data_completeness`, `historical_data_confidence`.

Verified gaps against the desired canonical schema:

- No stable non-PII job, opportunity, estimate, or customer-safe grouping ID.
- No dedicated completion date separate from estimate/date.
- No original quoted price or accepted price separate from completed price.
- No dedicated lost/cancelled outcome or loss reason.
- No disposal facility, disposal weight, or disposal cost field.
- No mileage or travel-time field.
- No gross margin, manager override, or override reason field.
- No photograph reference, model version, prompt version, or pricing-rule version field.

## Privacy Separation

Exclude direct identifiers from training: customer names, phone numbers, emails, full street addresses, payment details, and unredacted notes. Pseudonymize job and estimate IDs. Generalize geography to city or operating zone. Photograph references require access restriction and should be converted to governed visual features before modeling.

## Snapshot Manifest

Every training or benchmark run must record a manifest, not raw customer data:

```json
{
  "snapshotId": "whs-history-20260829-example",
  "retrievalTimestamp": "2026-08-29T12:00:00.000Z",
  "sourceAlias": "expected-whs-completed-jobs-sheet",
  "tabName": "configured-tab-name",
  "headerSchemaVersion": "historical-sheet-v1",
  "rowCount": 0,
  "eligibleRowCount": 0,
  "excludedRowCount": 0,
  "dateRange": { "earliest": null, "latest": null },
  "redactedExclusionReasons": {},
  "datasetChecksum": "computed-over-redacted-canonical-training-representation",
  "featureDefinitionVersion": "whs-feature-dictionary-v1",
  "targetDefinitionVersion": "whs-target-definitions-v1",
  "codeCommit": "git-commit"
}
```
