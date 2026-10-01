# Local city directory and curated route evidence

Draft Preview only. No Production promotion, merge or Maps setup.

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

Selecting a city stores its stable ID and city/county label, directory version, route version, route status and nullable tier. The guided request sends only ID/versions, not client-selected miles or tier. Server validation re-resolves the ID from versioned data, rejects free text/duplicates/stale versions/forged tier fields, and retains canonical city plus derived tier in validated inputs. City data participates in the existing signed clarification context. The old Maps workflow asks users to refresh instead of invoking a provider. The pre-existing internal manual API contract is unchanged.

An unverified/borderline city does not block completing job types/access/photos/notes. Review clearly states the missing tier, and **Check review requirements** returns a successful manager-review response with no price, customer quote, historical figures or paid model call. Original photos/details remain in browser memory for editing. No background staff notification or persistence is implied. **There is currently no supported priced submission from this guided flow until a city's route/tier evidence is verified.** No arbitrary minimum or substitute tier is applied. This phase does not invent a new staff override or confirmation workflow.

## Verification / manual Preview gate

52 focused tests passed across location, guided form, request validation, analyze route, clarification and access protection. Coverage includes source hash/IDs, county disambiguation, exact tier boundaries, synthetic verified routes and boundary review, absent/invalid evidence, stale/forged IDs/tiers, canonical request fields, graceful review withholding, and no external fetch. Typecheck and offline dataset reproduction passed. Desktop/mobile browser smoke passed at 1280/390 using the actual local directory/API and ten synthetic photos, including no-results/free-text rejection, county choices, review submission with no price, retained details, reset and transient local-endpoint failure/retry. The first fixture was below the unchanged photo quality floor; only that fixture was corrected before rerunning. No live Maps/OpenAI/Sheets calls. Preview/build result is recorded in the draft PR.

Manual test: authenticate; search Lake Forest; select Orange County; confirm Staff review required with no made-up miles. Search Anza to inspect county choices. Continue through job type/access/photos/notes; Check review requirements must show Manager review required with no price. Edit original details should retain all entries/photos. Header reset must clear them. No Maps setup message should appear. Real priced-estimate acceptance waits on route verification.

No pricing formulas, $550 load rate, minimums, adjustment amounts, distance thresholds, model selection, historical matching, auth policy, Sheets, website repository or Production changed. No new dependencies, secrets or customer data. Nothing merged or deleted from preserved history.
