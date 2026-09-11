# PR 8: confidence and strict withholding

Starting commit: c12f7fe071d9c833a5d0c33eebf7edee31a8a3b7. Preserved before edits
with pushed annotated tag preview-before-strict-withholding-c12f7fe. Retained
Preview: dpl_6LKxFnwqXNStrXrYy7yXsyLd1wGa,
https://whs-pricing-tool-p8kg-kjf6cwo01-wade-home-services.vercel.app.
Keep PR 8 draft on codex/estimate-clarification, stacked on PR 7, then PR 6.

## Score source

openai-analysis.ts receives response.output_parsed.confidencePercent from GPT's
structured response. analysis-schema.ts validates z.number().min(1).max(100).
The score is not computed from prediction errors. clarification.ts performs only
confidencePercent / 100 < 0.85; no rounding, calibration transform or boosting.
quote-status.ts separately compares the raw score to the configured direct-quote
threshold and applies risk/scope rules. UI formerly displayed the raw value as a
percentage; it now labels it Uncalibrated analysis-confidence score: N/100, not a
probability of price correctness. API metadata states model_reported and
calibrated=false. The 85 cutoff is workflow policy, not measured accuracy.

No held-out calibration evidence for this GPT score was found in repository code,
tests or benchmark documentation. Historical quote evaluation remains blocked on
provenance/NO_MODEL_READY. Synthetic interval checks and future monitoring plans
are not calibration evidence for this score.

## Confirmed bug and correction

The old gate checked !answers && needsClarification(analysis). After answers,
manager-review status was set but priceJob still ran and returned its range.
This explains the displayed range at 73, not the specific live price change.

Every successful analysis now checks needsClarification BEFORE priceJob. A
below-85 reassessment returns pricing/analysis/inputs null, priceWithheld=true,
fixed unresolved-issue labels, the labeled score, and clarification=null. No
second question loop. Raw model warnings/questions cannot leak embedded prices.
Client result/competitor/customer-message/historical panels additionally reject
any low-score priced legacy payload; fee-option labels are omitted while withheld.
At 85 or above, existing safety rules still apply. Historical matching is unchanged.

## Price drift investigation

Tests confirm signed binding to identical original photo bytes/MIME and validated
details. Reassessment appends one answer block to the same original prompt/images,
without overwriting inputs or summing old/new scope. Not sure remains unknown.
No deterministic context-loss, duplicate-scope or extra-charge defect was found.
The previous generated load/risk analysis is not anchored: GPT makes a fresh
inference with the new answers. Exact live changes cannot be inferred from 73 alone.

The unchanged price function uses estimatedLoadPercent, heavyDebrisRisk,
hiddenDebrisRisk, difficulty and original distance/carry/stairs/job type. Neither
confidence nor clarification text is a direct pricing input. The formula is:
base=max(minimum, round(clamp(loadPercent,10,200)/100*450)); existing risk/access
adjustments yield low=max(minimum, round((base+adjustments-35)/5)*5),
high=max(low, round((base+adjustments+45)/5)*5),
suggested=round(((low+high)/2)/5)*5.

Synthetic fixtures prove changing confidence 90 to 73 alone leaves raw priceJob
output identical; changing load percent 50 to 80 adds 135 to base, and low to high
heavy risk adds 125 to adjustments. These are possible mechanisms, NOT a diagnosis
of Tristan's live drift. No price anchoring or prompt/model change was introduced.
For that exact comparison, request only original job details, questions/answers
and displayed results with identifiers removed, not credentials or new live calls.

## Verification and manual gate

32 focused tests passed: initial/reassessment boundaries including 73, 84, 85, 86;
context preservation, Not sure, labeling, sanitized withholding, existing analyze,
OpenAI and safety behavior. Typecheck passed. Synthetic desktop/mobile browser
check passed for strict 73 withholding, absent historical/quote figures, no further
questions, retained answers/retries and stale/duplicate guards. A test selector
was narrowed after matching Next.js's route-announcer alert; no live call repeated.

Authenticate to the new p8kg Preview. Complete one clarification. Below 85, verify
Manager review required, uncalibrated N/100 label, unresolved issues and no range,
quote, competitor or history amounts. Inspect /api/analyze: pricing/analysis null,
priceWithheld=true, clarification=null. No second loop. At 85 or above, verify
existing special-handling/manager rules still apply. Retry failed reassessment to
check retained context. No live model/Sheet calls or full builds/audits were run.

Production remains c2bd1a36cdfb283af04db0eaa32890fb1e1a8524,
dpl_BfDLyWKSRYA8xnAzmDmhxgUyUnro, with tag pricing-tool-schema-v2-stable-2026-09-05.
No pricing/model configuration/auth/historical matching/website/Sheet changes,
merge, Production deployment, deletion or rewriting of preserved versions.
