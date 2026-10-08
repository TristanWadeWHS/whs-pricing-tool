# Ordinary-job volume correction

## Baseline and rollback

Starting branch: `codex/winston-follow-up-preview`, draft PR #17 at
`96d03caac6a348f534ab56c4f9392e5d4bf5df6d`, stacked on #16 and its retained stack.
Snapshot: `pre-volume-scope-snapshot-96d03ca`.
New isolated branch: `codex/ordinary-job-volume`; no booking development in this change.
Retained prior Preview:
https://whs-pricing-tool-p8kg-p9s1ejz24-wade-home-services.vercel.app
(`dpl_74AikfVcs8E4MCPZPeW9rJii62k4`). Use that Preview or branch from the snapshot
to return to the prior candidate. Never move/delete preserved refs.
Production remains `90ae1c249069a9f5ff05018c48271403dfad33b2`,
`dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg.vercel.app.

## Confirmed source-code cause versus live unknown

`POST /api/conversation` parsed GPT output with `conversationModelSchema` and passed
it to `finishConversation`. The latter produced the reported generic message when
ANY of these held: empty `analysis.visibleItems`, a free-text warning/uncertainty/range
matching an unbounded-volume regex, or `analysis.estimatedLoadCount > 2`.
Any reason then set baseline to null. This did not reconcile those signals with
the confirmed item groups or independently account for their loaded volume.
The prompt also invited a placeholder unbounded response and a two-load veto.

Four included groups alone were not a code-level cause. A stale warning or an
inconsistent group-count-as-load-count could trigger the veto; we do NOT claim
either was the actual provider output in the customer's test. No sanitized provider
payload for that run was supplied. The photo was inspected in the conversation,
not copied, committed, logged or sent to a model API. Full original description
and answers were still unavailable when the regression was authored.

## New loaded-volume path

The same configured model now supplies `loadedGroups`, each with canonical item
IDs, photo references, visible quantity description, an observed-fact citation,
low/high **already loaded** cubic yards, packing assumptions, specific uncertainty,
handling concern and applied answer IDs. Equal endpoints are a point estimate.
No exact dimension input is required. The prompt requests ordinary visual estimates
from photos plus the full description/answers, with ranges for material perspective,
depth or packing uncertainty. Null bounds are reserved for a specific missing
essential quantity/extent fact, not uncertainty about weight, confidence or exact
measurements. No universal packing factor, density table or numeric payload is added.

`reconcileLoadedVolume` requires all included IDs exactly once across volume groups,
rejects excluded/unconfirmed IDs, overlapping contributions, missing observations,
invalid photo references, reversed/missing bounds and missing answer attribution.
A pile and its enumerated constituents can share one group; adding those IDs again
is rejected. Cross-photo physical identification still depends on the model; unknown
overlap retains the existing withholding safeguard.

Group lower bounds and upper bounds are summed separately. Each total is divided by
12 and multiplied by 100 to derive loaded-trailer percentage. For a range, its
midpoint is only an arithmetic display summary, NOT a calibrated prediction.
The existing application `volumeBaseline` calculates each price endpoint as
`percentage / 100 * 550`. Point estimates remain points. The model's legacy percent,
load count, confidence and generic warning prose are no longer pricing inputs or
independent volume vetoes. There is no additional compaction discount or surcharge.
The completed UI shows the same percentage/cubic-yard/trailer-equivalent range.

The shared calculator's existing 1%-200% numeric domain is unchanged. If actual group
endpoints fall outside it, the message names the calculated cubic-yard range and
the unsupported endpoint policy; it does not invent/clamp a smaller load. That
separate calculator-domain policy is not inferred from a model's hauling/load count.

## Scope, answers and handling

Incidental stones/path pieces stay unresolved until an explicit include/exclude
choice. The existing labeled scope selector asks specifically about that group.
Unresolved removal scope still withholds all prices, promotion and booking panels.
Included dense pieces add only their supported volume; item-specific handling,
payload or disposal concerns remain staff-review notes, never invented charges.

Questions must be observation-linked, unanswered, impact=volume and name a
quantity/packing/scope effect. Handling-only questions do not delay the volume
baseline. Exact-dimension questions (including previously pending ones) are not
required when validated visual loaded-volume bounds already support the item.
Other signed pending questions persist; answers and original photos/
messages are retained. Each estimated group must acknowledge its relevant answer
IDs. The prompt explicitly distinguishes no disassembly, filled versus empty
cardboard, lightweight contents and no additional hidden scope. Those meanings
must not be conflated. Contradictions still require exact prior answer text and
a concrete cited observation; handling-only conflicts retain the volume baseline
with review, while volume conflicts withhold it. No answer is silently overwritten.

## Synthetic regression and limitations

The four-group fixture uses generic panels, trim, cardboard and bagged goods beside
an optionally included stone path. Its numeric values are deliberately synthetic,
NOT measurements or a claimed estimate of the supplied photo. Four synthetic groups
sum to 2.4-3.6 loaded cubic yards: 20%-30%, application baseline $110-$165. An explicitly
included synthetic 0.6-cubic-yard stone group changes that to $137.50-$192.50 with
handling review; excluded stones add nothing. These are volume-only figures, not
final quotes or assertions that any location minimum has been satisfied.
The existing fixed-input 7.2-cubic-yard / 60% point remains $330.

The regression deliberately includes legacy `estimatedLoadCount=4` and a stale
unbounded/exact-dimensions warning: old code withholds; new group accounting succeeds.
Other focused checks cover range explanations, missing volume, overlap, combined
pile/constituent groups, stone choices, handling-only questions/conflicts, preserved
answers/photos/context, no model dollars and the existing pricing/booking safeguards.
Schema conversion is tested locally with the installed provider helper; the required
nullable-field pattern follows the [official structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs).
No paid model, Maps, Sheets, calendar, email or SMS calls. Provider output is mocked;
real photo interpretation, packing quality and volume accuracy remain unverified.

## Manual Preview acceptance

1. Use the original photo, full description and exact answers privately in Preview;
   do not upload them to GitHub. Check all listed groups and confirm which are removed.
2. Explicitly exclude path stones if they stay, or include the actual loose pieces
   intended for removal. Do not expect the model to infer removal from visibility.
3. Answer only grounded, material volume questions. A common identifiable load must
   not demand tape measurements by default. Confirm prior answers remain respected.
4. After scope completion, review the model-estimated group packing assumptions and
   range uncertainty. Check endpoint arithmetic using the returned percentages,
   not the synthetic test values. Confirm specific weight review adds no surcharge.
5. During new analysis or required scope questions, prior prices must disappear.

Production, core pricing constants, staff estimator, booking-disable controls, model
selection, auth, upload budgets, historical matching, Sheets and website are unchanged.
All previous refs/deployments are retained; nothing merged or promoted.
