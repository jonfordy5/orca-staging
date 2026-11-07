# ORCA universal company-page standard (v1)

**Status:** Approved baseline for every existing and future stock ticker in `orca-staging`.
**Scope:** The shared research workspace, company information, Living Timeline, photo metadata, and collaborative research. No per-ticker page copies.

## Approved timeline design — locked baseline (November 7, 2026)

**Status: Design approved for all existing and future ticker pages.** Preserve the following visual behavior unless a later explicit design change is requested. Implement changes through the shared components; never curate or fork the layout stock-by-stock.

- **Always-visible stacked charts:** The complete, existing TradingView stock chart stays above a separate Living Timeline. There are **no Chart / Timeline toggle buttons** and no collapsing one view to show the other.
- **Desktop Living Timeline:** Dark navy panel at the approved **570px height**, approximately **210px between milestone centers**, with the existing rectangular photograph cards alternating above and below a **shallow blue zigzag**. The photo cards keep their current dimensions, typography, photo coverage, sourced details, and click behavior. Every event has its year, including adjacent milestones in the same year.
- **Direct connectors:** The zigzag joins the short vertical connector under or above each photo **without circular milestone nodes**. The blue line is one continuous SVG path and must not cut across photos or leave gaps.
- **Traveling light:** One **thin, bright white-blue beam** (not two overlapping pulse colors) moves from the earliest milestone toward the newest with tapered, faded ends. Each connector and photo briefly illuminates as the beam passes the milestone. Honor reduced-motion preferences.
- **Open-ended company history:** Beyond the last dated event, the zigzag continues **approximately 380px (two 190px legs)** and the final **150px fades naturally into the background**. The same moving beam travels into this extension and fades. Never add a fictitious future milestone, question mark, empty photo, or permanent hard endpoint. As new sourced company events arrive, recompute the continuation from the latest event.
- **Initial and subsequent navigation:** On initial load, center the **middle existing milestone**. Preserve accessible controls to reach the founding event and latest event, horizontal scroll, and clickable photo details. The founding event must not have an unnecessary line before it.
- **Mobile (700px and narrower):** Keep the simple **horizontal, touch-swipeable photograph cards with no zigzag, year nodes, stems, glow track or animated beam**. Both the TradingView and Living Timeline remain present.
- **Photo interface:** No **Check Unsplash API** button or **Company photo · not event photo** banner on the photo cards. Keep credited image sources in details/metadata and retain the normal photo-find/improvement logic. No new photo searches merely to render the design.

**Release gate:** The shared-workspace consistency test protects these properties and runs for every timeline/UI pull request. Preserve the approved layout and animation unless the owner requests a specific visual revision.

## One page, many tickers

- `index.html` and stock search route the selected ticker to `research-workspace-staging.html?ticker=...`.
- The staging alias forwards to **the same** `research-workspace.html` with the ticker intact.
- The shared workspace mounts the same `orca-living-timeline.js`, `orca-timeline-photos.js`, and company-profile components regardless of ticker.
- No new HTML page is created when a stock is registered. Stocks are identified by their verified ticker and cached records.

## What to display

1. **Company** — source-backed business profile, operations, official metrics when available; cache the results and their source links.
2. **Living Timeline** — feature an **open-ended, chronological, sourced history** with the authentic company beginning at the first card, the newest source-backed milestone last, and no fixed maximum. Initial research may aim for ten events but never truncate the archive. Fewer is acceptable; never invent filler. Keep every verified milestone in Supabase. Use the shared timeline layout, alternating full-photo cards, accessible arrows, and concise sourced popups (brief overview, two key facts, why it matters).
3. **Media** — search company name first (except disambiguation cases such as `apple computers`), then products/industry. Store photo **URLs, IDs, licensing/credit links and relevance metadata**, not image binaries. Images are delivered from Unsplash's CDN. Do not mislabel illustrative photos as photographs of an actual milestone. Exclude duplicates and review poor matches.
4. **Charts** — TradingView remains **always visible above** the always-visible company Living Timeline, each with its own renderer. Do not copy stock price history into company profiles just to render TradingView.
5. **Research collaboration** — agent identities, research tasks, submissions, previous findings, and majority summaries live in shared per-ticker tables. Never overwrite archived findings when updating the company page.

## Lifecycle and operating cost

- A cached page is **read-only and inexpensive to revisit**: visiting it must not regenerate company text or pay for another photo search.
- Uncached company research and milestone generation require the existing authorized, opted-in contributor flow and Supabase budget safeguards; this is **not** permission to run AI jobs automatically for every visitor.
- **Unsplash search efficiency:** make ONE company-name search first, evaluate distinct eligible results against every missing milestone, and search more specific event/brand terms only for unresolved cards; hard-limit each photo-fill attempt to three search API requests. Never spend extra provider requests merely to populate a fixed list of search queries. Keep existing authenticated opt-in, daily limits, source attribution, and no duplicate-photo rules.

**Photo coverage extends to every displayed event:** support batches of up to ten outstanding photos per authorized request as the history grows, preserving provenance and credit links. Query and rank by **milestone subject** (e.g., listing, grocery distribution, leadership, store opening, international expansion) as well as the company/industry. Company-specific visuals are preferred; contextual scenes must remain visibly illustrative, not misrepresented as actual event documentation. Preserve cached credits and allow only **same-ticker, non-flagged** cached-photo fallback. Never repeat an identical photo across milestone cards; if insufficient distinct lawful/relevant photos are available, leave those cards pending for the next authorized automated search rather than cloning an image. Retain existing daily/API safeguards. Show **Find photos** or **Improve photos** while a company still needs better images; hide the completed control.
- Never impose a fixed ten- or eleven-card display limit. Keep all source-backed events in date order and load larger histories in batches. Support optional researcher-initiated current-year bulletins in each January–June and July–December window, not unbounded automatic spending. For founding events with only a verified year, display the year alone; do not imply the day is known.
- Target lightweight metadata storage. The measured core-row baseline was **19.6 KiB for NVDA** (10 events/10 photos) and **20.4 KiB for ULTA** (11 saved events/photos). This is a measurement, **not a hard 20 KiB ceiling**: reliable sourcing and useful descriptions take precedence.
- Database indexes, internal storage overhead, backup/replication, hosted image bytes, download bandwidth, chart resources and ongoing agent submissions are **not included** in those row-size figures.

## Tests and release criteria

The `orca-workspace-consistency.yml` workflow runs `scripts/check-shared-research-workspace.cjs` on changes to page modules. It must verify the shared ticker route, company profile and research controls, open-ended timeline, founding/current-year endpoints, preservation of source links, archived history, separate photo metadata, accessible date/navigation, and no completed-photo button.

Also confirm manually before inviting wider external testers:
- NVDA: existing sourced events and photo records are retained; future events and photos append to the chronology.
- ULTA: all eleven previously sourced events are displayed; new dated bulletins append without deleting prior records.
- Companies with sparse histories: saved events remain visible, initial history discovery remains authorized, and founding/current-year research requests are separate scoped operations.
- Responsive desktop/mobile view, keyboard popup behavior, source citations, account consent, and claim → research → publish work in a real browser.

**Changes to this baseline are versioned deliberately** and should be regression-tested before they become the new default.

### Photo relevance and operational status

Photo search queries are retrieval hints, not evidence that a returned image matches a milestone. Accept contextual candidates only when their own metadata matches the event subject; save that metadata for future reuse. Existing photos without subject metadata may remain visible, but must not be newly approved for another event. International expansion queries retain the company sector.

When the shared 300-photo development rolling allowance is exhausted, show a visible explanation and next capacity time. Do not hide photo failures in the general history status. No photo change regenerates historical research. Metadata matching is not visual verification or proof of an exact event photograph.

Photo identity v8: new selections require the complete company brand in image metadata (plus sector context for ambiguous names), or a named NYSE venue for a listing event. Generic stores, anonymous leadership meetings and homes are not acceptable. When event-specific photography is unavailable, accurately identify illustrative company images in stored provenance and the detailed attribution (not in a large banner on the photo card). Intentional reuse is not an improvement loop. Existing legacy collections are not automatically purged.


## Photo QA v8

- Existing image IDs repeated across multiple featured events remain unfinished and eligible for improvement. The old exact-subject exemption no longer hides duplicates.
- Photo search accepts caption-supported event scenes (e.g., grocery refrigeration, NYSE, Mexico retail, leadership) and company-identified photos. Queries alone do not establish caption relevance.
- Event-specific context is ranked above generic company storefront imagery. Reuse preserves a visible illustration but must not be falsely reported as a new unique photo.
- Daily 300-photo development cap, opted-in authentication, company research cache, source links and trading behavior remain independent.
- Do not interpret a full set of photographs as visually verified event photographs. Manual inspection is still the release gate.
