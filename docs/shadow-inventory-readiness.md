# Internal Preview: reconciled facts and shadow volume

## Baseline and dependency

Starting branch codex/estimate-clarification, commit
39319a6164e8511e8e34fe617c65be3773ba3de5 (PR 8). New isolated branch:
codex/shadow-inventory-readiness. Draft PR targets codex/estimate-clarification,
not main. Dependency chain: this PR -> PR 8 -> PR 7 -> PR 6.

Preserved annotated rollback tag: preview-before-shadow-readiness-39319a6.
Rollback Preview: dpl_EB6LzLd3PSnNc6rNEqXrjJ6JcHKk,
https://whs-pricing-tool-p8kg-5mtmggftj-wade-home-services.vercel.app.

Verified unchanged main/Production: c2bd1a36cdfb283af04db0eaa32890fb1e1a8524,
dpl_BfDLyWKSRYA8xnAzmDmhxgUyUnro,
https://whs-pricing-tool-p8kg-c5t4l2caq-wade-home-services.vercel.app.
Existing pricing-tool-schema-v2-stable-2026-09-05 and all older references remain.
Project: whs-pricing-tool-p8kg / prj_jzzxkDJnnDt2Bu0HiJvwpmrwThPU.

## Reconciliation

clarification-facts.ts builds a typed ledger for the existing hidden, contents,
dismantling and dimensions IDs. Sources distinguish original notes from answers
validated against the signed original photo/input context. Explicit answers are
attributed claims, not objective measurements. Not sure and unknown phrases stay
unknown; dimensions require numeric/unit evidence. Explicit absence of containers
can make the contents check not applicable. No answer mutates original inputs.

Repeated GPT uncertainty does not reopen a resolved ledger entry. Reopening
requires a structured, topic-specific contradictory observation with a valid photo
reference, region and exact quoted answer. Such evidence remains MODEL-REPORTED
and requires staff verification, not automatic acceptance as ground truth.
Simple explicitly opposite original-note/answer scope or disassembly assertions
are also conflicts, not silent overwrites. General prose is not a comprehensive
semantic contradiction detector. Existing model risk flags/quote gates remain
unchanged; an applicable safety gate can still require review without declaring
that an answered fact is unknown.

The synthetic Christmas-decoration example resolves contents, hidden/additional
scope and no-disassembly claims; an unknown dimension answer remains unknown.
The fixed manager-review issue list respects these resolutions. Original model
analysis remains a separate assessment rather than a deterministic fact source.

## Shadow inventory and geometry

Only Preview/development requests add the nullable structured shadow extension
and evidence instructions to the existing model call. No second model call, new
model, selection change or numeric confidence boost is introduced. Production
requests retain the old schema/prompt path. Extending a Preview prompt can change
model inference; the existing GPT load/risk estimate is NOT claimed invariant.
Pricing code, policy constants and eligibility gates are unchanged. The shadow
calculation is not an input to any of them.

Each item/group declares ID, parent ID, quantity/count evidence, photo references,
overlap state, material class, dimension bounds/units/source, packing evidence and
disassembly state. Duplicate same-ID views merge only when their other fields
agree. Conflicting IDs, uncertain overlap, invalid references or containment cycles
abstain. Only roots are counted; pile/group constituents are never additionally
summed. Unsupported roots cause total-volume abstention, not a partial job total.
This does NOT prove visual identity: differently named physical duplicates can
still escape a mistaken model grouping. Staff must review grouping; no measured
deduplication accuracy is claimed.

For each root: quantity * length * width * height * packing expansion, calculated
at lower/upper bounds after conversion to cubic yards. Supported units: inches,
feet, yards, centimeters and meters. Employee dimension evidence requires exact
input excerpts, all numeric bounds and matching units. A measurement label also
requires an explicit employee measurement statement. Photo estimates remain
labeled visual guesses; arithmetic does not make them measurements.

Loaded-envelope dimensions already include stacking/voids (factor 1). Otherwise
only explicit employee-specified expansion factors in [1,3] are accepted with
quoted numeric support. This bound is a conservative input-policy guard, NOT a
universal packing assumption. No default compaction factor exists. Smaller
post-disassembly dimensions require explicit employee confirmation. Unknown
dimensions/count/packing produce unavailable reasons. Source excerpts and
assumptions are still model extractions, not independently verified physical data.

Fractional load equivalents = cubic yards / nominal 12. Whole-trip bounds = ceil
of each volume-only equivalent. These are geometric lower bounds, NOT approved
hauling trips: actual packing, item fit, disposal and weight may require more.
Dense/restricted flags remain separate. No density, mass, legal payload or towing
capacity is invented. Payload evidence is always reported unavailable in this
bounded phase; no new form or capacity source was added.

Synthetic worked example: two declared distinct loaded crate envelopes, each
3 ft x 3 ft x [3,4] ft, already including voids. No disassembly. Total =
2 * 3 * 3 * [3,4] / 27 = [2,2.6667] cubic yards. Fractional equivalents =
[0.1667,0.2222] of a nominal 12-yard trailer; volume-only trips [1,1]. This is
a synthetic arithmetic example, not a measured customer job or payload approval.

## Provisional readiness policy

Weights: removal scope 25, identity/visibility 20, dimensions/volume 30,
material/weight 15, access/labor/disassembly 10. These are provisional business
policy weights, NOT statistical confidence, calibrated accuracy or probabilities.
Historical support remains separate and earns no readiness credit.

Fixed checks are explicit in shadow-readiness.ts and displayed in the panel.
Within a component, fraction = resolved applicable checks / applicable checks.
Unknown/conflicting checks score zero, never default to resolved. Only an explicit
reason can justify not-applicable; it is not a missingness escape hatch. Fully N/A
components are excluded, and remaining policy weights are renormalized to 100.
All-N/A has no score. Readiness = sum(effective weight * component fraction).
Runtime weight/payload checks remain unknown rather than claiming hauling safety.
Inventory identity and material classifications are attributed model evidence.

Critical blockers are shown independently: unresolved scope, conflicting facts,
unavailable geometry, dense/restricted material review, and missing weight/payload
evidence. They cannot be compensated for by other components. This phase neither
defines a readiness release threshold nor replaces the existing below-85 gate.
NO_MODEL_READY and historical provenance blockers remain unchanged.

## Privacy and failure behavior

Diagnostics contain only fixed labels, enum sources/states, ordinal envelope
numbers, photo indexes and arithmetic. No raw answer/note/evidence excerpt, model
item ID, customer identity, image content or price text is serialized in the
diagnostic response. Raw shadow evidence is removed from the returned analysis.
No new persistence, external calls, environment changes or logs were added.
The existing internal access middleware and response protection are reused.

Below 85 still returns analysis/pricing/inputs null, including after reassessment.
The diagnostic section can appear without any monetary amounts; historical and
other price panels remain withheld. Malformed shadow evidence is marked
unavailable after core analysis validation. Diagnostic exceptions are caught and
do not break estimation. Provider/SDK failure before a usable core response still
uses the existing analysis_failed no-price behavior; there is no paid retry.

## Verification and manual Preview gate

58 distinct focused tests passed across shadow inventory, clarification, schema,
OpenAI wrapper and analyze route. After final bounds/provenance changes, reran only
the 45 affected inventory/clarification tests. Typecheck passed. Strict SDK format
generation was tested locally without calling a model. Browser smoke uses only
synthetic images and intercepted model/history responses, on desktop and mobile.
It verifies the four-answer example, unknown dimensions, 73/100 withholding,
retained context, volume display and diagnostic failure leaving the quote intact.
Screenshot reviewed for mobile overflow. The initial 800px browser fixture hit the
existing optimizer minimum; the established 1600px fixture passed. Optimizer code
was not changed. No full build/audit/test suite, live OpenAI or Sheet call ran.
The only build requested is the automatic Git Preview build after pushing.

Manual test in the new Preview:
1. Authenticate using existing internal access. Use ordinary supported photos.
2. Submit a job with unresolved container/scope questions. If clarification appears,
   answer lightweight Christmas decorations, nothing underneath/outside photos,
   and no disassembly. Choose Not sure for dimensions if unmeasured.
3. Verify corresponding facts resolve but dimensions stay unknown. At a GPT score
   below 85, verify no monetary amounts or customer quote/history figures appear;
   after reassessment there is manager review and no repeat clarification loop.
4. Where actual dimensions are known, supply them with units and loaded-envelope
   context. Review counted groups, omitted children, source labels, geometry and
   12-yard equivalents. Missing evidence must show unavailable, not invented volume.
5. Confirm the existing price does not consume shadow volume/readiness; at >=85
   the old safety gates still apply. Weight/payload remains unapproved.

No merge, Production deployment, Sheet write, historical matching change or model
promotion is authorized by this draft. All preserved branches/tags/deployments
remain recoverable. The Preview URL and final verification are recorded in the PR.
