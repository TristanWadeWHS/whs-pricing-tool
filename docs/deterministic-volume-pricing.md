# Deterministic volume pricing Preview

## Baseline and preservation

- Starting branch: `codex/local-city-directory`, draft PR #13, based on
  `codex/phase-2-guided-refinement` (PR #12).
- Exact baseline: `ae5f3e14d57081764fe8a3745bf8775647d1bcca`.
- Snapshot: `pre-volume-pricing-snapshot-ae5f3e1` (annotated; never move).
- Retained baseline Preview: https://whs-pricing-tool-p8kg-46qlq7ft4-wade-home-services.vercel.app
  (`dpl_6fMVnqeTVhpMLDoNiD4ethE86bTf`).
- New isolated branch: `codex/deterministic-volume-pricing`, stacked on PR #13.
- Verified main/Production: `90ae1c249069a9f5ff05018c48271403dfad33b2`,
  `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg.vercel.app.
- Rollback for this experiment: use the retained baseline Preview or create a
  new branch from its snapshot. No Production change or rollback is needed.

## Trace of the reported $420-$500

The original response/adjustment breakdown was not available. This is an exact
code-based synthetic reproduction, not proof of the live job's inputs.

Old `priceJob` used the model's percentage (clamped 10-200), multiplied by $550,
then floored to the selected distance minimum ($130/$145/$175). It added:

| Component | Source | Old amount |
| --- | --- | --- |
| Medium/high handling | Reconciled notes, question-linked answers or model observations | +$50 / +$125 |
| Medium/long carry | Entered access field | +$40 / +$90 |
| Some/heavy stairs | Entered access field | +$40 / +$100 |
| Cardboard-only discount | Selected sole job type | -$40 |
| Lower/upper band | Hard-coded policy, not model volume endpoints | -$35 / +$45 |

Endpoints were rounded to $5 and floored by the distance minimum; suggested
quote was their midpoint rounded to $5. Confidence, generic labor, hidden-risk
and material flags had no direct numerical fee at this baseline, but handling
observations could still create a fee. Model dollar fields were not accepted.
An unrelated $650 competitor-equivalent calculation did not set the estimate.

Fixed synthetic 60%, short carry, no stairs, mixed junk, under25, model
observation "The item requires two people": $330 base + $125 handling = $455;
$455 - $35 = $420, $455 + $45 = $500; suggested quote $460.
The same inputs now produce $330, no automatic adjustment and no invented band.
Other input combinations could reproduce that range; the original load and
adjustment breakdown would be needed to attribute the live result uniquely.

## Current policy

`max(distanceMinimum, estimatedLoadPercent / 100 * 550) + approvedAddOns`.
Prices round only to cents. 60% = 7.2 cubic yards = 0.6 trailer equivalents;
within25 minimum $130 does not raise the $330 volume calculation.
Invalid core percentages fail closed instead of being clamped into a price.

No model-derived handling/material/difficulty/labor/hidden/confidence/risk charge,
automatic job-type discount, fabricated dollar band or competitor/savings claim.
Operational handling definitions and safety/firm-quote review rules remain.
Existing access rates above are available only as explicit unchecked-by-default
staff approval options. They match entered access, are deduplicated, shown with
individual amounts and signed into clarification context. Staff must not approve
overlapping work twice. No new rates or special-service pricing are invented;
other exceptional work remains staff review, not an automatic fee.

The existing model schema has a string `estimatedLoadRange`, not typed endpoints.
The adapter accepts only explicit percentage intervals (e.g. `50-70%` or
`50-70% of a 12-yard trailer`), bounded 1-200 and containing the point estimate.
Dollar ranges, load counts, unsupported prose, inverted/conflicting intervals and
unverified units do not become endpoints. These fall back to the valid point
baseline with an explicit no-usable-interval explanation, not an invented range.
Each valid endpoint uses the same minimum and staff add-ons. 50-70% -> $275-$385.
This remains model-estimated volume, not measured scope or a statistical interval.

## Verification and manual gate

Focused pricing, facts, request validation, guided mapping, clarification,
analyze-route and quote-safeguard tests; typecheck; one desktop/mobile synthetic
browser smoke using real priceJob with mocked API/model/historical responses.
Browser checked point display, separate approved $90 item, range reassessment,
preserved location/approval/photos, reset and failures. No live model/Maps/Sheets.
Validation totals and automatic Preview status are recorded in the draft PR.

Manual Preview: authenticate, select Lake Forest and staff-confirm its actual
distance tier. Enter scope/access/photos and leave add-ons unchecked. Compare
the displayed model percentage with the volume calculation; 60% must be $330
before approved add-ons when minimum is $130. A point must show one amount;
an explicit supported load interval must map its endpoints. Reassess via brief
clarification and verify approval/context persist. Approve an applicable existing
access item separately to verify itemization. Real photos can yield different
model percentages; do not interpret the fixture as actual-photo accuracy.

No auth/model selection/history matching/Sheet/environment/website changes.
No merge, Production deployment, deletion or rewrite of preserved versions.
