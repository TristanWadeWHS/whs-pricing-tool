# Customer follow-up Preview

## Preserved baseline

Tested PR #16: `7002314610c43dbbcfc6c5f0e06dca45d84f4278`, branch
`codex/winston-completion-only-pricing`, stacked on #15 -> #14 -> #13 -> #12 -> #11.
Annotated snapshot: `pre-follow-up-snapshot-7002314`.
New isolated branch: `codex/winston-follow-up-preview`, targeting #16's branch.
Retained tested Preview:
https://whs-pricing-tool-p8kg-6gmmkccej-wade-home-services.vercel.app
(`dpl_CUJByNhgub9HEifosp66s1HWdVKU`). Use it, or branch from the snapshot, to return
to the tested experience without changing history.

Production/main was verified at `90ae1c249069a9f5ff05018c48271403dfad33b2`,
deployment `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`,
https://whs-pricing-tool-p8kg.vercel.app. No Production/configuration change.

## Completed estimate first

The intake, model request, uploads, grounded questions and pricing formula remain
unchanged. A completed server analysis adds its percentage, range text and
exceptional-work flag to existing signed context. Incomplete analyses clear this
snapshot. Follow-up requires that signed snapshot, included scope and no unanswered
questions; it never accepts client prices or approval flags. No model call is made
for customer-type selection, promotion, contact details or booking actions.

The new/returning reply bubbles send immediately to `/api/booking`, not the model.
Both use `TEMPORARY_PROMOTION_RATE` in `app/lib/promotion.ts`, currently 0.10.
There is no invented expiry. Calculation starts from the original, server-computed
volume baseline on every selection; it never discounts a discounted total.
Amounts use cents rounding. Genuine volume-range endpoints are treated separately;
a point remains a point. Example: $330 original, $33 illustrative discount, $297
illustrative discounted volume baseline, for either customer type.

### Minimums and approval are unresolved, not waived

The chat still has no confirmed location tier/minimum or access fees. Therefore
**every current chat promotion is an illustration pending staff confirmation**,
not a final eligible total or an approved quote. Exceptional work is separately
flagged and no special-service charge is invented or discounted. The calculator
has a tested minimum floor when a verified minimum is provided, but this follow-up
does not invent that input or alter existing distance thresholds/rates.
All provisional/exceptional/staff-review labels remain. Staff must resolve the
location minimum, access/disposal, special work and promotion eligibility before
any real booking/quote approval. Confidence and model risk flags do not change
the arithmetic. No pricing logic in the existing staff estimator is changed.

## Booking details and privacy

After selection: name, service address, preferred date/time (Pacific), email or
text confirmation choice. Only the selected contact method is required; the other
is optional. Browser/server validation checks formats and future preferences.
The customer reviews confirmed included scope, original baseline, promotion,
contact details and requested time before checking explicit confirmation.
Editing details resets confirmation and the request ID. Failure retains the
reviewed details and request ID for a safe retry. Duplicate/in-flight submissions
and edits/customer-type changes after an uncertain booking response are locked;
reset or estimate reassessment unmounts the follow-up, clears its local
details and aborts pending requests. A changed estimate needs a new review.

Contact details stay in React memory. While Preview booking is disabled they are
not submitted at all. No localStorage, database, booking log, analytics or photos
are added. Booking details are not appended to model messages or signed analysis
context. The new endpoint uses existing auth/no-store, a bounded JSON request and
sanitized errors; no raw validation/provider/customer payloads are logged.

## Integrations: deliberately disabled

Repository/dependency/template inspection found no calendar, email or SMS adapter,
business notification address, or existing test-safe booking integration.
Existing documented configuration is for OpenAI, internal auth and Sheets only.
Google Sheets service-account access is not calendar authorization and was not used.
No credential values were read, pulled or changed; no paid provider provisioned.

`getBookingProviders()` returns `null`; promotion responses always declare
`bookingEnabled: false`. Confirm booking remains disabled even after review.
A direct valid POST returns `503 / disabled`, without an event ID or sent claim.
The endpoint never accepts a customer's claim of staff approval; its approval
is false until a separate authorized business workflow exists. Environment flags
cannot accidentally activate booking. All missing capabilities are stated in UI.

### Mocked workflow contract, not an active service

`booking-workflow.ts` defines the bounded order for a future authorized adapter:

1. Require customer confirmation, staff approval and the chosen delivery method.
2. Check for an existing idempotent booking before attempting availability.
3. Check availability, then atomically reserve the verified slot. A lost slot
   returns unavailable, not a booking confirmation.
4. Only after confirmed creation, send the selected email/SMS; send business email
   only when that address and email delivery are configured.
5. On uncertain creation, retry the same request and look up its event first.
   Notification failures retain the event and use stable delivery keys, never
   cancel or recreate it. The response distinguishes booked, sent and failed.

Mock tests supply idempotent reservation/delivery stores. **There is no production
durable store/adapter and no claim of distributed booking correctness yet.**
Before activation, authorize a calendar provider/calendar ID, service duration and
Pacific timezone/DST/slot rules; implement atomic reservation plus durable
request fingerprints and idempotent delivery. Authorize email sender/business
recipient and SMS sender if offered, with sandbox credentials and recipient
restrictions. Add staff approval/minimum verification tied to the current estimate,
session ownership and replay/revision protection; do not enable from an env toggle.
No particular paid vendor or new credential name is selected in this phase.

## Verification and manual check

Focused promotion/booking, conversation and pricing tests; typecheck; one synthetic
desktop/mobile browser smoke. Provider calls and successful booking UI are mocked;
no live model, Maps, Sheets, calendar, email or SMS requests. Browser verifies
actual disabled controls and separately simulates a future sandbox adapter. Counts
and Preview build status are recorded in the draft PR. Not release-ready.

1. Authenticate to Preview; complete scope/clarifications. No estimate or promotion
   may appear before scope is ready.
2. Tap New customer, then Returning customer. Each sends immediately; the same
   original/10%/discounted illustration appears without compounding.
3. Verify the minimum/exceptional-work caveats and provisional status. For a returned
   60% point, baseline is $330 and illustrative reduction is $33, not a final quote.
4. Use synthetic contact details, choose email or text and a future Pacific date/time.
   Review scope/prices/details, edit and re-review, then check confirmation.
5. Booking must stay disabled with its explicit integration notice. No real job,
   confirmation or business email is created. Do not test with real customer data.
6. Send a new analysis message or Start Over: follow-up/prices clear while scope
   is reconsidered, and contact details are not sent to photo analysis.

All prior refs/PRs/deployments remain preserved. Nothing merged or promoted.
