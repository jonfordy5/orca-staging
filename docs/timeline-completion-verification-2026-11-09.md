# Timeline completion verification — November 9, 2026

## Diagnosis

Meta started with 10 sourced milestones and 10 unique photographs, but no 2026 event.
Its two prior current-year attempts failed before persistence with
`no_acceptable_primary_source_milestones` (estimated costs $0.02149 and $0.02201).
Neither reached the $0.15 limit; neither reported a database save error. Earlier
candidate bodies were not retained, so the individual candidate rejection cannot
be reconstructed from those records.

The deployed backend supplied conflicting full-history and half-year instructions
for current-year requests without an explicit as-of date/year. It also rejected
`about.fb.com` and `investor.atmeta.com`, both linked by Meta's official website.
Regression tests demonstrate that the old validator rejected those corporate hosts
and first-half current-year events. A separate backend founding matcher missed the
already-saved Harvard launch. The UI concealed the action after an attempt rather
than deriving its state entirely from saved coverage.

## Repair

- Keep the approved timeline layout, styling, navigation and animation unchanged.
- Give current-year research its own instructions and explicit January 1–today dates.
- Accept Meta's vetted alternate corporate hosts; reject unrelated lookalike hosts.
- Align backend founding recognition with saved Harvard launches, incorporation and
  first-store events already recognized by the client.
- Protect $0.05 for current-year research and $0.025 for a missing founding stage
  before the initial history request. The first empty-stock history allocation is
  $0.075. Unspent funds can support subsequent stages; the shared click remainder
  is always calculated from estimated actual usage, not reservation totals.
- Limit provider tool calls before requests; preserve the actual usage calculation.
- Record stage allocations separately, enforce them when publishing, and retain
  consent, per-company concurrency locks and duplicate prevention. No cooldown added.
- Fill only missing photos with the existing KISS engine and reload saved data.
- Report incomplete coverage honestly rather than hide an unresolved action.
- Log candidate dates, URLs, provider completion state and allowed-host decisions.

Database functions changed: `orca_timeline_reserve_generation` (budget overload),
`orca_timeline_reserve_scoped_generation` (calendar-year/founding cache and budget
overload), and `orca_timeline_finish_generation` (stage budget check). New overloads
are executable by `service_role` only. Migration filename matches the version
recorded by Supabase's deployment service.

## Observed staging results

| Stock | Milestones before → after | 2026 events after | Distinct photo IDs / original URLs | New estimated history API cost |
| --- | --- | --- | --- | --- |
| META | 10 → 11 | 1 | 11 / 11 | $0.03352 |
| MCD | 11 → 11 | 1 | 11 / 11 | $0 |
| INTC | 11 → 11 | 1 | 11 / 11 | $0 |
| WMT | 0 → 11 | 1 | 11 / 11 | $0.07499 |

Meta's signed-in click generated one event and one photograph. Its SEC source
confirms completion of five senior-note series on November 5, 2026. Direct source
review caught an incorrect AI-calculated total; that unsupported total was removed
from the saved headline/brief. Current-year instructions now prohibit derived
numerical totals. The existing historical rows and photos were preserved.

WMT's one click saved ten historical events ($0.04183) and then a current-year event
($0.03316), followed by eleven distinct photographs. Its August 20, 2026 results
release directly supports the current-year event. The official 2012 anniversary
annual report contains the historical timeline. No paid origin pass was necessary.

Reservations are not spending: Meta's stage allocation was $0.15. WMT's initial
history allocation was $0.075; after actual history usage of $0.04183, its current
stage could use the remaining $0.10817. These are sequential ceilings, so summing
reservation rows overstates the click's budget. History usage is recorded in the
runs table. The existing photo engine does not persist usage for its small photo-
subject model request; WMT's photo-subject cost is therefore not included above.
Meta reused cached photo queries.

## Verification and deployment

All five suites pass, including JavaScript parsing, locked-design checks, mocked
Edge Function source/date/budget validation, real click-handler sequencing for
saved/empty histories, and KISS photo authorization/cache/uniqueness checks.
Live database RPCs return cached for MCD and INTC history, founding and current year,
and for Meta's existing founding. Stage-budget reservation was checked in a rolled-
back transaction; no fixture history or running job was left behind.

The shared Work browser control tool was unavailable. Signed-in generation was
performed through a user handoff in the same existing session. Separate automated
read-only page loads corroborated persisted META and WMT cards and photos after
refresh. Automated Chromium traffic used Node's verified environment CA/proxy
because Chromium did not trust that CA directly; TLS verification was retained.
The page emitted existing permission-denied errors with empty stacks, but no
JavaScript syntax error. Public loads also rendered MCD/INTC with 11 cards each. The user confirmed WMT saved eleven photographs in one click, Meta retained its 2026 card after refresh, and MCD had no completion button. INTC had no new generation records and its live cache checks required no research.

The GitHub Actions deployment now depends on the shared-workspace tests. The tested
Actions deployment succeeded. Both available integration tokens initially received
HTTP 403 when changing the administrative Pages Source setting. The repository
owner then switched it to GitHub Actions; the Pages API confirms `build_type=workflow`.
The independent legacy branch publisher is disabled, so publication depends on the
syntax and regression checks. Live HTML and timeline JavaScript match the tested
repository files.
