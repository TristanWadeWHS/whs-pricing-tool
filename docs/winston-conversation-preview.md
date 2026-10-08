# Winston conversation proof of concept

## Baseline, isolation and rollback

Starting candidate: `0e11d32142d62216a9b8bb5740ac1e74a8e888ec`, draft PR #14,
`codex/deterministic-volume-pricing`. Verified stack: #14 -> #13 -> #12 -> #11 -> main.
Annotated snapshot: `pre-conversation-snapshot-0e11d32`.
New branch: `codex/winston-conversation-preview`, stacked on #14.

Retained candidate Preview: https://whs-pricing-tool-p8kg-p77drnsbv-wade-home-services.vercel.app
(`dpl_2Q8fRWwSLt5AXk8un1HCAwJwohJx`). Rollback this experiment by opening
that retained Preview or creating a new branch from its snapshot; never reset history.

Verified Production/main baseline: `90ae1c249069a9f5ff05018c48271403dfad33b2`,
`dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg.vercel.app.
No Production or environment changes are authorized or required.

Completion-only pricing follow-up starts from tested PR #15 at
`13aaff0b174b34735c2bf9f8954ad430035b107d`, preserved with annotated tag
`pre-winston-ready-snapshot-13aaff0`. Isolated branch:
`codex/winston-completion-only-pricing`, stacked on `codex/winston-conversation-preview`.
Prior Preview remains available at
https://whs-pricing-tool-p8kg-h8s0mz5tg-wade-home-services.vercel.app
(`dpl_2zKD3iH64s2G4bk9zoFFsxYsreAX`). Production/main and its rollback deployment
above were reconfirmed unchanged. No existing ref or deployment is replaced.

## Experience

The authenticated root is a mobile/desktop conversation with Winston, a persistent
composer, multi-select service bubbles, room/photo batches, progress, retries and
Start Over. Each service bubble sends its selection immediately and stays selected;
additional bubbles add services without replacing earlier selections. The composer
retains typed descriptions and question replies; a service tap is never an answer.
Only existing service identifiers are used; no new service pricing is invented.
The repository contains only `public/winston-logo.png`; it is reused with the
Wade Home Services wordmark. No new/fetched brand imagery or dependency.

The previous form is preserved as `app/staff-estimate.tsx` at `/staff-estimator`.
Its city directory, staff tier confirmation, pricing and clarification remain
available; navigation opens a separate estimate, not a transfer of chat photos.
Legacy browser scripts have only their target path changed to this retained route.

## Scope and evidence

`/api/conversation` uses the existing configured model with a separate strict
observation schema. The model identifies item/group IDs, room labels, photo
references, duplicate relationships, a whole-scope loaded percentage, and specific
questions. It never supplies a price. No live inventory claim is made for the
older estimator's deferred shadow extraction; this is a separate POC path.

New items start unresolved, even if mentioned: customer confirmation is required
before their volume is priced. The UI asks which to include or leave behind.
Signed prior choices persist across later photos. Explicit natural-language
corrections become proposals requiring confirmation, never silent scope changes.
Dropdown scope edits directly update the signed request and recalculate. Model
changes cannot silently overwrite a label/quantity except as a pending proposal.

One canonical ID represents the same item/group across views. Duplicate aliases
are merged, invalid lineage/ambiguous repeated IDs fail safely, and model-priced
IDs must exactly match included IDs. Prior included items cannot disappear.
An explicit unresolved-overlap flag withholds price. There is one total model
volume, never a sum of independently analyzed photo prices. These checks constrain
model output; they do not prove the model identified real-world overlap correctly.

Questions are item/topic-linked, limited to two, and require an exact cited
observation plus photo reference. No generic hidden-item question is inserted.
The composer shows which question a brief answer addresses; New topic clears
that binding. Dedicated answer inputs and Not sure are also available. Answers
remain signed; a repeated model concern cannot reopen that item/topic. A conflict
must quote the exact prior answer, cite a concrete observed fact/photo, and not
merely restate uncertainty. It withholds the current baseline for staff review
without changing the customer's scope choice.

Unanswered signed questions persist even if the next model response omits them.
Until scope is confirmed and pending questions are answered (including explicit
Not sure), the server returns no baseline or calculation assumptions. Unbounded
volume, conflicts and existing scope safeguards still withhold pricing. Not sure
retains the existing staff-review requirement; it does not establish a known fact.
Winston's fixed responses are upbeat without altering the observation prompt.

## Pricing and limits

`volumeBaseline` reuses the existing $550 constant and percentage-range parser.
60% = 7.2 cubic yards = $330. 150% = $825. Point estimates get no invented band;
50-70% maps to $275-$385. Model dollars are rejected by the strict schema or
sanitized from descriptive output. Confidence/risk never changes this calculation.
Amounts and formula appear only in the completed result, never Winston's chat
transcript. Starting another request clears that result, so old amounts cannot
remain in progress messages. Client guards also suppress results with questions
or unresolved scope. There is no partial estimate or interim range.

This POC deliberately applies **no location minimum, tier or access fee**. This is
stated beside every result, with staff review before quoting. It does not guess
mileage. The retained staff estimator supports location-aware pricing separately.
Heavy/demolition/special services retain review treatment: a volume-only baseline
is not an all-inclusive quote. No booking, final quote, competitor/savings claim,
model training, historical-reference call or technical diagnostics in the chat.

Bounded POC: ten photos, forty groups, twenty-four turns, sixty-minute signed
context; loaded-volume support remains within the existing two-load maximum,
not a one-load cap. Larger/unbounded jobs require staff scope review. No unlimited
uploads or arbitrary larger-load price is promised.

## Transport, privacy and failures

The existing optimizer reserves one tenth of the 3.5 MiB processed-photo budget
for each incoming image. Earlier optimized photos are retained without repeated
lossy encoding. Multiple batches fit the same budget; exact duplicate image bytes
are kept once. Metadata has a bounded 256 KiB transport allowance under Vercel's
4.5 MiB cap. The server checks total/per-image sizes, ten-photo count, MIME and
magic bytes before analysis; it also caps the streamed body before form parsing.

Photos, conversation and signed context stay in browser/process memory, not a
database, localStorage or object store. The token contains the user's own context
(signed, not encrypted); it is sent only in the protected request body, never a URL.
Photo hashes and room labels bind the original photo prefix; changing/reordering
earlier photos requires Start Over. No raw prompts, photos, notes, model responses
or provider error objects are logged. The provider request uses `store:false`;
this does not claim to change the provider's normal account-level retention policy.

Existing Basic/internal authentication and no-store apply to both UI and API.
OPENAI_API_KEY and INTERNAL_ACCESS_TOKEN are reused server-side, optional
OPENAI_MODEL remains unchanged. No new keys, paid services, SDKs or infrastructure.
One provider attempt per photo-bearing turn, no SDK retries; a user-triggered
retry is a new analysis attempt. UI locks prevent duplicate sends and generation
guards discard stale responses after reset. Failure clears the current baseline,
retains the submitted message/photos for retry and never fabricates a price.

## Verification and outstanding evaluation

Focused tests cover scope decisions, retained exclusions/answers, grounded
questions/conflicts, overlapping IDs, room batches, scope additions/removals,
strict provider schema construction, dollar rejection, volume arithmetic,
missing location, exceptional review, signed-context tampering, MIME/size limits,
auth and retry. Optimizer tests cover ten photos across independent batches.
Typecheck and synthetic desktop/mobile browser flow cover immediate multi-service sends,
composer replies, multiple photo batches, exact inclusion question, persistent
exclusion, add/remove recalculation, decode/request retry and full reset.
Final totals, SHA and Preview status are recorded in the draft PR.
Follow-up verification: 49 focused conversation/pricing tests and typecheck passed.
Desktop/mobile synthetic smoke additionally checks retained composer text, no
price/formula during questions or reassessment, failure withholding and completed
60% = $330. No broad tests, live calls, dependency changes or configuration changes.

All visual identification, cross-view matching, photo-grounded questions,
material recognition, scope interpretation and volume estimates were tested only
with mocks/synthetic photos. No paid OpenAI, Maps or Sheets calls. Strict schema
construction is tested locally, not live provider acceptance. Real-job evaluation
and authenticated hosted acceptance remain required; this is not release-ready.

## Manual Preview script

1. Authenticate. Type a description, then tap Junk pickup and Furniture. Each tap
   must send immediately, preserve the description and keep both services selected.
   Send the description when ready.
2. Label a Garage batch and attach photos. Add another room batch, up to ten total.
3. Confirm the listed groups; leave an incidental refrigerator behind. Answer the
   targeted question in the composer (or choose Not sure). Do not expect generic
   hidden-item questions without evidence.
   No price or calculation should appear until the necessary questions are answered.
4. Confirm exclusion persists after another message/photo batch. Use Confirmed
   scope to add/remove a group; review the recalculated baseline and assumptions.
   During reassessment, the previous price must disappear, including chat history.
5. Check arithmetic for the returned model load, not a forced prediction: 60%
   must be $330 with no distance/extra fee. Special work must require review.
6. Start Over clears messages, photos, scope and estimate. The staff estimator
   link opens the preserved prior experience. Do not merge or promote this POC.
