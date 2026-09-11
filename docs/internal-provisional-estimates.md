# Internal provisional estimates: PR 9

Current adjustment policy supersedes the retained generic risk adjustments below:
[Evidence-based handling and labor](handling-pricing-policy.md). Provisional display,
signed clarification and firm-quote safeguards remain; the old adjustments are preserved history.

## Baseline and scope

Starting commit: 02f951636fda97e01230d02007ffe0075cce07a2, branch
codex/shadow-inventory-readiness. PR 9 remains draft, stacked on
codex/estimate-clarification (PR 8), then PR 7 and PR 6.
Rollback reference: annotated tag preview-before-provisional-flow-02f9516.
Retained Preview: dpl_HBcvoqSZ32SsedW6WYLaAqKU6iKF,
https://whs-pricing-tool-p8kg-942uvsvqx-wade-home-services.vercel.app.
Production remains c2bd1a36cdfb283af04db0eaa32890fb1e1a8524, deployment
dpl_BfDLyWKSRYA8xnAzmDmhxgUyUnro,
https://whs-pricing-tool-p8kg-c5t4l2caq-wade-home-services.vercel.app.
Fresh candidate SHA/Preview are recorded in the PR after the automatic build.

This explicitly replaces the former all-prices-below-85 withholding policy.
It does not approve any customer-facing release, model promotion or Production change.

## Pricing and presentation

Valid core analysis can return estimateKind=provisional and the unchanged
priceJob range at any valid 1..100 model score. Staff see "Internal estimate -
requires review before quoting", assumptions and attributed scope/price drivers
before optional questions and collapsed technical diagnostics. Policy ranges are
not statistical prediction intervals; GPT's score remains uncalibrated, separate
from shadow readiness and never probability of correct pricing.

Server-side firmQuoteEligible retains determineQuoteStatus safety/configuration
rules and the 85 floor. Unknown/conflicting answers and remaining actionable
questions also prevent a firm quote, including at the round limit. Provisional
customerMessage is null; the client renders customer text only for eligible
internal quote drafts. Risk flags/price adjustments are not reduced merely
because a generic concern was answered. They are labeled retained model safeguards,
with supplied observations (or absence of specific support) for staff review.

The server returns no price/analysis/customer text for a failed core call, invalid
input/ticket, no identifiable removal items, explicit inability to bound removal
volume/quantity, confirmed additional items with unspecified scope (brief "yes"),
conflicting included scope, or more than two loads outside the formula's existing
percentage cap. Fixed reasons identify the missing scope or manager-pricing need.
This bounded text-based check is not comprehensive language understanding or
physical validation. A numeric model load estimate is still an estimate, not a
measurement; genuinely ambiguous cases need staff judgment. Missing dimensions
alone do not erase an otherwise bounded core provisional estimate.

## Clarification and evidence

Fixed actionable topic templates select at most two questions per round:
additional removal scope, container contents, disassembly, dimensions. Prioritize
unasked topics, then scope/contents/labor/dimensions. Resolved topics are suppressed
unless attributed conflicting evidence exists. Up to three signed rounds are
available; follow-up rounds are optional. Staff can stop at any supported range.
"Not sure / Show provisional estimate" locally keeps the current server-supported
range without another paid call. It does not apply unsent answers or mark a fact
resolved. Submitted Not sure stays unknown and prevents a firm quote.

Signed version-2 tickets bind the original inputs/photo bytes, offered question
IDs, round and HMAC of prior answer history. History stays in request memory;
tickets do not contain plaintext answers. The original 30-minute expiry is not
extended. Validation limits each answer to 400 characters, two per round, four
unique historical IDs, and 8,000 characters of serialized clarification input.
Old in-flight tickets must restart after upgrading this Preview. No photo/answer
storage, credential changes or customer-data logging was introduced.

"no" for dismantling becomes "No disassembly or detachment is required."
"no" or "nothing else" for hidden scope means no additional removal items,
not proof of light materials. "lightweight decorations" answers contents only.
"no" for contents/dimensions cannot establish those facts and stays unknown.
Original context and all prior signed answers are sent on reassessment; answers
are claims, not model instructions, additional inventory to double-count, or a
reason to inflate confidence. Specific material observations remain review
evidence even if boxes are light. Generic repeated warnings do not reopen resolved
facts. Missing trailer payload configuration is a business setup limitation,
not a recurring customer question or provisional-price blocker.

The client hides the old price/history panel during reassessment and after errors
or cancellation. Answers and the original ticket remain available for retry.
Abort and request-ID guards prevent duplicate or stale UI updates. Edit original
details starts a new analysis context. No server-wide exactly-once billing claim
is made; retrying a provider call may incur a new call.

## Verification and limitations

Focused synthetic tests cover server/client price separation, thresholds, strict
core failure, unbounded scope, unchanged price arithmetic, safety rules, typed
brief answers, generic/specific warning evidence, signed history, original inputs
and photos, expiry/tampering, unknowns, round cap and shadow failure isolation.
Typecheck is required. tests/provisional-estimate.browser.mjs is the current
synthetic smoke: desktop/mobile, 73/100 range, brief answers, optional round,
skip, original context/history transport, retry retention, duplicate/stale guards,
failed/unbounded withholding and collapsed diagnostics. Prior strict-withholding
browser scripts document superseded checkpoints, not the current acceptance policy.

Verified locally: six affected test files / 60 tests passed; after the final
firm-quote and round-limit checks, the two affected files / 27 tests passed.
Final typecheck and git diff --check passed (normal CRLF warnings only).
One synthetic Edge browser run passed at desktop and mobile sizes, with no page
errors or horizontal overflow. agent-browser CLI was unavailable, so this used
the existing bundled Playwright/Edge approach, not a new dependency.

No live OpenAI/Sheet calls were run. Local browser responses are intercepted
synthetic fixtures, not proof of live provider quality/latency. Inventory extraction
remains deferred; shadow failures/unavailable evidence cannot break core estimates.
No new dependencies, model/configuration changes, historical matching edits,
Sheets writes or pricing formula changes. Automatic Preview build only; no merge
or Production deployment. Existing branches/tags/deployments remain recoverable.

## Manual Preview acceptance

Authenticate through the existing internal gate. Upload ordinary photos of
lightweight side-yard junk; choose short carry and no stairs. State all shown
items are included. Submit, then answer offered questions briefly: "lightweight
decorations" for box contents, "no" for disassembly, "nothing else" for extra
scope. Confirm a supported provisional range appears even if the model stays
below 85, with the internal-review label and no customer quote text. Scores vary;
do not expect or force 73. Resolved questions must not repeat without specific
conflicting evidence. Optional Refine estimate can ask remaining questions;
Not sure must leave unknowns and review restrictions intact. Technical shadow
diagnostics start collapsed and honestly report deferred inventory extraction.
Any explicit unbounded scope/provider failure must show no price and a reason.
