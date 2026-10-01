# Phase 2 location adapter (configuration pending)

## Baseline and rollback

Focused follow-up on `codex/phase-2-guided-refinement`, draft PR #12 stacked on #11 (`codex/phase-2-guided-estimator`). Starting SHA: `a888bb69fa1f2353cf21e29c000138d43acc2525`.
Annotated snapshot: `pre-location-fix-snapshot-a888bb6`. Earlier snapshot/candidate tags remain untouched.
Retained rollback Preview: https://whs-pricing-tool-p8kg-naqndu3pn-wade-home-services.vercel.app (`dpl_2yzEgXLHdruBQdVhPUTajhVYbcwh`).
Production/main remains `90ae1c249069a9f5ff05018c48271403dfad33b2`, deployment `dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H`, https://whs-pricing-tool-p8kg.vercel.app.
Rollback means return to the retained Preview or branch from the snapshot; never reset/delete old refs or deployments.

## Implemented path

- Server-only Google Places API (New) autocomplete, restricted to US/California search bounds and city/neighborhood types. Predictions retain place IDs; state-labelled suggestions are filtered, then Place Details verifies US/CA and allowed area types before routing. No address/business destinations accepted.
- Debounced search with a per-session token, keyboard-accessible selection buttons, loading, no-results, provider-error and retry states. Editing the text cancels/invalidate pending resolution and clears any tier.
- Selection requests Place Details for the destination and configured origin. Origin must identify Rancho Mission Viejo. Routes API computes a DRIVE route, traffic-unaware, no alternative routes. No straight-line or invented mileage.
- Route meters / 1609.344 produces driving miles. Existing thresholds are unchanged: <=25, >25 through40, >40 through65. No rounding before tier selection; >65 abstains. Displayed one-decimal mileage is approximate city-level routing, NOT exact customer-address mileage. A result near a tier boundary still needs staff address-level confirmation.
- Selection retains stable ID, coordinates, label, route miles and a one-hour server-signed token in temporary browser state. The estimate endpoint verifies the HMAC, configured origin, expiry, allowed location and exact tier before model invocation. It never trusts browser-supplied miles alone. Reassessment reuses the proof without additional Maps calls. Expiry requires reselecting the location.
- Token signing uses the server-only Maps key with a domain-separated HMAC. It does not use the staff password. Neither key nor provider error bodies are returned. No raw request logging, persistent location cache, Sheet access or service-account reuse.
- Existing protected-route proxy covers the endpoint; responses use no-store. Existing manual internal API contract is preserved. Unresolved guided submissions remain blocked, but other steps can be reviewed.

## Exact configuration gate

No configured Maps integration/key was found locally; only `.env.example` exists. Vercel project metadata lookup failed, so hosted key availability is not claimed verified. No credential pull, service enablement, billing change or live paid call was performed.

Tristan must explicitly approve/configure Google Maps Platform on an authorized billing project:

1. Enable **Places API (New)** and **Routes API**. Legacy Places/Directions APIs or a Maps JavaScript key alone do not satisfy this adapter. These services can incur charges; approve billing, set API quotas/budgets and review applicable provider terms first.
2. Create a dedicated **server-side API key**, API-restricted to those two APIs. Set **`GOOGLE_MAPS_API_KEY`** as a sensitive **Preview-only** Vercel variable on project `whs-pricing-tool-p8kg` (ideally this branch only). Never use a `NEXT_PUBLIC_` name. Do not reuse the Google Sheets service-account JSON. No OAuth scope or Sheets permission is needed for this API-key adapter.
3. Set **`WHS_MAPS_ORIGIN_PLACE_ID`** to the verified Google place ID of the intended Rancho Mission Viejo dispatch origin (or an explicitly approved representative RMV city location). Do not guess a place ID or silently choose a street address. The server rejects a non-RMV origin.
4. Restrict the key to authorized server egress IPs if stable outbound IPs are configured. Browser-referrer restrictions are inappropriate for this server adapter. Vercel's dynamic egress cannot be safely IP-allowlisted without a supported egress arrangement; select an approved restriction strategy rather than removing restrictions blindly.
5. Review Google's attribution/privacy/terms requirements before enabling. The compact location UI displays Google Maps attribution. No public website integration or policy-page changes are included here.
6. Redeploy **Preview only** after setting variables. No Production configuration changes. The complete adapter is now present; unlike the prior placeholder, no further adapter implementation is required for those configured services. Actual provider/region/origin behavior still needs live authorized verification.

Official references: [Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete), [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details), [Routes](https://developers.google.com/maps/documentation/routes/compute_route_directions), [key security](https://developers.google.com/maps/api-security-best-practices), [attribution and terms](https://developers.google.com/maps/documentation/places/web-service/policies).

## Verification and manual gate

50 focused tests passed across location, guided form, request validation, analyze route, clarification and access protection. Mocked coverage includes Lake Forest ID/coordinate selection, country/state/type validation, exact boundaries, no route/out-of-service handling, unknown origin, empty results, provider failures, invalid free text, signed proof tampering/expiry/origin changes, server-side tier validation and no additional Maps call on analysis. Typecheck passed. One synthetic desktop/mobile browser check passed (1280/390): missing config, no results, provider failure/retry, Lake Forest selection with mocked miles, free-text invalidation, approximate-distance label, proof transport, ten-photo submission, clarification/retry/reset and no page errors/overflow. Automatic Preview build and URL are recorded in PR #12.

No live Maps or OpenAI call is claimed. Mocked miles for Lake Forest are synthetic, not measured geography. The Preview is NOT ready for real location-based estimates until configuration and authorized live verification succeed.

After configuration: authenticate, search Lake Forest, select the California suggestion, confirm an approximate route and automatic tier, edit the text to ensure selection clears, then reselect. Complete job types/access/photos/review and submit. Check all original details persist into clarification. Check an out-of-service city yields a review message, not a fallback tier. Confirm provider errors allow retry without losing other form entries.

No pricing constants/formulas/thresholds, model selection, authentication policy, historical matching, Sheets, website code or Production changed. No dependencies added. No preserved version removed or overwritten.
