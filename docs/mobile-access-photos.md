# Mobile access and Photo Library candidate

## Confirmed budget failure and skipped compression floor

The subsequent iPhone screenshot resolves the earlier diagnostic blocker:
`processed-budget`, JPEG, original 3,807,149 bytes, decoded 3024 x 4032 via
ImageBitmap, smallest output 431,120 bytes against the unchanged 367,001-byte
ten-slot budget. Selection, decoding and encoding succeeded. Failure occurred
locally before conversation insertion or upload; this is not evidence of HEIC,
iCloud, authentication or server rejection.

Code inspection found that the dimension sequence stopped at 1479 pixels:
2048 -> 1740 -> 1479 -> 1257, with 1257 below the configured 1280 minimum.
It therefore skipped the entire permitted 1280-pixel compression pass. The fix
clamps the last step to the existing minimum and explicitly terminates there.
No byte limits, 0.68 quality floor, 1280 dimension floor, decoder, authentication,
pricing, request construction or server validation changed. Prior snapshot:
`pre-photo-floor-snapshot-d8c0708` at d8c0708c218240e9738cd708d9db9491d4fc1423;
retained Preview dpl_7Xm2Ya4qeDVUMT2s2DZxD1nR7Pgy.

Validation: 23 optimizer tests pass, including exact floor termination, portrait/
landscape/small inputs, a synthetic budget regression and ten photos in three
batches. Typecheck passes. Real mobile-emulated Chromium decoding, canvas JPEG
encoding, FormData and unchanged local server validation accepted a deterministic
high-detail synthetic 3024 x 4032 JPEG at 960 x 1280 and 335,363 bytes. The server
returned the expected provider-disabled 503 AFTER file validation, without an AI
call. An initial full-amplitude random-noise fixture did not fit; reducing only
fixture contrast exercised the successful final pass. Limits were not relaxed to
make either test succeed. No real photo or screenshot was committed.

The new browser assertion requires the successful synthetic output to reach the
exact 1280 floor, so the previous implementation cannot pass that check. Native
iPhone Safari and its picker remain unavailable. The user's actual photo may
still exceed the budget at the final pass; no claim of real-device recovery is
made until Tristan retries. On the updated Preview choose the same Photo Library
image and confirm `1/10 photos ready` and an upright thumbnail. If it fails,
share only the `Photo check:` line; no Send/AI call is needed for this check.

Production remains at 90ae1c249069a9f5ff05018c48271403dfad33b2 / deployment
dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H. PR #19 stays draft; no merge or promotion.

## Follow-up: iPhone optimization failure diagnosis

The user confirmed login is fixed but reported exactly the generic optimization
failure message. At SHA `6a75017335b6ec481cf254226b011002a8fef7a4`, that message
originates in the browser optimizer, before successful files enter conversation
state and before multipart submission. It is shared by original-file rejection,
non-HEIC decode failure, missing/invalid decoded dimensions, encoder exceptions,
empty canvas output and processed-byte-budget exhaustion. It does NOT establish
which of those conditions happened on the iPhone. MIME/format, iCloud availability
and Safari behavior remain unproven; no size or format diagnosis is assumed.

That version is preserved by annotated tag `pre-photo-diagnostics-snapshot-6a75017`
and its retained Preview `dpl_EthDyHEfTBDrio8h1spCBGFvjBiN` at
https://whs-pricing-tool-p8kg-9l5fzdtgw-wade-home-services.vercel.app.
Work continues on the same PR #19 branch. The focused correction is diagnostic:
retain the optimizer failure stage and show an allowlisted technical `Photo check`
line, rather than throwing away all distinctions. It includes MIME/extension,
original bytes, decoded dimensions, smallest encoded output size when available,
unchanged per-photo budget, decoder path and sanitized exception category.
No filename, raw exception message, EXIF, photos, credentials or customer text is
included. Nothing is logged or sent as telemetry. Zero-length input/output is now
explicitly rejected instead of passing an empty encoded blob downstream. No
decoding algorithm, size limit, auth or server-validation rule has been relaxed.

Evidence: the supplied desktop JPEG copy was 1,377,299 bytes, 1200 x 1600,
orientation 1. The real browser optimizer produced a 339,161-byte JPEG under the
same ten-slot budget. This proves only the available desktop copy works, not that
the Photo Library delivers identical encoded bytes. The original stayed outside
the worktree; no real-photo copy, screenshot, fixture or binary was saved to Git.

`tests/mobile-photo-receipt.browser.mjs` uses the actual browser FormData and the
unmodified Next `/api/conversation` handler. Unlike the earlier endpoint-mocked
smoke, the local server parses the multipart stream, enforces bytes/MIME/signature,
hashes files, checks room/order/state and only then returns its existing 503
`Photo analysis is not configured` response because OPENAI_API_KEY is explicitly
empty. This response is intentional proof of receipt/validation, NOT a successful
analysis claim. These are fresh-state requests: the empty key also disables
conversation signing, so this smoke does not verify signed continuation.
One synthetic image (19,192 bytes processed), then that image plus
the desktop copy (358,353 bytes total), both reached that gate. A corrupt JPEG
produced a local `decode` diagnostic while retaining the earlier successful file.
No live provider call, endpoint interception, Preview debug route or auth bypass
is involved. Native Safari and its Photo Library picker remain unavailable.

Validation: 21 affected optimizer tests and typecheck pass. The real-route mobile
emulation passed. Retained request/selection budgets, ten-photo/multi-batch behavior,
login fix, analysis, pricing, booking and Production are unchanged. Recent Vercel
runtime-log counts were empty; older logs exceeded the one-hour retention. These
logs cannot identify a browser-only failure.

One required iPhone step: on the updated PR #19 Preview, select the same failing
Photo Library image once and send only the `Photo check:` line displayed below
the error. No Send/AI call is needed. That evidence is still required to choose
the underlying repair; this diagnostic candidate does not claim the reported
iPhone upload failure has been fixed.

## Preserved baseline

- Starting branch: `codex/ordinary-job-volume`, PR #18 (draft, based on PR #17).
- Candidate: `7ccb58db97809686f1381bb97c1172d2dba6b421`.
- Annotated snapshot: `pre-mobile-fix-snapshot-7ccb58d`.
- Prior Preview: `dpl_2qrbhugGLdvDaoDoJ38YFFAP8jEz`,
  https://whs-pricing-tool-p8kg-g5omj5at1-wade-home-services.vercel.app.
- Main and Production: `90ae1c249069a9f5ff05018c48271403dfad33b2`.
- Production deployment: `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`,
  https://whs-pricing-tool-p8kg.vercel.app.
- Work is isolated on `codex/mobile-access-photos`, stacked on PR #18.
  No merge, environment change, promotion or Production deployment is authorized.

## Evidence and changes

The prior Preview's unauthenticated HTTP request returned a 302 to Vercel SSO,
with `no-store` and a Secure/HttpOnly/SameSite=Lax SSO nonce cookie. Project
metadata confirms Vercel authentication is enabled. No protection setting was
changed and no bypass was created. Behind that layer, the application's proxy
previously demanded Basic/header credentials on every protected request,
including APIs, and never issued a session cookie. Those application responses
were reproduced locally with synthetic credentials. We cannot establish which
layer caused every prompt in the reported iPhone session without device evidence.

After the existing successful login, the proxy now issues a host-only
`__Host-whs-internal-session` cookie: Secure, HttpOnly, SameSite=Lax, Path=/,
eight-hour maximum lifetime. It contains only expiry, nonce and a domain-separated
HMAC, signed using the existing server-only access secret, not the secret itself.
Signatures, expiry and host binding are checked on every request. Secret rotation
invalidates old sessions; cookies do not extend themselves on ordinary requests.
Existing token and Basic access remain supported. Cookie-authenticated mutations
require the same Origin and reject cross-site requests. No forwarded-host trust
is added. Missing configuration still fails closed; URL tokens remain rejected.
Background API failures return a no-store JSON 401 without a Basic challenge, so
they cannot spawn another native login prompt. Page navigation still challenges.
Users can sign in in another same-host tab, then retry without losing this tab's
unsent conversation. Vercel SSO is independent and may still require its own login.
Session cookies are not shared across different Preview hostnames or private tabs.

Photo controls were already multi-select and had no capture-only attribute. They
now include explicit HEIC/HEIF/JPEG filename extensions as well as MIME types.
Known extensions are accepted when the library supplies an empty/generic MIME;
actual decoding and server JPEG validation still apply. Browser decoding first
tries orientation-aware ImageBitmap, then the native image element even when
ImageBitmap exists but rejects the format. Only if both fail for HEIC/HEIF does
the client lazily load pinned `heic-to@1.6.5` (libheif 1.23.5, CSP build).
The local decoder applies HEIF transforms; its PNG result is optimized to JPEG
without another rotation or recompression of previous batches. No conversion
service receives images. Small exports retain native dimensions instead of
failing the old 1280-pixel target loop. Encoding failures and bad HEIC files return
recoverable messages. Processing is sequential and canvas/bitmap resources are
released. Existing per-file and 3.5 MiB processed-total budgets, ten-photo limit,
multipart/server validation and analysis input rules are unchanged.

Decoder source/version and upstream documentation:
https://github.com/hoppergee/heic-to and
https://registry.npmjs.org/heic-to/-/heic-to-1.6.5.tgz.
The unmodified decoder is LGPL-3.0; its license is retained at
`public/heic-to.LICENSE.txt`. No upstream decoder code was modified.

## Verification and limitations

- 32 focused proxy/session and photo optimizer tests passed.
- 50 affected conversation, booking and historical-reference tests passed;
  providers/Sheets mocked, historical matching and booking behavior unchanged.
- Typecheck passed. Diff whitespace checks passed.
- Chromium mobile emulation passed: login followed by a new browser context with
  only the issued cookie, page reload, protected API validation (400 before model
  use), invalid/missing credentials (401), no API Basic challenge, no-store errors,
  ten images across four batches, total request budget, recoverable corrupt HEIC,
  and real JPEG/HEVC decoding/orientation from generated color quadrants.
- Both converted files were checked for portrait dimensions, correctly rotated
  corner pixels and stripped orientation metadata. Fixtures are generated only
  in memory with a temporary test-only Pillow/HEIF encoder; no photos are committed.
- Next dev overrides HTML caching to `no-cache, must-revalidate`; proxy no-store
  and unauthorized API no-store were verified separately. Production is unchanged.
- No live OpenAI, Maps, Sheets, calendar, SMS or email calls. No secrets or customer
  images were read for verification, logged, included in fixtures or committed.
- No iPhone or installed WebKit executable was available. Native Safari Basic/SSO
  prompts, Photo Library picker, iCloud download behavior and device memory limits
  require Tristan's manual check. This is not a claim that every HEIF variant or
  EXIF-only malformed container is supported. Large originals retain existing limits.
- Dependency audit reports six existing affected packages (one critical, three
  high, two moderate), including Next.js 16.3.1 and sharp. No advisory was reported
  for the sole added package, heic-to. No existing package versions changed.
  Critical Next.js advisories include GHSA-p293-qw3h-jr36, GHSA-2xp9-vwfh-vxw4
  and GHSA-vcvr-r3jv-pc5j. These unresolved advisories require a separately scoped
  security update before a Production release; this candidate stays draft.

## Manual iPhone Preview check

1. Open the new exact Preview URL directly in a normal Safari tab, not an embedded
   browser. Complete Vercel sign-in if requested, then the existing WHS login.
   Never enter an access token in the URL. Keep using the same Preview hostname.
2. Reload and navigate within that host. Return after briefly switching apps.
   WHS should not repeatedly prompt within the eight-hour session. If it does,
   report whether it is a Vercel sign-in page or Safari's WHS Basic login dialog;
   do not send credentials or cookie values.
3. Tap + Photos and choose Photo Library. Pick a portrait HEIC and a JPEG whose
   orientation is obvious. Confirm previews are upright and both reach photos-ready.
   Add another batch up to ten total; existing photos should stay attached.
4. Try a damaged/unsupported file and then a valid replacement. The error should
   be recoverable, and earlier successful photos must remain. An eleventh photo
   should be rejected clearly. Large photos must not raise the upload budget.
5. The automated check submits only to a mock conversation endpoint. A real
   Preview Send invokes the existing AI provider; no live provider verification
   was performed in this change. Any real estimate check is a separate manual action.

To reproduce the local smoke test, start Next dev on loopback port 3017 with
`INTERNAL_ACCESS_TOKEN=synthetic-mobile-test` and a synthetic OpenAI key, then run
`node tests/mobile-access-photos.browser.mjs`. Supply PLAYWRIGHT_MODULE if not on
the module path, and HEIF_PYTHON/PYTHONPATH for a temporary pillow-heif 1.1.1 test
encoder. Never use live credentials for this test or target a remote host.

Rollback for this Preview is the preserved prior Preview URL/deployment above.
Do not move refs or promote anything to Production. Existing branches, tags,
commits, PRs, deployments and the tested version remain recoverable.
