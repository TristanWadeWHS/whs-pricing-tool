# Customer estimate flow: Phase 1

## Baseline and isolation

- Parent: draft PR #22, `codex/estimate-history-allowance`,
  `d5abe412ba70017ae15c33fd7cc0f5a97c68cfb8`.
- Preserved annotated tag: `pre-customer-inquiry-snapshot-d5abe41`.
- New branch: `codex/customer-inquiry-phase-1`; stacked draft, not a Production release.
- Production/main: `90ae1c249069a9f5ff05018c48271403dfad33b2`,
  deployment `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`,
  https://whs-pricing-tool-p8kg.vercel.app (unchanged).
- Previous tested Preview: https://whs-pricing-tool-p8kg-rkhvbnqvi-wade-home-services.vercel.app.
  Rollback for this phase is to keep using that preserved deployment/parent SHA;
  no database reversal is needed. Never move the tag or delete history.

## Implemented

Service bubbles retain multiple selections and immediately acknowledge them.
Phone (validated US format, normalized E.164) and email are required before
photo/description entry. A failed save retains entries, uses the same submission
ID on retry and does not unlock photo submission. Start Over intentionally makes
a new inquiry and clears local contact values; it does not erase saved history.

No schema migration: the existing `pricer_estimates.id` is the submission ID.
`pricer_events` stores one `inquiry` event with phone, email, services, kind and
source. The initial contact is immutable on retries; subsequent selections update
its service list. All original/analysis photo receipts and description/answer/
quote revisions retain that estimate ID. Existing records and earlier Preview
remain compatible. Contact capture creates no booking, notification or accepted quote.

Contacts are not included in model messages, signed conversation tokens, upload
URLs, localStorage, or logs. Existing visitor ownership and staff-only history
checks protect access. `/owner/history` exposes private inquiry events only to
authorized staff. Contact accuracy is syntax-validated, not phone/email ownership
verified; no OTP or outbound message is sent.

The original provisional quote is the earliest immutable revision with a displayed
amount; `EstimateStore.originalQuote` exposes its revision, baseline, display and
pricing versions to authenticated history. Later revisions do not replace it.
This is not an accepted quote or owner-approved amount.

Promotional/customer-type controls are removed. `/api/booking` now returns 410
without processing contacts, discounts, bookings or notifications. The old pure
promotion and mock booking helpers remain preserved but are not connected to the
customer flow. Standard volume pricing, comparison presentation and model remain unchanged.

After pricing: Book the Job (left) opens an explicit Preview-only notice with
the submission ID, not a fake booking. Have Questions? Call Now (right) links
`tel:+19494245605`, verified in the website's `ownerNotifications.ts` and existing
pricer contact constant. No customer data appears in a handoff URL.

Private history must be enabled for this new Preview branch, using existing
Preview-only DB/Blob/visitor configuration. Public access and daily-limit flags
stay false; no Production or website configuration changes.

## Phase 2: verified website contract, plan only

Inspected read-only website checkout `whs-command-center` at
`e8dec3ee4444df51c729d34a99d03a4e1b3cfd6e`, `docs/booking-system.md`,
`app/lib/booking/{config,types,validation,security,storage,google}.ts` and actual
availability/submit/owner routes. The accessible Website review and improvement
chat confirms recent Command Center work but does not establish a pricer handoff.

1. Add an approved server-to-server handoff with an opaque, short-lived reference,
   bound to the saved inquiry and chosen immutable quote revision. Revalidate
   ownership/consent; never trust browser-supplied contact, quote dollars or Blob paths.
   Persist a durable unique `(submissionId, quoteRevision)` handoff key and returned
   website lead ID. The website's current idempotency map is process-local, so it
   is not sufficient for cross-instance duplicate prevention.
2. Reuse saved contacts, selected services, description and private photos. Collect
   missing customer name, `address.{street,city,state,zip,accessNotes}`, appointment
   type and requested slot. Website service values are exactly `Junk Removal`,
   `Light Demolition`, `Storage / Relocation`; explicitly review mappings from
   the pricer's more detailed services. Do not silently collapse service selections.
3. Use existing `GET /api/booking/availability?date=YYYY-MM-DD`, returning `{ok,slots}`
   from Google Calendar free/busy in America/Los_Angeles. Preserve start/end/label;
   recheck availability at submission and before owner approval.
4. Website `POST /api/booking/submit` currently expects services, appointmentType,
   address, projectDescription, photos, customer, requestedSlot, startedAt,
   honeypot, optional turnstileToken and idempotencyKey. Actual appointment types:
   `On-Site Estimate` and `Service Appointment Request`. It records `Pending Approval`,
   does not immediately create Calendar events, but DOES send an owner notification.
   Do not call it in Phase 1. It hard-codes Source=Website and has no verified
   pricer-ID/original-quote contract. An authorized integration must add Source=AI
   Pricer and immutable quote linkage separately from Approved Amount.
5. Current photo validation accepts `booking-photos/` paths, not pricer paths;
   association renames objects and error cleanup can delete them. Never hand it
   the original pricer objects. Approve a read-only linked-photo adapter or separate
   copies with explicit ownership and retention rules before connecting it.
6. Reuse `/api/owner/booking/{approve,decline,close}` with existing owner sessions.
   `approveLead` rechecks availability, finds events by lead ID, records Approved
   Amount, Owner, decision timestamp and confirmed time; decline/close retain
   reasons/notes. Keep original AI quote separate from approved amount. Notifications
   and live Calendar/Sheet writes require separate Phase 2 authorization.

Acceptance: mocked availability race, durable duplicate prevention across instances,
unauthorized/tampered handoff rejection, immutable quote, private photo linkage,
pending-only submission, owner approve/decline/close, and no accidental notifications
in Preview. Blockers: no trusted handoff endpoint or credential contract yet,
photo namespace mismatch, Source/original-quote linkage, durable idempotency.

## Phase 3: outcomes, plan only

Reuse estimate booking_job_id/customer_id and existing website completion fields
(`Completion Final Amount`, costs, completion notes/time). Link stable IDs and
capture actual work/volume more/equal/less plus reason. Separate estimation error,
approved added/removed scope and discounts; preserve original and approved amounts.
Do not infer actual volume from final price. No new writes or schema work in Phase 1.

## Phase 4: comparisons, plan only

Use validated outcomes with item/material/loaded-volume/access and defensible
photo-similarity evidence, not keywords alone. Version comparability rules, record
which job IDs informed a reference, exclude post-job leakage, measure held-out
improvement and preserve human review/rollback. Saved history does not retrain
models or authorize pricing changes. NO_MODEL_READY remains.

## Manual Preview check

Local checks: 22 focused tests initially passed; full synthetic pass had 314
passing tests and one opt-in skip, with two pre-existing missing `server-only`
test mocks. Both harnesses were corrected and their 22 tests passed. Subsequent
inquiry/history checks (including original quote preservation) passed 27/27.
Typecheck passed. Desktop and iPhone-size/reduced-motion browser checks passed:
contact failure/retry, multi-service capture before uploads, two photo batches,
clarification/price withholding, reset, inert booking and protected history.
Browser analysis/storage endpoints were mocked; native iPhone is a manual gate.

Sign in through existing protection, choose two services, enter synthetic US phone
and email, save inquiry, upload photos in two batches, describe scope and clarify.
Confirm no promotion or returning-customer question; standard provisional pricing
only after scope completion. Book the Job must state no request was submitted;
Call Now must show 949-424-5605. In /owner/history confirm one inquiry, linked ordered
photos, revisions and original provisional quote. Retry a failed save/analysis and
confirm no duplicate inquiry/revision. Start Over must clear local prior details.
