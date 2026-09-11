# Low-confidence clarification workflow

Branch: codex/estimate-clarification, stacked on PR #7 / codex/internal-historical-reference
(which remains stacked on PR #6). Starting commit:
215551d16f47864d34df8019841526e67393ba60.
Annotated rollback tag created before edits and pushed:
preview-before-clarification-215551d.
Retained Preview rollback deployment: dpl_onpb9kf1Y26FotPrfJ9kx4pY9qoj,
https://whs-pricing-tool-p8kg-h5n346vyd-wade-home-services.vercel.app.

## Workflow

The existing schema explicitly defines confidencePercent on a 1..100 scale.
The clarification check normalizes percent / 100 and compares with 0.85, not a
calibration claim. Exactly 85 and above retain existing quote-status behavior.
Existing configured direct-quote thresholds and manager/safety rules still apply.

An initial result below 85 has no pricing calculation, analysis text, customer
message, competitor figures or historical panel in its response. It returns only
fixed questions/status and a signed context token, or unpriced manager review if
no supported unanswered actionable question is found. Low confidence alone never
manufactures a question about a topic absent from the existing analysis.

Questions are selected from questionsToAsk, uncertaintyNotes and warnings by
conservative topic rules: hidden/additional material, closed-container contents,
dismantling/attachments and unclear dimensions. Templates are deduplicated by
topic; structured stairs/carry/crew/job-type questions are not repeated. Explicit
answer patterns in original notes suppress corresponding questions. This bounded
selector is not comprehensive language understanding: unsupported ambiguities go
to manager review rather than arbitrary generated questions or a firm quote.

Answers are bounded to four entries of 400 characters, with an explicit Not sure
choice. Server validation requires the exact signed question IDs, nonempty answers
or Not sure, original validated job fields and identical photo bytes/MIME types.
The 30-minute token contains only an expiry, topic IDs and keyed context digest,
not photos, notes, answers or prices. It is signed with a domain-separated HMAC
using the existing server-only OpenAI key, not the internal password exposed to
staff. Rotating that key invalidates outstanding tokens. It is not an auth change.

Reassessment uses original inputs/photos plus a separate untrusted employee-answer
prompt. It never instructs the model to raise confidence. A completed clarification
does not trigger another automatic question loop. Remaining confidence below 85
or Not sure forces provisional internal pricing with manager review and no firm
customer quote; all other existing safeguards still apply. Provider/validation
failures return no fabricated price. Expired/modified contexts require explicit
restart; failed reassessments may retry the same signed token while valid.

## Client and privacy

Original processed photos/FormData and answers stay only in browser memory.
No persistent photo storage or localStorage is introduced; a page reload loses
the in-memory draft. The original form is locked during requests/clarification.
Not sure preserves typed text locally for unchecking, but sends an empty answer.
Recoverable reassessment failures retain questions, original context and answers.
Explicit Edit original details unlocks the original form; Cancel request aborts
the client wait without claiming to cancel already-running provider work.
Synchronous request guards prevent double submits, and request generations ignore
stale responses after cancellation/unmount/photo replacement. Busy state is plain
accessible text with disabled controls, not the abandoned PR #2 implementation.

No clarification answers, credentials or photos are added to logs. Processed photo
count/size limits remain unchanged; clarification payloads have additional bounds.
No Google reads/writes or historical matching changes occur in this feature.

## Verification

27 focused tests passed across clarification, existing analyze route, OpenAI
wrapper, quote-status and source guards. A wrapper identity assertion initially
failed after schema validation returned a clone; validation now preserves the
existing object identity, and the affected 19 tests passed on rerun. Typecheck
passed. Synthetic Edge/Playwright smoke passed at 1280px/390px with screenshot
review: no pre-clarification prices, original context, Not sure, retry retention,
duplicate-submit guard, canceled stale response isolation and continued-low review.
No live OpenAI/Sheet calls, full build or dependency audit were run locally.

## Manual Preview gate

Use only the whs-pricing-tool-p8kg project Preview, sign into Vercel if prompted,
then existing internal Basic auth. Submit photos with genuinely uncertain scope.
For a returned confidence below 85, expect the clarification panel and no quote,
range, historical prices or competitor figures. Answer known details and select
Not sure for unknowns; reassess once. Verify a normal updated result with existing
safeguards, or provisional manager review if still uncertain. There should be no
automatic repeated question loop. If no actionable questions exist, expect unpriced
manager review. Do not intentionally fabricate confidence to force the live path.
The synthetic script deterministically covers both sides of the 85 boundary via
unit tests and the two-step UI via mocked provider responses.

To test recovery, interrupt only the reassessment request and retry: answers/photos
must remain. Confirm high-confidence heavy/special-handling jobs still require
review. Historical references may still abstain under PR #7's unchanged rules.

Production/rollback remains c2bd1a36cdfb283af04db0eaa32890fb1e1a8524,
dpl_BfDLyWKSRYA8xnAzmDmhxgUyUnro,
https://whs-pricing-tool-p8kg-c5t4l2caq-wade-home-services.vercel.app,
tag pricing-tool-schema-v2-stable-2026-09-05. Pricing formulas/constants, configured
model, initial analysis prompt, auth and website repository are unchanged.
No merge, Production deployment, release or deletion is authorized.
