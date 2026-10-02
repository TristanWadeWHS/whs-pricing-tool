# Local city directory and curated route evidence

Draft Preview only. No Production promotion, merge or Maps setup.

## Staff-confirmed tier follow-up

Current behavior supersedes the original unmapped-city submission blocker. Follow-up baseline: `bb1cb6a5971e5378647863995ac3602a2b78f929` on the existing `codex/local-city-directory` / draft PR #13. Annotated preservation ref: `pre-staff-distance-override-snapshot-bb1cb6a`. Retained prior Preview: https://whs-pricing-tool-p8kg-kr2fpfjrh-wade-home-services.vercel.app (`dpl_8HmJ8efvXjFJbdU9nrCHqbVsRt6Q`). Earlier snapshots and deployments remain unchanged.

For an unmapped/unverified city, internal staff may select exactly one existing tier, labelled **Staff-confirmed distance tier**. There is no default selection and no invented mileage. The selection applies only to the current estimate; city edits/reset clear it. It is offered on Location and Review, while other form steps remain accessible.

The server validates `staffDistanceTier` as one existing enum and accepts it only with a canonical unverified city. Duplicate/invalid/file-valued tiers, standalone overrides without a city, and attempts to override an automatically verified tier are rejected. The effective tier is `inputs.distanceTier`; provenance is `inputs.distanceTierSource` (`staff_confirmed` or `verified_city_route`). `inputs.location` retains canonical city data and its unverified route status/null mileage. A staff estimate override is not city verification.

Both the effective tier and its source participate in the existing signed clarification context. Answers reuse the original inputs/photos; changing the tier during reassessment fails verification. Result review displays the city, tier and explicit staff-confirmed label. The ordinary analysis/pricing pipeline and firm-quote safeguards remain intact, including no fallback price after provider/essential-scope failure. No route records or schema are written, and no shared environment values change.

Follow-up checks: 56 focused tests and typecheck passed, including Lake Forest manual tiers, mapped synthetic-city behavior, invalid overrides, signed clarification preservation/tampering and provider-failure withholding. Browser verification and updated Preview are recorded in PR #13; model verification is synthetic/mocked, not a live accuracy claim.

## Baseline and rollback

- Starting branch/parent PR: `codex/phase-2-guided-refinement`, draft #12, stacked on #11. Verified head `f78cb9ff62f92158c95cbd537b2d457e31287a44`.
- New isolated branch: `codex/local-city-directory`. Parent branch is not edited.
- Annotated snapshot: `pre-local-city-directory-snapshot-f78cb9f` at that exact SHA. All previous tags remain unchanged.
- Retained rollback Preview: https://whs-pricing-tool-p8kg-n0hfqfcgc-wade-home-services.vercel.app (`dpl_9WnTrqyuPsp74BuJRujsp3vT25Ci`, READY at the baseline SHA).
- Verified main/Production: `90ae1c249069a9f5ff05018c48271403dfad33b2`, `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg.vercel.app. Unchanged.
- To return to the old Preview, open the retained deployment or branch from the snapshot. Do not move tags, reset branches or promote anything.

## Directory source and scope

Version: `geonames-2026-10-01-7405373487e3`. Public [GeoNames US gazetteer](https://download.geonames.org/export/dump/US.zip), joined to [county codes](https://download.geonames.org/export/dump/admin2Codes.txt), retrieved 2026-10-01. GeoNames maintains downloadable data extracts; source format/licensing: [readme](https://download.geonames.org/export/dump/readme.txt), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The checked-in subset is a transformation: US/CA; the ten counties below; populated-place codes PPL/PPLA/PPLA2/PPLA3/PPLA4/PPLX; source ASCII city/county names and stable GeoNames IDs. Coordinates are deliberately excluded: they do not establish driving distance. Named localities include unincorporated areas, neighborhoods and some small named settlements, not only incorporated cities. This is not an authoritative municipality or WHS service-coverage registry. The population-limited cities500 extract omitted Rancho Mission Viejo, so the full US source was used instead.

| County | Directory records |
| --- | ---: |
| Orange | 292 |
| Los Angeles | 625 |
| Riverside | 265 |
| San Bernardino | 355 |
| San Diego | 404 |
| Imperial | 77 |
| Ventura | 118 |
| Santa Barbara | 105 |
| San Luis Obispo | 93 |
| Kern | 228 |
| Total | 2,562 |

Orange County is prioritized in otherwise equal matches around WHS's known RMV origin. Broader counties are search coverage only; this does not declare them within WHS's approved service area. Lake Forest, Mission Viejo, Irvine and Rancho Mission Viejo are present. County names disambiguate places such as Anza (Imperial/Riverside). Eighteen source name/county groups still have duplicate entries; their stable IDs are shown rather than arbitrarily merging them. GeoNames has no warranty of completeness/current accuracy. Unknown names require staff assistance, not a guessed match.

Versioned inputs/output:
- `data/locations/geonames-socal.tsv`: transformed source subset, including upstream per-record modification dates.
- `data/locations/source.json`: exact raw-source and transformed-subset SHA-256 hashes, URLs, filters and retrieval date.
- `data/locations/cities.json`: generated runtime directory.
- `data/locations/verified-routes.json`: curated route book, currently **zero records**.
- `data/locations/route-verification-needed.tsv`: exact IDs/city/county for **all 2,562 records** still needing route evidence.

Reproduce without a download: `node scripts/import-city-directory.mjs --check`. To regenerate from the committed subset, run `node scripts/import-city-directory.mjs`. A deliberate future refresh uses downloaded public US.txt and admin2Codes.txt with `node scripts/import-city-directory.mjs --import <US.txt> <admin2Codes.txt> YYYY-MM-DD`, followed by review. No runtime or automatic dataset download. Scoped LF attributes preserve snapshot hashes across Windows/Linux. No private/customer rows are part of this data.

## Verified route findings: none

No reliable representative route-distance source was found in the repository. Earlier Maps test miles were synthetic, never measured Lake Forest distances. Historical Sheet schema references to a distance column do not establish route provenance and were not used; no Sheet read occurred. No live Maps route was requested.

Thus **no driving miles and no city tiers are claimed verified**. Every city, including RMV itself, starts as selectable with `Staff review required`, null miles and null tier. A city's name or proximity to RMV does not establish the customer's driving distance. The route-verification queue names every missing record explicitly.

Before adding a record, Tristan/staff must approve a specific public representative origin in RMV and destination in the selected city, record actual driving-route miles from a reliable route source or documented measured route, and record source URL/reference, verification date and reviewer. Do not store customer street addresses or notes. Do not label straight-line distance, estimated travel time or test fixture miles as driving evidence. A schema-valid record still requires substantive human verification; code cannot certify its truth.

`representativeRouteSchema` requires cityId, RMV origin/representative point, destination point, finite nonnegative driving miles, and verification evidence. Optional documented city-route min/max variation requires its own evidence and must contain the representative route. Add only reviewed records, update the route-book version and regenerate/check the queue in a separate reviewed change. The current exact RMV departure point and all destination route evidence remain unverified.

## Tiers and boundaries

Existing thresholds are unchanged: <=25 -> under25; >25 through40 -> 25to40; >40 through65 -> 40to65. Negative/nonfinite/>65 miles never receive a tier. No rounding before mapping.

No invented "near boundary" buffer is introduced. A supported city driving-range that touches or crosses **25, 40 or 65** requires staff review of the actual job route. Missing variation evidence is conservatively review-required as well. A representative point exactly on a boundary cannot release a tier. Missing/malformed/conflicting route records also require review. A validated representative range wholly inside one band can resolve a tier; displayed miles remain approximate city-level evidence, not exact customer-address mileage. Synthetic tests cover these paths; none are production route data.

## Submission and failure behavior

The existing protected local endpoint searches checked-in data only. Loading, empty results and retry states remain. No Maps/API key is required, and no Maps configuration values are removed from Vercel or shared integrations. The old provider module is removed only on this new branch, preserved by parent commits/tags.

Selecting a city stores its stable ID and city/county label, directory version, route version, route status and nullable automatic tier. The guided request sends ID/versions and, only for an unverified city, the explicit staff tier override. It never sends invented miles. Server validation re-resolves the ID, rejects free text/duplicates/stale versions/forged automatic tier fields, and retains canonical city plus effective tier/source in validated inputs. City data participates in signed clarification context. The old Maps workflow asks users to refresh. The pre-existing internal manual API contract is unchanged.

An unverified/borderline city does not block completing job types/access/photos/notes. An explicit staff tier enables **Analyze Job**, using existing pricing and safeguards. Without either a verified automatic tier or staff confirmation, no arbitrary tier/minimum is used: the form requests confirmation and direct API submissions retain the safe manager-review response. Original photos/details remain in browser memory for editing. No background staff notification or persistence is implied. Staff selections never become permanent city mappings.

## Verification / manual Preview gate

52 focused tests passed across location, guided form, request validation, analyze route, clarification and access protection. Coverage includes source hash/IDs, county disambiguation, exact tier boundaries, synthetic verified routes and boundary review, absent/invalid evidence, stale/forged IDs/tiers, canonical request fields, graceful review withholding, and no external fetch. Typecheck and offline dataset reproduction passed. Desktop/mobile browser smoke passed at 1280/390 using the actual local directory/API and ten synthetic photos, including no-results/free-text rejection, county choices, review submission with no price, retained details, reset and transient local-endpoint failure/retry. The first fixture was below the unchanged photo quality floor; only that fixture was corrected before rerunning. No live Maps/OpenAI/Sheets calls. Preview/build result is recorded in the draft PR.

Manual test: authenticate; search Lake Forest; select Orange County; choose the existing distance tier staff has confirmed for this job. Continue through job type/access/photos/notes and Analyze Job. With valid analysis, expect the normal internal estimate labelled Staff-confirmed distance tier, not an automatic city verification. Answer any grounded clarification briefly; city and tier must remain unchanged. Edit original details retains the override; changing city or Start Over clears it. Model failure still yields no fabricated price. No Maps setup is required.

No pricing formulas, $550 load rate, minimums, adjustment amounts, distance thresholds, model selection, historical matching, auth policy, Sheets, website repository or Production changed. No new dependencies, secrets or customer data. Nothing merged or deleted from preserved history.
