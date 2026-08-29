# Development Safety And Recovery

This repository preserves working versions through Git, pull requests, tags, releases, and Vercel deployment history. Do not treat copied folders as archives.

## Version States

- `snapshot`: a preserved point in time. It may not be fully verified.
- `recovery-candidate`: a branch/tag that passed automated checks and Preview verification, but still needs Tristan Wade's authenticated manual approval.
- `production-stable`: a manually approved Production release after merge and Production verification.

## Branch Strategy

`main` represents the current Production baseline. New features, experiments, recoveries, upgrades, redesigns, and material fixes must start from the current `main` baseline on isolated branches. Failed experiments should be closed without merge and preserved as branch and PR history when useful.

## Tagging And Releases

Before material recovery work, create an annotated snapshot tag for the starting state when no equivalent tag exists. After a candidate passes automated and Preview verification, create an annotated recovery-candidate tag. Only create a production-stable tag after Tristan approves the merged Production result.

## Vercel Deployments

Preview deployments are for review only. Do not promote a Preview or alter the Production alias without explicit approval. Record the exact Production deployment and rollback deployment in every material PR.

## Rollback Procedure

If a candidate fails before merge, close the PR without merge and preserve the branch, commits, comments, and Preview deployments. If Production fails after an approved release, restore the prior verified Production deployment or revert through a new reviewed PR without deleting evidence.

## Manual Verification

Image submission, authentication, API processing, AI output, pricing, and result rendering require browser-level Preview verification. Tristan's manual authenticated approval is required before Production promotion for material workflow changes.

## Secrets And Customer Data

Never commit or display credentials, environment variable values, customer photos, customer identities, contact information, full addresses, raw notes, base64 image data, or raw Google Sheet rows. Diagnostics may report safe metadata such as key names, status codes, aggregate counts, and redacted error categories.

## Emergency Restoration

Stop before merging or deploying if the rollback commit or deployment is unknown. Use the latest `production-stable` reference when available; otherwise use the most recent verified Production deployment recorded in PR history.

## Avoiding Preview Confusion

Closed Preview URLs and failed branch deployments are retained as evidence. They must not be mistaken for Production. Always verify the Vercel target, alias, branch, and commit before making release decisions.
