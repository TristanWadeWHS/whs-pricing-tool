# Mobile access and Photo Library candidate

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
