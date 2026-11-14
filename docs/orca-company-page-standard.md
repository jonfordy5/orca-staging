# ORCA universal company-page standard (v1)

**Status:** Approved baseline for every existing and future stock ticker in `orca-staging`.
**Scope:** The shared research workspace, company information, Living Timeline, photo metadata, and collaborative research. No per-ticker page copies.

## Approved timeline design — compact straight rail (November 14, 2026)

**Status: November 14 owner-directed revision of the original locked baseline.** Apply one shared compact, straight track to all company pages. Preserve the existing API contracts, sourcing and photography logic. Never fork the layout stock-by-stock.

- **Always-visible stacked charts:** The complete, existing TradingView stock chart stays above a separate Living Timeline. There are **no Chart / Timeline toggle buttons** and no collapsing one view to show the other.
- **Desktop Living Timeline:** Keep the dark navy panel compact (roughly **302px** tall), with approximately **210px between photo-card centers**. The same fully clickable **178px tall photographic cards sit above one straight horizontal blue line**, all at the same height. Preserve their source details, dates, credit and click behavior. **Do not display separate year or numbered nodes** under the cards; dates remain legible inside each photo card.
- **Direct connectors:** Every card has one short vertical stem from the bottom of its photo to the straight horizontal line. No zigzags, circles, fictitious milestones, dangling stems or line crossing photos.
- **Traveling light:** Keep the same single tapered bright white-blue pulse traveling along the line and briefly illuminating each stem and card. Honor reduced-motion preferences.
- **Real history endpoint:** The line starts at the first milestone and ends at the **last real milestone**. Remove the former 380px imaginary future line and oversized empty scroll padding. Future real events extend the track naturally when the cached archive grows.
- **Initial and subsequent navigation:** On desktop initially center the middle existing milestone when possible; keep accessible earliest/latest controls, horizontal scroll and sourced photo-details popup. The first and last cards must remain reachable with no useless slide.
- **Mobile (700px and narrower):** Following the owner's November 9 mobile-only revision, show **one complete, blue-framed photograph card per swipe**, starting at the founding event. Snap directly between consecutive cards with no empty slides or trailing future space. Use an automatic panel height so neither alternating cards nor their frames are clipped. Show a small swipe hint and position count. Preserve the current card across phone rotation. Also use this layout for short, touch-only landscape viewports (up to 1000px wide and 600px high). Keep **no horizontal track, year nodes, stems or animated beam** on mobile. Both charts remain present; vertical page scrolling and pinch zoom remain available.
- **Photo interface:** No **Complete company timeline** or other manually operated population button, no **Check Unsplash API** button, and no **Company photo · not event photo** banner. Keep credits, stored image sources, fallback artwork and the existing discovery/photo-fill APIs unchanged. Only a consented researcher's page load may invoke the existing completion routine if verified status finds real gaps.

**Release gate:** The shared-workspace consistency test protects these properties and runs for every timeline/UI pull request. Preserve the approved layout and animation unless the owner requests a specific visual revision.

## One page, many tickers

- `index.html` and stock search route the selected ticker to `research-workspace-staging.html?ticker=...`.
- The staging alias forwards to **the same** `research-workspace.html` with the ticker intact.
- The shared workspace mounts the same `orca-living-timeline.js`, `orca-timeline-photos.js`, and company-profile components regardless of ticker.
- No new HTML page is created when a stock is registered. Stocks are identified by their verified ticker and cached records.

## What to display

1. **Company** — source-backed business profile, operations, official metrics when available; cache the results and their source links.
2. **Living Timeline** — feature an **open-ended, chronological, sourced history** with the authentic company beginning at the first card, the newest source-backed milestone last, and no fixed maximum. Initial research may aim for ten events but never truncate the archive. Fewer is acceptable; never invent filler. Keep every verified milestone in Supabase. Use the shared straight-rail full-photo layout, accessible arrows, and concise sourced popups (brief overview, two key facts, why it matters).
3. **Media** — automatically derive a simple physical subject from the company's business description. Search Unsplash broadly for that business, independent of event titles, dates and branding. Cache unique photograph IDs and original URLs with credits and license links; use distinctive original artwork for uncovered milestones. All photography is illustrative.
4. **Charts** — TradingView remains **always visible above** the always-visible company Living Timeline, each with its own renderer. Do not copy stock price history into company profiles just to render TradingView.
5. **Research collaboration** — agent identities, research tasks, submissions, previous findings, and majority summaries live in shared per-ticker tables. Never overwrite archived findings when updating the company page.

## Lifecycle and operating cost

- A complete, cached page is **inexpensive to revisit**: when the server reports no missing verified milestones/photos, the page makes no billable research or photo-fill request.
- On page load, a **signed-in user with an existing opted-in researcher profile** may automatically execute the exact existing bounded completion routine if the authenticated free status check succeeds and identifies missing milestones or photos. Anonymous users and users without consent only read the existing cache. An unavailable status response must block automatic billable work. Do not change the APIs or relax their server-side budgets and quotas.
- **Photo search efficiency:** derive and cache four short business-subject queries without web research. Start with one broad Unsplash search; use up to three related searches only while covers are missing. Stop immediately once there are enough unique photographs. Preserve provider limits, authentication, opt-in consent, attribution and a per-company concurrent-request lease. No ticker-specific rules or event matching.
- **Development history budget:** each authorized page-load completion uses the existing $0.15 estimated per-run limit; running requests reuse server-side locking and durable per-scope completion limits. Do not add a client-side retry loop or clear backend limits. Public/anonymous visits must not initiate paid history research. Multiple deliberate authorized reloads may create additional eligible runs if backend persisted limits permit, so monitor the shared cost cap.
- **Photo coverage:** preserve existing distinct cached photos. Reject duplicate IDs/original URLs, broken covers, unusable images and improperly licensed assets. Missing covers receive distinct original SVG artwork; artwork does not count as a photograph. Do not render a manual photo/completion button. Images illustrate the business and are never evidence of a historical event.
- Never impose a fixed ten- or eleven-card display limit. Keep all source-backed events in date order and load larger histories in batches. Preserve the existing current-year/founding/history verification scopes and persisted budget/status stops rather than running unbounded generation. For founding events with only a verified year, display the year alone; do not imply the day is known.
- Target lightweight metadata storage. The measured core-row baseline was **19.6 KiB for NVDA** (10 events/10 photos) and **20.4 KiB for ULTA** (11 saved events/photos). This is a measurement, **not a hard 20 KiB ceiling**: reliable sourcing and useful descriptions take precedence.
- Database indexes, internal storage overhead, backup/replication, hosted image bytes, download bandwidth, chart resources and ongoing agent submissions are **not included** in those row-size figures.

## Tests and release criteria

The `orca-workspace-consistency.yml` workflow runs `scripts/check-shared-research-workspace.cjs` on changes to page modules. It must verify the shared ticker route, company profile and research controls, open-ended timeline, founding/current-year endpoints, preservation of source links, archived history, separate photo metadata, accessible date/navigation, and no manual generation button, with a compact horizontal track and only consent-gated automatic completion.

Also confirm manually before inviting wider external testers:
- NVDA: existing sourced events and photo records are retained; future events and photos append to the chronology.
- ULTA: all eleven previously sourced events are displayed; new dated bulletins append without deleting prior records.
- Companies with sparse histories: saved events remain visible, initial history discovery remains authorized, and founding/current-year research requests are separate scoped operations.
- Responsive desktop/mobile view, keyboard popup behavior, source citations, account consent, and claim → research → publish work in a real browser.

**Changes to this baseline are versioned deliberately** and should be regression-tested before they become the new default.

## KISS business illustrations — November 8, 2026

This replaces all previous v8/v10 brand, event, venue, era, relevance-score and daily-photo-quota rules. Historical audit documents describe earlier implementations, not the current selection policy.

- No company name or historical-event match is required in photo metadata. Sparse captions are acceptable.
- Business descriptions supply recognizable search subjects; Unsplash's ranked search supplies candidates. No per-event model calls or manually curated ticker mappings.
- Retain existing 102 photographs across AAP, AAPL, AMZN, DG, F, MSFT, NVDA, RKLB and ULTA. Database integrity checks confirmed every existing milestone has a unique photo ID and original URL.
- Company histories generate before photographs. Underfilled histories take priority over founding/current-period supplements. A primary history page can support several distinct events; new source URLs must appear in the research provider's returned sources/citations.
- The desktop/mobile design, beam, connectors and future extension are unchanged.

Deployment and validation: Supabase photo-fill v43, discovery v11, migration `kiss_timeline_photos`; GitHub code commit `a188aedb781c39525879ef9269d412dcccd47350`. All four automated suites and GitHub Pages deployment passed. The 102-row photo-content checksum remained `e8db4f7dda4abfad0336283c89ad4510` before and after deployment.

Live authorized generation for CVX, INTC, MCD, META, TSLA, TXRH, WEN and WMT remains pending sign-in. These eight histories still have zero milestones; do not report them complete until they have actually run and been visually checked.
