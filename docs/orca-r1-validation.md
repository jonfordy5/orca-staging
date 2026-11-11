# ORCA R1 — dark market widgets validation

Implements only the first work order in [Issue #60](https://github.com/jonfordy5/orca-staging/issues/60) and the [PR #61 handoff](https://github.com/jonfordy5/orca-staging/blob/plan/orca-restructure-v1/docs/orca-restructure-codex-handoff.md). Branch starts at `main` commit `67414a13b9fdfe2d4e9c84419858e823542682c8`.

## Change

The existing advanced chart uses `theme: 'dark'`; the existing symbol-info quote uses `colorTheme: 'dark'`. Only the chart section and quote panel receive navy surfaces, antique-gold headings/borders and readable secondary text. All other embed options, ticker/exchange handling, transparent quote rendering, attribution, delay disclaimer, labels, sizing and navigation remain intact.

The three original realm assets are unchanged (SHA-256 guarded). Their uncropped 3:4 portraits, bottom title overlays and adjacent findings are guarded too. The Living Timeline modules and CSS are unchanged: chart above timeline, desktop 570px panel/210px milestone spacing, blue zigzag/beam, and mobile swipe/rotation behavior.

## Screenshots

These are local section previews, using the actual shared markup, CSS, widget factories and timeline module. TradingView is live; Supabase is never initialized. Research and timeline records are empty local fixtures, explicitly labeled in the captures. They are not staging or authenticated-account screenshots and do not describe the real company's research coverage.

| Viewport | Before (`main`) | After (R1) |
| --- | --- | --- |
| Desktop, 1440 × 1000 | [Page](screenshots/orca-r1/before-desktop.png), [chart](screenshots/orca-r1/before-desktop-chart.png), [quote](screenshots/orca-r1/before-desktop-quote.png) | [Page](screenshots/orca-r1/after-desktop.png), [chart](screenshots/orca-r1/after-desktop-chart.png), [quote](screenshots/orca-r1/after-desktop-quote.png) |
| Mobile, 393 × 851 | [Page](screenshots/orca-r1/before-mobile.png), [chart](screenshots/orca-r1/before-mobile-chart.png), [quote](screenshots/orca-r1/before-mobile-quote.png) | [Page](screenshots/orca-r1/after-mobile.png), [chart](screenshots/orca-r1/after-mobile-chart.png), [quote](screenshots/orca-r1/after-mobile-quote.png) |

The local preview permits only local assets and TradingView hosts. Proxy-trusted HTTP/WebSocket relays support the live embeds without disabling TLS verification. Chart and quote closeups are captured while each iframe is in the viewport; Chromium can omit offscreen iframe painting in full-page captures. Browser screenshots are observational; market data may change between captures. Empty fixture timelines verify the stacked container, while the existing populated-timeline browser suite verifies photo/zigzag/swipe geometry.

## Verification

All passed locally with Node 24 and system Chromium:

- `node scripts/check-shared-research-workspace.cjs` — 52 checks, including new dark-widget/disclosure and locked-realm asset/layout guards.
- `node --test scripts/test-research-publication-confirmation.cjs` — 47 publication/session-isolation tests.
- Timeline suites: `test-timeline-photo-behavior.cjs`, `test-unsplash-progressive-search.cjs`, `test-timeline-history-backfill.cjs`, `test-timeline-completion.cjs`, `test-hybrid-timeline-photos.cjs`.
- `ORCA_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-market-widgets-browser.cjs` — 1440px, 393px and 320px widths; exact dark widget configurations/options, RKLB/NVDA/CVX/BRK.B handling, remounts, invalid ticker, attribution, keyboard focus, unchanged chart heights, stacked timeline and no horizontal overflow. Provider scripts are intercepted; only local fixtures are used. Added to CI.
- `ORCA_CHROMIUM_PATH=/usr/bin/chromium node scripts/test-timeline-mobile-layout.cjs` — five phone/landscape sizes, four desktop sizes, native swipes, rotation, sources, credits and sparse/empty/fallback states.
- All existing Legends Node suites (42 tests), game syntax, and dungeon/feedback/spell/animation/audio/access browser suites. Access uses synthetic Auth/RPC fixtures, not live accounts.
- Inline workspace module and changed test syntax checks; `git diff --check`.

No Supabase, SQL, RPC, assignment, research, consent, publication, game, paid-AI or photo-service changes. No merge or deployment. R2 and later phases remain for owner review. Signed-in two-account acceptance remains the separate owner-authorized staging step described by the plan.
