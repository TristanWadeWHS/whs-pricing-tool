# Evidence-based handling and labor: PR 9 Preview

Starting SHA: d7a26ec90dcccba681fc68c415d499b0d2d8fd64 on
codex/shadow-inventory-readiness, draft PR 9 stacked on PR 8, then PR 7 and PR 6.
Rollback tag: preview-before-handling-policy-d7a26ec.
Retained Preview: dpl_KL5cy6FYYp6hpBB4uRuL4YHdGXgq,
https://whs-pricing-tool-p8kg-8qfs3ts24-wade-home-services.vercel.app.
Production remains c2bd1a36cdfb283af04db0eaa32890fb1e1a8524, deployment
dpl_BfDLyWKSRYA8xnAzmDmhxgUyUnro,
https://whs-pricing-tool-p8kg-c5t4l2caq-wade-home-services.vercel.app.
No merge or Production promotion is authorized. Candidate SHA/Preview are in the PR.

## Approved adjustment correction

| Adjustment | Current Preview rule | Preserved amount / mismatch |
| --- | --- | --- |
| Low handling | Explicit one-person easy-carry evidence | No fee |
| Medium handling | One person can move it but requires a dolly/handling equipment | $50; formerly labeled generic heavy/debris risk |
| High handling | Evidence says two or more people are required | $125; formerly labeled heavy/demo/concrete risk |
| Unknown/conflicting handling | No category inferred from names, density, closed boxes, planned crew or uncertainty | No automatic fee; staff review |
| Hidden scope | Resolved uncertainty has no fee. Specific extras must be included in volume or scoped by staff; conflicts retain review/withholding | Former $35/$85 uncertainty fees removed, not added on top of modeled volume |
| Routine labor | Carrying, lifting, loading, organizing, nesting and ordinary packing included in base | Former generic medium $35 removed |
| Exceptional labor | Specific substantial demolition or repeated long-distance movement requires review | Former generic hard/access $100 has no task-specific approval and is not repurposed as a demolition rate |
| Explicit access | Medium/long carry and some/heavy stairs apply once each | Existing $40/$90 carry and $40/$100 stairs retained |

Only one handling adjustment applies, using the highest supported category, never
medium plus high or a charge per repeated observation. Equipment/extra helpers
explicitly attributed only to stairs/long carry do not also create a handling fee.
Carry distance and stairs remain separate approved access dimensions. Routine
labor is not added a second time. No exceptional-labor or hazard rate invented.
Distance minimums ($130/$145/$175), $450 full-load baseline, existing minimum/
percentage limits, $40 cardboard-only discount and range/rounding formula remain.

## Evidence and safeguards

pricing-facts.ts reconciles original employee notes and question-linked signed
answers before priceJob. Existing model observedFacts are separately attributed,
not measurements. Bounded patterns recognize explicit one-person/equipment/crew
requirements; unsupported phrasing remains unknown, not a guessed category.
Bare material/item names may justify material/disposal review but cannot classify
handling. HeavyDebrisRisk remains the old material-risk field, not a fee selector.
An employee low-handling claim conflicting with specific higher-handling evidence
is unclassified pending staff review, with no automatic fee. Mixed-item claims can
require manual clarification because there is no active per-item inventory.

One reconciliation result supplies adjustments, driver messages and evidence.
Closed/lightweight contents alone do not prove all items are one-person lifts.
"Nothing else" resolves scope only. Unknown answers never establish surcharge
evidence. Specific additional material contradicting an explicit no-extra answer
retains the existing unpriced scope-review safeguard. Confirmed extras are not
charged again merely because they are called hidden. Raw generic safety flags
can still require staff review before a firm quote, but no longer invent fees;
answered scope is labeled answered rather than repeating its old warning as fact.

Core failure and genuinely unsupported scope still withhold prices. Valid internal
provisional ranges can appear below 85. Existing confidence/risk firm-quote rules
are preserved, with additional review for evidenced handling/exceptional labor.
GPT scores and policy price ranges remain uncalibrated, not statistical accuracy
or prediction intervals. No model configuration or historical matching changes.

## Packing and units

The existing core prompt now requests efficiently loaded volume with supported
nesting, stacking, folding, flattening and appropriate breakdown. Filled boxes
retain contents; chairs are not automatically dismantled; substantial demolition
is not free packing. Packing assumptions are listed as unverified model assumptions.
Resolved no-disassembly answers suppress a repeated generic disassembly assumption.
No arithmetic packing/compaction factor is introduced after the model estimate.

All displayed volume units derive from estimatedLoadPercent:
55% / 100 * 12 = 6.6 cubic yards; 55% / 100 = 0.55 trailer equivalents.
ceil(0.55) = 1 whole volume-only trip, not one load equivalent or payload approval.
The old independent model load-count/range fields are not displayed as alternative
volume values. Existing conservative quote gates and historical inputs remain
untouched; the provider is instructed to make its count agree with percentage.
Inventory extraction remains deferred. Volume and packing quality still depend
on model observations; this change is not proof of actual-photo volume accuracy.

## Fixed synthetic before / after

Identical inputs and model analysis: under25, mixed junk, short carry, no stairs,
55% / 0.55 loads, all three old risk/difficulty flags medium. Notes confirm one-
person easy carrying, lightweight household goods, all shown items included,
nothing hidden and no disassembly. No exceptional labor evidence.

| Calculation | Preserved d7a26ec code | Corrected Preview |
| --- | ---: | ---: |
| Rounded base: 0.55 * $450 | $248 | $248 |
| Handling | $50 (risk flag) | $0 (low handling) |
| Hidden uncertainty | $35 | $0 |
| Generic medium labor | $35 | $0 |
| Carry / stairs | $0 | $0 |
| Policy range | $335-$415 | $215-$295 |
| Suggested midpoint | $375 | $255 |

The regression test executes the exact preserved pricing.ts from Git in memory,
using the same synthetic fixture for both versions. This isolates adjustment
changes; no customer price or load percent is forced. No new model call involved.

## Verification and manual gate

Focused tests cover handling definitions, unknown/negated claims, contradictory
evidence, question-linked answers, exceptional labor, duplicate/access overlap,
55% unit arithmetic, exact old/new pricing, core failure and firm-quote protection.
Six affected files / 60 tests passed; the final route/clarification rerun passed
21 tests after adding the signed-answer 55% regression. Final typecheck and diff
check passed (normal CRLF warnings only). One synthetic desktop/mobile browser
flow passed with no page errors or overflow; the screenshot was reviewed. The browser
intercepts analysis/history requests; it is mocked UI verification, not live
OpenAI or Sheets verification. No paid request was made: no OPENAI_API_KEY was
available in the local process and no local credential-bearing env file was
present. No secret pull, exposure or persistence was attempted. A real provider
check remains unverified, including the revised prompt's actual-photo behavior.

Manual Preview test: authenticate; use the same side-yard photos with short carry,
no stairs and all shown items included. State that all items are easily carried
by one person. Answer contents with "lightweight household goods", extra scope
with "nothing else", disassembly with "no" when offered. Expect low handling,
no heavy/hidden/generic-labor fees unless specific conflicting evidence appears.
Confirm packing assumptions and internally consistent volume units; do not expect
the live model to return 55% or the synthetic price. Provisional/review labels and
customer-quote restrictions remain. Production, Sheets, model selection, website,
branches, previous tags and deployments are unchanged and preserved.
