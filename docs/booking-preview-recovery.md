# Preview clarification recovery

Parent: ae006c941235e39a7ae8d4066b5ed00f32fc8e65, draft PR 24.
Branch: codex/booking-preview-recovery. Preserve PR 24 and all earlier branches.
Rollback Preview: https://whs-pricing-tool-p8kg-gycgdrz12-wade-home-services.vercel.app.
Production remains 90ae1c249069a9f5ff05018c48271403dfad33b2,
dpl_3Vm9usvhFAEeLj3nNFGA6FTuBy7H,
https://whs-pricing-tool-p8kg-5mi2ff1wm-wade-home-services.vercel.app.

Reported symptoms: price appeared only after repeated questions; availability
failed while the form also displayed a no-times-loaded option.

Confirmed code defect: Confirm scope previously discarded filled question answers;
Send answers discarded pending item choices. Both actions, and a direct linked
answer reply, now send the entire known clarification draft together. Blank
questions remain pending, explicit Not sure is preserved, and answers belonging
to excluded items are omitted. Nothing auto-includes unconfirmed items or bypasses
volume validation. This is a reproducible failure path; the exact cause of the
owner's specific run has not been established from its stored revisions.

Booking was intentionally disabled in the tested Preview. That is not evidence
that Google Calendar itself is out of sync. Disabled booking now returns an
explicit booking_disabled response. The UI shows a no-appointments message only
after a successful availability response with zero slots. Failed/unloaded requests
show an error and never masquerade as a full day. Slots are reset on date changes
and late responses from an earlier date remain ignored.

347 tests passed (one opt-in skip), including a route-level regression returning
$330 on the first combined scope/answer submission. TypeScript passed. Browser
script now distinguishes disabled/failed, genuinely empty and populated results;
it has not run here because the local browser runtime was unavailable and the
cloud browser timed out. Production pricing formulas and model are unchanged.

Calendar integration verification remains blocked by Vercel connection scope:
website project prj_DWYUygmqzTKzzjqDeNkxwUczJOls / wade-home-services-push in team
team_GrpmUkPfH7MfZvSZWrNEDMaJ / wade-home-services. The latest website Preview
6f992ffd395dcedc55532c7d17e69b2c49d78a83 is READY, but protected fetch returned
403 at read_protection_bypass and domain inspection returned not_found.
The earlier same-project CLI fallback had no credentials. Do not disable
protection or substitute another project. The owner must authorize this project
in the Vercel connection before protected integration verification can finish.
PRICER_HISTORY_ENABLED=true and PRICER_BOOKING_ENABLED=false are scoped only to
this recovery Preview. No notifications, bookings, Calendar writes, or Production
release are part of this repair. Native iPhone testing is outstanding.
