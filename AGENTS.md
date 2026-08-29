# Wade Home Services Development Safety

All Codex sessions must read this file before modifying this repository.

## Baseline First

- Identify the current working baseline before implementation.
- Record the exact `main` commit, Production deployment URL, deployed commit, starting branch, and rollback deployment.
- Treat verified Production as immutable while new work is underway.
- Stop if the rollback point cannot be identified.

## Branch Discipline

- Work on an isolated branch for every feature, experiment, recovery, upgrade, redesign, or material fix.
- Never develop experimental changes directly on `main`.
- Never force-push `main`.
- Never use `git reset --hard` against the working baseline.
- Preserve failed experiments as closed, unmerged pull requests or archived branches when useful for diagnosis.
- Do not delete branches, tags, releases, pull requests, deployments, or commits merely because an experiment failed.

## Verification

- Use targeted tests while developing and one full verification pass before publishing a candidate.
- Material UI, API, authentication, or image-handling changes require Preview deployment and browser-level verification.
- Unit tests and successful builds are not enough to prove the employee workflow works.
- Do not merge or deploy to Production without Tristan Wade's explicit approval.

## Pull Requests

Every pull request must state:

- Starting baseline commit
- Existing working Production commit and deployment
- Files changed
- Behavior changed
- Tests performed
- Preview URL and browser verification result
- Manual verification still required
- Pricing, security, database, and environment impact
- Exact rollback commit and deployment
- Confirmation that existing versions and failed-experiment history remain recoverable

## Secrets And Customer Data

- Never expose, log, commit, or archive secrets, environment files, customer photographs, customer identities, contact information, full addresses, raw notes, or base64 image data.
- Archive through Git commits, tags, releases, pull-request history, and retained deployments, not copied folders containing secrets.

## Version Labels

- `snapshot`: preserved state, not necessarily certified working.
- `recovery-candidate`: automated and Preview verification passed, awaiting Tristan's manual approval.
- `production-stable`: manually verified, merged, deployed, and approved Production release.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
