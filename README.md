# Wade Home Services Pricing Tool

Internal AI-assisted pricing system for Wade Home Services junk removal and hauling estimates.

This application is not a trained Wade Home Services machine-learning model. It uses AI photo analysis plus deterministic TypeScript pricing rules. Historical completed-job data is being prepared for future reporting, comparable-job retrieval, statistical baselines, and possible supervised machine learning after validation.

Future Codex sessions must read `AGENTS.md` before modifying this repository. Recovery and release discipline is documented in `docs/development-safety.md`.

## Runtime

- Node.js 24.x on Vercel
- Next.js 16
- React 19
- OpenAI Responses API
- Google Sheets API read-only scope for historical-data discovery

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000` with a valid internal access token configured.

## Required Environment Variables

Do not commit real values.

- `OPENAI_API_KEY`: server-side OpenAI API key.
- `OPENAI_MODEL`: configurable analysis model. Default in code is `gpt-5.6`.
- `DIRECT_QUOTE_CONFIDENCE_THRESHOLD`: provisional direct-quote threshold. Defaults to `85`; this is not statistically validated.
- `INTERNAL_ACCESS_TOKEN`: temporary server-side access gate token for the internal MVP.
- `GOOGLE_SPREADSHEET_ID`: canonical configured historical spreadsheet ID.
- `GOOGLE_SHEET_TAB`: canonical configured historical worksheet name.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: server-side service-account JSON for read-only Google Sheets access. Preserve escaped private-key newlines; never expose or log this value.

## Access Gate

The internal UI and `/api/analyze` are protected by `proxy.ts`. Requests require either:

- browser HTTP Basic authentication, using any username and `INTERNAL_ACCESS_TOKEN` as the password,
- `Authorization: Bearer <token>` for API clients, or
- `x-internal-access-token` header matching `INTERNAL_ACCESS_TOKEN`.

If `INTERNAL_ACCESS_TOKEN` is missing, the app fails closed with `503`.

This is a temporary internal MVP gate, not a full authentication system.

## OpenAI Analysis

The app uses the OpenAI Responses API with strict Structured Outputs through a Zod schema. The configured model remains controlled by `OPENAI_MODEL`; the default is `gpt-5.6` for the strongest internal-quality baseline.

Malformed model output, parsing failures, provider errors, timeouts, or missing OpenAI configuration return `analysis_failed`. They do not fabricate a generic load estimate or firm quote.

## Validation Limits

The browser optimizes selected photos locally before upload. Normal large phone photos are resized and re-encoded as JPEG in the page session; originals are not uploaded to any third-party optimization service.

Browser optimization uses:

- 2048 px initial maximum long edge
- 1280 px minimum long edge
- JPEG output quality from 0.84 down to 0.68
- a dynamic per-image budget based on the number of selected photos
- 3.5 MB maximum total processed image bytes per request

HEIC/HEIF files are accepted for local browser decoding where the current browser supports them. If the browser cannot decode a HEIC/HEIF photo, the UI asks the employee to switch the iPhone Camera Format to Most Compatible or upload a JPEG.

Server-side request validation enforces:

- 1-5 photos
- JPEG, PNG, or WebP MIME types
- image magic-byte checks
- non-empty files
- 3 MB maximum per image
- 3.5 MB maximum total decoded image bytes per request, kept below Vercel's 4.5 MB function payload limit
- valid distance, job type, carry-distance, stairs, and worker-count fields
- employee notes of 1000 characters or fewer

Browser optimization and validation catch oversized selections before submission; the server remains authoritative.

## Quote Statuses

Results can be:

- `analysis_failed`: no AI estimate is available; manual review is required.
- `needs_manager_review`: high-risk, ambiguous, special-disposal, poor-photo, or multi-load cases.
- `conditional_estimate`: useful estimate, but assumptions must be confirmed before a firm quote.
- `direct_quote_eligible`: meets provisional confidence and risk criteria.

Confidence alone cannot create a direct quote. Heavy/restricted materials, demolition, multi-load jobs, poor photos, high hidden-debris uncertainty, and material warnings can require review.

## Pricing Rules

This PR preserves existing provisional pricing amounts and formulas:

- $130 minimum within 25 miles
- $145 minimum for 25-40 miles
- $175 minimum for 40-65 miles
- $450 full-load baseline
- current fixed adjustments
- current cardboard discount
- current hard-coded competitor baseline, still treated as provisional

Known pricing-model issues are intentionally left for later PRs.

## Historical Data

Historical completed-job data is configured through Google Sheets environment variables and accessed only server-side with the read-only Sheets scope.

The redacted audit and future data-design plan live in `docs/historical-data-audit.md`.

No raw spreadsheet export, customer rows, credentials, customer photos, or trained model are committed.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run lint` currently runs TypeScript checking. Add ESLint rules in a later hardening PR if desired.

## Vercel Checklist

Before deploying a reviewed change, confirm these keys exist in the target Vercel environment:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `DIRECT_QUOTE_CONFIDENCE_THRESHOLD`
- `INTERNAL_ACCESS_TOKEN`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SHEET_TAB`
- `GOOGLE_SERVICE_ACCOUNT_JSON`

Do not reveal values in logs, screenshots, docs, or PR descriptions.

## Rollback

Rollback is simple because pricing constants and formulas are preserved. Revert the deployment to the previous Vercel production deployment if access-gate or Structured Outputs behavior blocks internal operations.

Every material PR must include the starting baseline, Preview URL, browser verification, manual verification requirement, rollback commit, and rollback deployment.
