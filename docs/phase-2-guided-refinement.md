# Phase 2 refinement: blocked-location Preview candidate

Draft, not release-ready. No merge or Production deployment authorized.

Location follow-up: [Google Maps setup and focused verification](./phase-2-location-provider.md) supersedes the placeholder-endpoint section below. That section is preserved as the original candidate record, not current implementation guidance.

## Verified baseline and preservation

- PR #9 is closed/merged. Preserved head `55d2d8d9d3a29e647670e048bdd03a523986b5d1`, branch `codex/shadow-inventory-readiness`; merged through integration branch `codex/internal-pilot-release-55d2d8d`, then PR #10. This remains the latest candidate explicitly confirmed manually tested in the task history.
- PR #11 is open/draft at `46bf378b6b40cb61112faabc1654bbc1fc39a4c0`, branch `codex/phase-2-guided-estimator`, base main. Automated checks passed previously; no manual acceptance is recorded. Do not relabel it manually tested.
- This new isolated branch `codex/phase-2-guided-refinement` starts at #11's exact head and its new draft PR targets #11's branch. Existing branches stay untouched.
- Annotated baseline snapshot: `pre-phase-2-refinement-snapshot-46bf378` at the full #11 SHA above.
- Production/main: `90ae1c249069a9f5ff05018c48271403dfad33b2`; deployment `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg-5mi2ff1wm-wade-home-services.vercel.app, alias https://whs-pricing-tool-p8kg.vercel.app.
- Rollback for this unmerged experiment: retained #11 Preview https://whs-pricing-tool-p8kg-8asa0acis-wade-home-services.vercel.app (`dpl_H4AX88zS2AgPf1UbpMYHtbWCKSLx`), or start a new branch at the annotated snapshot. Never reset/delete preserved branches or deployments.

## Changes

Existing Winston/logo asset appears in the resettable header on every step. Centered welcome, requested heading, prominent start button, CSS spiral entry and reduced-motion alternative. Centered analysis status avoids accuracy promises. Start Over and header navigation abort active requests, invalidate stale photo/request work and clear photos, job details, results, signed history and answers by remounting the guided form. No persistent photo storage.

Multi-select uses repeated `jobType` form fields. Server validates every entry, rejects duplicates/unsupported entries, retains `jobTypes` as an array and a lossless joined `jobType` compatibility label. All types reach the model, signed context, safety review and result display. Any selected special-risk category retains review requirements. The existing cardboard-only discount applies only when cardboard is the sole selected category; it is not an additive per-category discount.

Ten-photo optimization, quality floors, 3 MiB per-image and 3.5 MiB combined processed-size limits remain unchanged. Explicit carry/stairs remain independent of floor/location; no planned crew field. Existing signing, original context, brief answers, Not sure, retries, withholding and firm-quote protections remain.

Clarification questions now require a relevant unresolved concern AND supported photo/scope evidence (occluded view, closed containers, fasteners, unmeasured scope), or a specific essential scope blocker from the existing assessment. A generic suggested question alone does not suffice. Resolved facts still suppress repeats without existing conflict evidence. Fixed safe question templates/IDs remain. These bounded text checks use model-reported observations, not verified physical truth; inventory extraction remains deferred.

## Authorized pricing change

Full nominal 12-cubic-yard load: **$550**. Volume base is `(P / 100) * 550`, retaining fractional dollars before existing minimums, adjustments and final range rounding. Removed only the old whole-dollar rounding of the intermediate base so 55% is exactly **$302.50**. The existing 10-200 percentage clamp is retained; out-of-supported-scope quote safeguards remain.

Fixed synthetic 55%, under25, short carry, no stairs, confirmed easy one-person handling:

| Component | Preserved #11 | New Preview |
| --- | ---: | ---: |
| Volume base | $248 (old rounded $450 rate) | $302.50 |
| Adjustments | $0 | $0 |
| Existing rounded policy range | $215-$295 | $270-$350 |
| Suggested midpoint | $255 | $310 |

Minimums $130/$145/$175, medium/high handling $50/$125, carry $40/$90, stairs $40/$100, cardboard-only -$40 and final range/rounding rules are unchanged. Routine labor included; no new multipliers. The prompt references the same shared $550 constant; model selection and core schema are unchanged. Identical validated inputs/analysis yield identical deterministic prices. New model calls can produce different load estimates; no reproducibility, calibrated accuracy or statistical interval claim.

## Blocking maps dependency (not implemented as a fake service)

No maps/geocoding/routing adapter or approved origin exists in the repository. No maps-related configuration was present in the local process; only `.env.example` exists locally. Hosted secret availability could not be established through the project-metadata tool and is not claimed absent. No credentials were pulled or exposed.

The California search UI is prepared, but its protected endpoint returns **503 / blocked / no suggestions / no-store**. It does not invent a city list, geocode, call a provider, calculate straight-line miles or choose a fallback tier. Manual distance selection is removed. Other steps can be reviewed without a location, but Analyze is disabled until resolved. New guided-v2 requests also fail closed server-side before any model call, even if a client forges a tier. The pre-existing authenticated staff API contract remains compatible; that is not evidence that automatic routing works.

Next action requires an approved Places/geocoding + driving-route provider, credentials available server-side through authorized configuration, and a confirmed routing origin in Rancho Mission Viejo. Implement provider-backed CA suggestions, disambiguation, routing and server-verifiable selection bound to the request before removing the explicit server gate. Adding a key alone does not enable the currently absent adapter. A city/neighborhood route is only a representative destination, not exact miles to the job address. No new service/dependency/account or paid provider call was introduced here.

Pure tier helper preserves existing bands: <=25, >25 through40, >40 through65 driving miles. Invalid/nonfinite/negative/out-of-service distances and non-CA/incomplete results do not resolve. Tests use synthetic routes only.

## Verification and manual gate

100 distinct focused tests passed: initial 11 files/98 tests plus two added API preservation/blocker tests (affected clarification file 23 passed). Typecheck passed. Synthetic desktop/mobile browser flow passed: actual canvas optimization of ten images, unchanged budget, maps blocker, mocked CA routing, multi-select preservation, failed reassessment/retry, duplicate/stale safeguards, price withholding, both resets, logo rendering, reduced motion/spiral, expandable results and no page errors/overflow. Screenshots reviewed. No paid model or live maps/Sheets calls. No broad builds/audits/dependencies; automatic Preview build recorded in PR.

Manual Preview: sign in, inspect centered welcome and every-step logo, try a California query and confirm explicit maps blocker/no guessed tier. Use Review other steps to inspect multi-select/access/photos/review; submission must remain disabled with unresolved location. Header resets all fields/photos. Full real estimate acceptance must wait for approved routing integration; synthetic browser success is not live end-to-end verification. Model-estimated loads, uncalibrated score, deferred inventory and NO_MODEL_READY limitations remain.

Production, auth, adjustment amounts, historical matching, Sheet data and website repository unchanged. No customer information or credentials committed. No existing refs, deployments or failed experiments deleted or rewritten. Candidate reference and exact Preview are recorded in the draft PR; no release-ready tag.
