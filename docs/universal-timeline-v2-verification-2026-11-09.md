# KISS Universal Timeline V2 — verified November 9, 2026

## Confirmed TXRH causes

The original TXRH history run began at 18:36:20.818 UTC; the company profile became
ready at 18:36:21.321 UTC. History retained the missing official-site value from its
initial read. Diagnostics show four corporate-source candidates rejected by the
host check, including the founding event; SEC sources passed. The same founding
source passed a later origin request once the profile was ready.

The original click did run follow-up, current-year, origin and final history stages.
It saved six pre-2026 milestones plus a 2026 event, spending $0.12951. The remaining
$0.02049 was below its $0.03 estimated search headroom. It was not a database failure
or a seven-event target; early source exclusions wasted the available research work.

During verification, a focused history request returned a completed response with
an empty candidate array, costing $0.03793. No candidates were rejected. The prior
logic prematurely treated one empty focused response as a terminal source limit,
leaving $0.11207 unused. It now changes approach once, using the official source
index, business description and largest historical gaps, when budget permits.

The Commons adapter also excluded otherwise valid photos because current API
thumbnails use `thumb.wikimedia.org`; it previously accepted only the original
`upload.wikimedia.org` host. Both explicit Wikimedia hosts are now supported.

## Changes

- Refresh a missing verified company identity after provider research and before
  source validation. Keep first-party/SEC verification and duplicate prevention.
- Supply verified company context, existing source URLs and historical gap periods
  to focused research. An empty first pass can use one different source-index pass
  inside the same $0.15 click budget; no-progress evidence remains a valid limitation.
- Recognize legitimate “First [company] opens…” founding events. SQL word boundaries
  also prevent “foundation” being mistaken for “founded.” Existing consent, locks,
  service-only access and cache rules remain intact.
- Search Unsplash restaurant/product and signage queries plus Wikimedia Commons
  for up to two identifiable branded photographs. Names are derived from stored
  company identity, including legal-suffix cleanup and static-profile stock fallback.
- Fill only remaining gaps with cached business-subject queries, preferring Unsplash
  with Commons fallback. Never rank photographs against event titles or years.
- Use basic size/type, metadata/brand and licensing checks. Reject obvious screenshots,
  generated artwork, ambiguous branding, closed/abandoned subjects and unsupported
  Commons licenses. No AI visual scoring or new dependency was introduced.
- Preserve image IDs, canonical original URLs and Commons hashes for deduplication.
  Keep Unsplash hotlinks, photographer links/UTM parameters and download tracking.
  Store Commons creator, file page, license and attribution; identify card cropping.
- Cache the bounded brand pass. Existing good imagery is reused; at most two covered
  cards need branded upgrades. Replaced credited photographs remain in `previous_photo`.
- Keep one Complete company timeline action. A completed timeline can receive its
  one-time photo upgrade without paid history research. Existing two-brand coverage
  is reused across the thumbnail-adapter policy change.

Core files: `orca-living-timeline.js`, `orca-timeline-photos.js`, the version import
in `research-workspace.html`, both timeline Edge Functions, the two new migrations,
expanded existing tests, `scripts/test-hybrid-timeline-photos.cjs` and the gated CI
workflow. No timeline CSS, geometry, beam animation, card layout, navigation,
responsive behavior, independent research, stock ratings or collaboration changed.

## Final live data

| Company | Past historical events | 2026 events | Total cards | Unique photo IDs / original URLs | Branded photos |
| --- | ---: | ---: | ---: | --- | ---: |
| TXRH | 9 | 1 | 10 | 10 / 10 | 2: Unsplash + Commons |
| WEN | 10 | 1 | 11 | 11 / 11 | 2: Unsplash |

The successful TXRH click added three supported events:

- December 29, 2005: acquisition of 11 franchise restaurants — dated SEC-hosted release.
- June 27, 2007: acquisition of nine franchise restaurants — explicit event date in
  the SEC-hosted July 30, 2007 release, rather than its later publication date.
- March 18, 2021: announcement of founder/CEO Kent Taylor's passing — dated corporate release.

All three sources were fetched and read directly. The first headline was tightened
to the explicit 11-restaurant fact, avoiding an unsupported implication of the first
acquisitions in the company's entire history. Existing founding and 2026 events
were reused. Ten remains an approximate saved-event starter target, including the
current-year anchor; no extra event was fabricated to make ten historical plus one.

All seven original TXRH steak image IDs remain visible, with one reassigned to a
new card after a branded upgrade. WEN retains nine original burger photos on cards;
two original credited photos are archived beside their branded replacements. No
original image was lost. The Commons image is Rick Obst's Texas Roadhouse Restaurant
Building, CC BY 4.0; its file page, creator and license are saved and rendered in the
existing attribution area. Every photo remains explicitly illustrative.

## Spending, tests and deployment

The successful TXRH click cost **$0.03813 estimated actual history research**, against
its $0.15 reserved ceiling. The earlier diagnostic attempt cost $0.03793: **$0.07606
in total for this repair's two verification requests**. The original pre-repair click
cost $0.12951 separately. WEN incurred **$0 new history research**. Both companies
reused cached photo subjects; branded searches use provider APIs without an AI
visual-relevance call. Reservations are not reported as spending.

All six suites pass. Mocks cover first batches of 4/6/7/8/9/10, the profile-readiness
race, an empty focused response followed by a different official-source approach,
rejected sources, duplicate facts/URL variants, accurate budgets, terminal caching,
license filtering, both provider rate limits, current Commons thumbnails, old-photo
preservation and static-profile company names.

The user confirmed Wendy's photos looked good and the corrected final TXRH click
worked. Shared Work browser control was unavailable, so signed-in clicks used the
same user-browser handoff as earlier. Separate automated read-only reloads verified
TXRH/WEN plus WMT/MCD/RKLB/CVX/TSLA with no JavaScript syntax errors. The Commons
credit rendered as “Rick Obst via Wikimedia Commons · CC BY 4.0 · cropped for card
display.” WMT/MCD/RKLB/CVX retain 11 cards/photos each; TSLA retains 10. Their image
IDs and original URLs match the baseline; none incurred new research during this task.

Supabase discovery version 19, photo-fill version 47 and both migrations are live.
GitHub run 42683395650 passed all tests and the dependent Pages deployment. Pages
remains in Actions mode, with syntax/regression checks required before publication.
No missing or duplicate photo cards remain in TXRH or WEN. Evidence, image-provider
availability and the shared budget still bound future research; a genuine limitation
is saved and explained instead of inventing milestones or repeatedly charging on refresh.
