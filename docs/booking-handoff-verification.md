# Booking handoff verification checkpoint

## Baselines and rollback

Pricer starting code: 6688ca5a01ba13f8cb4357500dba9216cbcc137a (draft PR 25).
Remote annotated backup: snapshot-booking-phase2-pricer-6688ca5.
Website adapter starting code: 6f992ffd395dcedc55532c7d17e69b2c49d78a83 (draft PR 3).
Remote annotated backup: snapshot-booking-phase2-website-6f992ff.
Both continuations use isolated codex/booking-handoff-verification branches.

Pricer main / last inspected Production commit: 90ae1c249069a9f5ff05018c48271403dfad33b2.
Deployment: dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H.
URL: https://whs-pricing-tool-p8kg-5mi2ff1wm-wade-home-services.vercel.app.
Website main: e8dec3ee4444df51c729d34a99d03a4e1b3cfd6e.
Historical, NOT freshly verified website Production deployment:
dpl_4BEqKEVRJ2P6ptXoQBDNnFEEQAny,
https://wade-home-services-push-mnqhms791-wade-home-services.vercel.app.
Repository main is not proof of the currently deployed website version.

Code recovery: start a new branch from the corresponding snapshot; never reset
or overwrite another branch. Preview recovery: retain and reopen the prior
Preview; leave booking disabled. No Production rollback is being executed.
Before any future release or Production rollback, freshly identify the current
deployment and approved rollback target and obtain separate owner approval.

## Reused contract and bounded corrections

Reuse website PR 3's signed availability/submit adapter, existing Calendar
scheduling, atomic named-range plus Sheet append receipt, private photo copies,
and owner Pending Approval workflow. Do not call the ordinary website submit
endpoint: its notifications and photo rename/delete handling are unsuitable.

Receipts now require matching estimate/request IDs and a nonempty requested time
before persistence or display. Website receipts reject changed payloads and
already-reviewed requests instead of claiming they remain pending. Owner note
edits retain the first-line immutable AI quote/linkage metadata.

Website adapter submissions additionally require VERCEL_ENV=preview and
AI_PRICER_SYNTHETIC_TEST_MODE=true, plus a name beginning TEST (em dash) WHS AI
Pricer. This gate is server-controlled; it does not change ordinary website
bookings or notifications. The adapter imports no notification sender and does
not create Calendar events. Keep PRICER_BOOKING_ENABLED=false until paired
Preview credentials, origins, Deployment Protection access and test scope are
verified. Do not enable public access or change daily limits.

## Verification limits and remaining gate

Local tests use synthetic contacts, mocked Google requests, and local PGlite.
Browser tests mock analysis, history, private uploads and booking endpoints;
they do not establish real Calendar, private-copy, owner-portal or iPhone success.
No shared-service test records/photos have been created by this continuation.

Website Vercel deployment inspection is denied by the current connection.
Deployment-dependent verification remains blocked, independently of code access.
No booking-ready paired Preview is certified. Do not interpret a disabled
booking response as Calendar failure or as completed integration.

Once authorized deployment access works, configure only the paired Preview
origins/shared bridge authentication and synthetic mode. Verify real availability,
one labeled Pending Approval row, private copied photos through owner auth,
original quote separate from blank Approved Amount, and exact receipt/retry
identity. Record every estimate ID, request ID, lead ID and copied photo path
in a private verification ledger. Retain all test resources; never approve them.
Use mocks for race/slot-conflict/owner-transition scenarios. No notifications,
Calendar event creation, customer-data edits or automatic cleanup are allowed.

Manual iPhone gate after that verification: complete an estimate, use the required
test name and synthetic contact details, choose a Pacific slot, submit once,
confirm the pending receipt IDs/time and the same request in the owner portal.
Do not approve, decline or close it during this test.
