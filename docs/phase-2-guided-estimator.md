# Phase 2 guided estimator: Preview candidate

Not release-ready. Tristan's authenticated Preview test remains required.

## Verified baseline and dependency

- Preserved PR #9 head: `55d2d8d9d3a29e647670e048bdd03a523986b5d1`.
- Annotated snapshot: `pre-phase-2-snapshot-55d2d8d`.
- PR #9 was already merged into `codex/internal-pilot-release-55d2d8d`, then main through PR #10. Its original branch is preserved. This isolated feature starts at that tested #9 head; the new draft targets main because the dependency is already merged.
- Verified main/Production: `90ae1c249069a9f5ff05018c48271403dfad33b2`, deployment `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg.vercel.app.
- Retained Production deployment URL: https://whs-pricing-tool-p8kg-5mi2ff1wm-wade-home-services.vercel.app.
- Tested baseline Preview retained: https://whs-pricing-tool-p8kg-iebq3gbd1-wade-home-services.vercel.app (`dpl_CR1v9tNcFKrthwChBhLohngsm16R`).
- No existing branch, tag, commit or deployment is overwritten. This phase does not promote or merge anything.

## Workflow and boundaries

Six steps: welcome, location, job type, access, photos, notes/review. Uses only the existing `public/winston-logo.png` asset, containing Winston and WHS branding. No separate brand asset exists in this repository; none fetched or generated.

The optional city/neighborhood and selected item location are included in the original signed notes context. Do not enter customer identities or full addresses. Distance tier is selected explicitly using existing choices; no geocoding or driving-distance calculation. Item location never implies carry distance or stairs. Both route facts must be confirmed explicitly; an unknown route requires staff confirmation, not a guessed surcharge. A second-floor location can legitimately have no stairs via an elevator.

Planned workers are no longer collected. Missing crew is `null` through validation, signed context and the existing model input, not silently one worker. Older explicit crew inputs still receive the existing range validation. No crew-based calculation is added; pricing.ts changes only its input type. Handling remains evidence-based low/medium/high, routine labor included. Pricing constants, formulas, model selection/prompt, historical matching and quote restrictions are unchanged.

Client and server share a ten-image maximum. The existing 3.5 MiB combined processed-image budget, 3 MiB per-image ceiling, quality/resolution floors and Vercel request safeguards remain unchanged. Ten complex images may not fit: controlled rejection asks for fewer/smaller photos rather than reducing quality beyond the existing floors or raising the budget. Photos remain in browser memory; no persistent photo storage.

Accessible native radio groups, step headings/focus, labeled fields, error/status announcements and reduced-motion busy state. Original fields/photos survive navigation and signed clarification. Existing abort, duplicate and stale-response guards remain. Failed reassessment retains answers and withholds stale prices. Successful provisional ranges remain prominent; review, assumptions, model-estimated loads, price drivers, historical reference and uncalibrated score use native expandable sections. Technical diagnostics remain collapsed.

Clarification generation is reused unchanged: at most two analysis-relevant unresolved concerns, no generic fallback, question-linked brief answers, Not sure remains unknown, original signed context/history preserved. No new readiness policy, inventory extraction or model training. Historical references retain existing Preview-only restrictions. Analysis score is uncalibrated; the policy price range is not a prediction interval.

## Validation

- 80 focused tests passed across guided field mapping, photo optimization, server validation, upload limits, signed clarification, response guards, handling facts and pricing regression.
- Typecheck passed.
- One synthetic desktop/mobile browser flow (1280px/390px) passed: full step navigation, explicit access, ten real browser-optimized synthetic images under the unchanged budget, preserved notes/photos, below-85 provisional display, no firm quote, brief answers, failed reassessment/retry, duplicate/stale cancellation, unbounded scope withholding, reduced motion, focus, loaded brand asset and no horizontal overflow/page errors. Screenshots visually reviewed.
- Browser API responses are mocked, not live provider verification. First smoke attempt stopped at a test selector matching Next's route announcer; narrowing the test selector resolved that test-only issue.
- No live OpenAI/Sheets request, broad build, dependency audit or new dependency. Automatic Preview build and exact SHA are recorded in the draft PR.

## Manual Preview acceptance

1. Authenticate to the PR's exact Preview URL using existing internal access.
2. On a phone, start the estimate; choose the actual distance tier and job type. Select garage or second floor and confirm carry/stairs explicitly. Verify Back retains selections.
3. Select ten ordinary test photos. Wait for optimization. If quality-preserving compression cannot fit, verify the actionable error and retry with fewer photos. Review the selected count and details.
4. For lightweight side-yard junk, specify short carry, no stairs, all shown items included and easy one-person handling. Analyze once; verify busy/cancel behavior.
5. Answer only offered concerns briefly, such as lightweight decorations, no disassembly, nothing else. Confirm resolved questions do not repeat without contradictory evidence, supported provisional pricing remains visible below85, and no unapproved firm quote appears.
6. Expand assumptions, loads and price drivers. Check low handling/no generic labor or hidden-scope surcharge absent specific evidence. Do not expect a fixed real-model price or load percentage.
7. Staff reviews and approves before quoting. Report Preview URL, step and sanitized error/time for failures; do not paste secrets or customer photos into PRs.

Rollback for this unmerged phase: use the retained tested Preview or start a new branch from the snapshot tag. Do not reset/delete existing branches. Production has not been changed.
