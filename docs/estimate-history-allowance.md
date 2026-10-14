# Private history and customer allowance (draft)

## Baseline and status

Stacked on draft PR #21, `codex/winston-benchmark-presentation`, exact baseline
`1bc6615b128b205f5f22686e2b36c75fbe35d393`.
Snapshot: `pre-estimate-history-snapshot-1bc6615`.
Production remains `90ae1c249069a9f5ff05018c48271403dfad33b2`, deployment
`dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg.vercel.app.
No public launch, real customer photos, or Production changes are performed here.

### Authorized Preview activation (2026-10-13)

Tristan has now supplied exact uppercase `PRICER_DATABASE_URL` for dedicated
`WHS-Pricer-History` and an independent `PRICER_VISITOR_SECRET`, both sensitive and
Preview-only. This supersedes the earlier missing-variable findings below.
Candidate `d98752d106c5c4073dc93970ff74d45d0e5ef61c` is preserved by annotated tag
`pre-history-activation-snapshot-d98752d`. Main/Production remain unchanged.

Explicit setup command, **only in the authorized Vercel Preview build environment**:
`npx --no-install vitest run --config scripts/history-preview.config.mts`.
It is not part of normal builds, tests, startup or a web endpoint. The guard requires
the exact pricer project/branch, Preview, disabled public/quota flags, staff confirmation,
the dedicated configured Neon connection and Blob OIDC. No secret values are exported.
Database/schema metadata only is inspected; existing unmanaged or partial schema stops
setup. An empty schema receives the SQL file in one locked transaction and a checksum/
target-fingerprint/source-commit migration ledger. A matching ledger is not reapplied.
No existing records are selected, reset, overwritten or deleted.

The explicit verifier retains one isolated synthetic estimate and two synthetic PNGs
with ordered original/analysis variants under `pricer-estimates/v1/<synthetic UUID>/`.
It uses real private Blob OIDC uploads/head/reads, real SQL and the actual session,
conversation/history/photo handlers; only OpenAI is mocked. It checks scope withholding,
clarification revisions, successful retry replay and staff-only access. No cleanup is run.
Build-process verification does not itself certify native iPhone behavior or deployed
HTTP/browser authentication. Shared history remains disabled until storage verification
passes; these results are recorded separately rather than assumed from configuration.

Verified on `6bc781e6cfd9566ef89faf2403eb27de741303cb` in Vercel Preview:
- Dedicated configured Neon database connected; the previously empty schema received
  `db/estimate-history.sql` transactionally. `pricer_migration_ledger` records its normalized
  SHA-256, target fingerprint, timestamp and initial source commit `3562302`. Later checks
  returned `already_applied`; no existing data was reset, rewritten or removed.
- Actual project OIDC authorized private presigned PUT, head and authenticated get.
  Anonymous object reads were denied. The earlier metadata connector 404 was not a
  deployed-access failure. No store association, website connection or existing photos changed.
- The integration check exposed double JSON serialization at the Postgres.js parameter
  boundary, missed by the earlier PGlite adapter. Explicit text-to-JSONB casts now preserve
  objects for request/state/result/revision/event records. The regression uses the installed
  driver's serializer and failed before the fix. No previously saved records were rewritten.
- Isolated synthetic estimate `5c1cf985-bb6a-4379-8860-74b5fcd2bc38`: three revisions,
  two ordered original/optimized pairs, pending-question price withholding, preserved answer,
  idempotent retry with no extra model call, authenticated history/photo handlers and
  unauthorized denial all passed against real storage. Analysis was mocked, not paid/live.
- 22 affected local tests and typecheck passed. Failed synthetic diagnostic attempts are
  retained; no cleanup ran. These fixtures are not customer estimates or training data.

`PRICER_HISTORY_ENABLED=true` is authorized **Preview-only on this PR branch** after the
checks above. Public customers and the shared Preview daily limit remain false. Optional
`PRICER_VERIFY_HTTP_ORIGIN` on an explicit verifier build can target the exact enabled
Preview URL: it checks real HTTP staff access, a new synthetic private original, a no-photo
conversation save/retry (zero AI calls), and only that synthetic record's detail/photo.
It never lists customer history. Deployed HTTP results and the final READY URL are recorded
in PR #22; build-process tests alone do not certify them or native iPhone behavior.

Rollback: use the preserved `d98752d` snapshot/Preview and set only this branch's Preview
history flag false before redeploying if needed. Retain the database, migration ledger,
synthetic records, Blob objects, credentials and all deployments; no destructive rollback.

### Preview connection follow-up (2026-10-13)

Preserved prior candidate `8c1cccece6a2206b63de3a198954c8bb6c456ddd` with annotated tag
`pre-preview-storage-snapshot-8c1ccce`. PR #22 remains draft on the same branch.
Tristan reports creating Neon `WHS-Pricer-History`, connecting private Blob
`wade-home-services-photos`, and confirming the shared internal login is staff-only.

Verified environment metadata differs from the reported setup:
- `PRICER_DATABASE_URL` is absent. Case-sensitive `Pricer_DATABASE_URL` exists with the
  Neon integration variables, assigned to **both Preview and Production**. No existing
  assignment was changed, and the code does not silently alias it or assume its target.
- `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` are Preview-only. No static Blob token.
- `PRICER_BLOB_PRIVATE_CONFIRMED`, `PRICER_DAILY_LIMIT_ENABLED`,
  `PRICER_PUBLIC_CUSTOMERS_ENABLED`, `PRICER_INTERNAL_AUTH_IS_STAFF` are Preview-only.
  Their reported true/false values come from Tristan; sensitive values were not printed.
- `PRICER_VISITOR_SECRET` and `PRICER_HISTORY_ENABLED` are absent.

The connector's store-metadata request returned `404: not_found / Blob not found` for
the configured store ID in the pricer team. This does not establish whether deployed
OIDC has access. The local Vercel CLI is unavailable. No alternate access path was
attempted after that tooling failure. Database identity/connectivity/migration state and
live Blob reads/writes are **not verified**. No SQL migration or synthetic live upload
was run, no migration was falsely recorded, and history remains disabled.

OIDC-compatible code now uses installed `@vercel/blob@2.8.0` `issueSignedToken` and
`presignUrl`: exact photo path, PUT only, private access, five-minute expiry, MIME/size
constraints and no overwrite. Browser receives only the scoped URL; signing material
stays server-side. Receipt validation still uses authenticated `head`. A webhook public
key verifies callbacks only; this flow uses explicit authenticated receipts, not callbacks.
Configuration checks require OIDC-token presence plus store ID (or an explicit static
token); successful SDK authorization is still required on every operation. Presence
alone is not proof of access. No dependency upgrade was needed.

Official references:
- [Blob authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk#authentication)
- [Signed upload URLs](https://vercel.com/docs/vercel-blob/vercel-signed-urls)

OIDC follow-up verification: 22/22 affected tests and typecheck passed. One desktop/mobile
emulation smoke pass exercised real browser optimization and PUT construction with
synthetic files and intercepted storage endpoints, plus mocked analysis/history,
clarification, retry/reset and protected endpoint denial. No native iPhone or live
database/Blob end-to-end success is claimed. Prior pricing tests were reused unchanged.

Remaining authorized setup before activation:
1. Confirm Neon resource/branch/database identity in its dashboard. Provide that dedicated
   connection as exact uppercase `PRICER_DATABASE_URL`, **Preview only**. Separately review
   the unexpected Production assignments; this PR does not modify them.
2. In an authorized environment, inspect schema state without querying customer rows.
   If empty, apply `db/estimate-history.sql` in a single transaction with stop-on-error;
   record the migration version, SHA-256 of the file, timestamp and database identity in
   the deployment/migration ledger. If any `pricer_*` object already exists, stop and
   reconcile migration history rather than rerunning/resetting. No DROP/overwrite.
3. Resolve the Blob metadata/access error with the existing project connection. Verify
   deployed OIDC can put/head/get an isolated synthetic `pricer-estimates/v1/` object
   privately; never list website objects or run cleanup.
4. A secret-safe authenticated local configuration path is unavailable here. Use a
   password manager/CSPRNG to generate an independent secret of at least 32 random bytes
   and set Preview-only `PRICER_VISITOR_SECRET` as a Vercel Secret. Do not paste it into
   chat, logs or Git; preserve it across future deployments.
5. Only after steps 1-4 succeed, set Preview-only `PRICER_HISTORY_ENABLED=true` and
   redeploy Preview. Keep public mode and shared Preview daily restriction false, and
   the staff confirmation true. No environment variable was created or changed here.

## Infrastructure inspected

The website repository's main `app/lib/booking/storage.ts`, booking photo-token route,
operations photo-read route, types/config and package manifest were inspected read-only.
The related Website review and improvement chat was available, but its recent messages
did not establish storage access. Repository implementation is the reference.

Website uses private Vercel Blob, direct scoped client uploads, pending-to-lead paths,
linked photo references and authenticated owner/field-manager streaming. Its lead
records in Google Sheets do not provide atomic multi-request allowance transactions.
This pricer therefore uses PostgreSQL for structured records/counters and the same
private Blob SDK/conventions for objects, under the distinct `pricer-estimates/v1/`
prefix. Website role credentials are NOT assumed to be available to this application.

Pricer environment *names* were inspected without decrypting values. No Blob or
PostgreSQL binding was present. Existing store privacy, account access and cross-project
credential authorization remain **unverified**. No existing customer data was inspected.
Do not change a website store's access mode. Connect an authorized private store (shared
only after owner review, or a separately approved one); do not silently provision it.

## Required setup (authorized environment only)

1. Supply a dedicated TLS PostgreSQL `PRICER_DATABASE_URL`; explicitly apply
   `db/estimate-history.sql` once using an approved migration operator. It is not run
   at application startup. The application role needs table/sequence access and function
   execution, not schema administration. Back up the DB; restrict provider/dashboard access.
2. Connect an authorized **private** Blob store and verify `BLOB_STORE_ID` plus Vercel
   runtime `VERCEL_OIDC_TOKEN` can access it. Alternatively use an explicitly authorized
   server-side `BLOB_READ_WRITE_TOKEN`. Set `PRICER_BLOB_PRIVATE_CONFIRMED=true` only after
   verification. Store IDs and webhook public keys alone do not authenticate access.
   Store-wide credentials and delegation signing material never go to the client.
3. Configure a random, independent `PRICER_VISITOR_SECRET` of at least 32 characters.
   Keep it stable across deployments; rotation invalidates visitor cookies.
4. Existing auth is a shared internal credential, not individual roles. Confirm that
   `INTERNAL_ACCESS_TOKEN` and its sessions are restricted to staff before setting
   `PRICER_INTERNAL_AUTH_IS_STAFF=true`. If customers have that credential, rotate/migrate
   staff access under separate approval before public launch. No customer-controlled
   parameter establishes staff status; staff history checks the actual signed session
   or credential on every endpoint. Individual staff attribution requires future identity integration.
5. Enable `PRICER_HISTORY_ENABLED=true` only after setup. Shared Preview stays protected;
   leave `PRICER_PUBLIC_CUSTOMERS_ENABLED=false` and `PRICER_DAILY_LIMIT_ENABLED=false`.
   Public mode is an explicit future release gate and fails closed on missing setup.
   Eventual Production public mode enforces the daily allowance even if the explicit
   test flag is false. No environment values are changed by this PR.

Config bounds: `PRICER_DAILY_ALLOWANCE` defaults to 3 (1..20);
`PRICER_MAX_ANALYSIS_REVISIONS` defaults to 8 (1..20). There are also at most 24 successful
conversation turns/job, 3 retries per idempotency key, 5 original-upload authorizations/photo,
and 30 draft jobs/browser/day. These are abuse caps, not pricing inputs.

## Allowance and integrity

A signed random UUID in Secure/HttpOnly/SameSite=Lax first-party cookie identifies a
browser, not a person. Start Over/refresh keep the cookie. Clearing cookies or changing
devices creates a new browser identity; there is no IP identity/fingerprinting guarantee.
Current implementation is not a substitute for future platform-level public abuse protection.

Before paid analysis a PostgreSQL transaction locks the visitor row, checks successful
analyses plus active reservations, and reserves capacity. Completion appends a revision
and increments usage only on the job's first successful analysis, including scope questions.
The day is the successful completion date in America/Los_Angeles. Live reservations
carry over midnight until finalized/expired, so rollover cannot bypass capacity. PostgreSQL
zone conversion handles DST; no 24-hour arithmetic. Failures release capacity; 3-minute
leases reject late workers. Clarifications are revisions, not new jobs. Idempotency keys
bind exact submission + ordered analysis hashes + expected revision; successful retries
replay without another provider call. Provider retries remain disabled.

Server-owned state preserves earlier photos, rooms and question/scope IDs. Completed
estimates reject arbitrary new messages/photos/services; bounded revisions cannot become
unlimited unrelated jobs. Staff bypass the daily restriction only, not validation/leases.
Technical failures return no fabricated estimate. Saved failures use categories, not
provider messages or raw responses. No logs contain submissions, tokens or photos.

## Records and photos

The stable estimate ID is separate from visitor/customer IDs. Exact submission JSON
(before trimming), ordered questions/answers, signed-state contents **without its token**,
scope, parsed model observations, loaded volume/range, calculated endpoints, displayed
midpoint/introduction/comparison, pricing inputs and template/version IDs are stored in
append-only revision records. Customer-type/promotion selections append idempotent events
using existing calculations; no booking action/integration is added. Unknown outcome links
and actual values stay null. This feature never reads history to influence estimates.

Original files go directly to private Blob with a five-minute, exact-path/type/size PUT
URL. They never join the analysis multipart request. Original cap matches existing
optimizer: 25 MiB/photo. Existing ten-photo, 3.5 MiB aggregate and per-photo analysis limits
are unchanged. Ordered original/optimized variants share an immutable photo ID. Original
content hashes are client-declared, not an independent verification of customer authenticity;
optimized hashes are verified from server-received bytes. Completion checks private host,
path, type and bytes. Status is pending/failed/complete; retry checks receipts before writing
again. No overwrite/public photo URL is allowed. Original filenames are not retained.

Separate upload and analysis timeouts retain the conversation and retry form. Staff history
is `/owner/history`: 20 estimates/page, 10 revisions/page and lazy authorized photo links.
Photo endpoints validate staff access and linked IDs; responses are private/no-store/nosniff.
Knowing an estimate ID never grants access. No logs or Git fixtures contain actual customers.

## Retention and orphan cleanup

Submitted estimates/revisions are durable across deployments, not ephemeral process files.
There is no automatic deletion of submitted history. This is not a promise of indefinite
retention: before public launch, WHS must approve a retention duration, deletion/request
procedure, staff access list, backup retention and vendor permissions. Do not repurpose
photos for training. The customer notice states saved details/photos support estimates and
WHS pricing improvement; contact uses the existing verified WHS phone link.

Reviewed staff maintenance: same-origin POST `/api/estimate-history/cleanup` with JSON
`{"apply":false}` returns aggregate dry-run counts. `{"apply":true}` processes at most
20 jobs/batch: only 7-day-old unsubmitted jobs with no successful revision/analysis, no
live reservation and no recent photo activity. Jobs are atomically marked abandoned before
deleting only their exact linked `pricer-estimates/v1/...` paths. Deleted status is retained;
failed deletions retry safely. No website objects, submitted estimates or historical records
are deleted. Never run this against existing stores without reviewing the dry run. Upload
tokens expire long before eligibility. No cleanup has been run against live storage.

## Verification and launch gates

Synthetic in-memory PostgreSQL (PGlite) runs the actual migration and SQL functions; it
does not prove production multi-node load/permissions. Mocks cover storage and provider
paths, no real AI/Blob/Sheets/customer calls. Browser smoke uses local synthetic photos and
mocked responses. Real iPhone/native picker and deployed DB/Blob permissions require a
separate authorized manual check once configured. No automatic resource provisioning.

Results for this candidate: the initial focused conversation/booking/photo/pricing/history
pass was 107/107; affected history/request/upload additions subsequently passed 19/19.
Typecheck passed. Desktop and mobile-emulated browser smoke passed with actual local
photo optimization, mocked original receipt/provider endpoints, scope clarification,
retry/reset, price withholding, history viewing and unauthorized endpoint checks.
The browser wait was updated to account for asynchronous archive preparation; no live
provider verification or native iPhone picker verification is claimed.

Manual configured test: submit one synthetic job, clarify, retry once, reset twice;
inspect ordered original/optimized receipts and append-only revisions in staff history.
On a separate anonymous browser with explicit local test enforcement, three new successful
jobs should work and the fourth should show the WHS contact message without analysis.
Refresh/Start Over must not clear allowance. Verify staff exemption, unauthorized history
denial, and dry-run orphan counts. Keep shared Preview allowance disabled.

Future outcome research must use verified completed outcomes and separate approved added
scope from estimation error; generated estimates are neither accepted quotes nor completed jobs.
