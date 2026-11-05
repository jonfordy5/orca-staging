# ORCA universal company-page standard (v1)

**Status:** Approved baseline for every existing and future stock ticker in `orca-staging`.
**Scope:** The shared research workspace, company information, Living Timeline, photo metadata, and collaborative research. No per-ticker page copies.

## One page, many tickers

- `index.html` and stock search route the selected ticker to `research-workspace-staging.html?ticker=...`.
- The staging alias forwards to **the same** `research-workspace.html` with the ticker intact.
- The shared workspace mounts the same `orca-living-timeline.js`, `orca-timeline-photos.js`, and company-profile components regardless of ticker.
- No new HTML page is created when a stock is registered. Stocks are identified by their verified ticker and cached records.

## What to display

1. **Company** — source-backed business profile, operations, official metrics when available; cache the results and their source links.
2. **Living Timeline** — feature **10 distinct, dated, verified milestones** when there are enough primary sources. Fewer is acceptable; never invent filler. Preserve all verified events in Supabase, even when more than 10 exist. Use the shared timeline layout, alternating full-photo cards, accessible arrows, and concise sourced popups (brief overview, two key facts, why it matters).
3. **Media** — search company name first (except disambiguation cases such as `apple computers`), then products/industry. Store photo **URLs, IDs, licensing/credit links and relevance metadata**, not image binaries. Images are delivered from Unsplash's CDN. Do not mislabel illustrative photos as photographs of an actual milestone. Exclude duplicates and review poor matches.
4. **Charts** — TradingView remains a separate, optional market chart; do not copy stock price history into each company profile just to render TradingView.
5. **Research collaboration** — agent identities, research tasks, submissions, previous findings, and majority summaries live in shared per-ticker tables. Never overwrite archived findings when updating the company page.

## Lifecycle and operating cost

- A cached page is **read-only and inexpensive to revisit**: visiting it must not regenerate company text or pay for another photo search.
- Uncached company research and milestone generation require the existing authorized, opted-in contributor flow and Supabase budget safeguards; this is **not** permission to run AI jobs automatically for every visitor.
- **Photo coverage is mandatory for every featured event:** automatically try to fill up to ten milestone cards with Unsplash photography when an opted-in researcher opens the timeline. Query and rank by **milestone subject** (e.g., listing, grocery distribution, leadership, store opening, international expansion) as well as the company/industry. Company-specific visuals are preferred; contextual scenes must remain visibly illustrative, not misrepresented as actual event documentation. Preserve cached credits and allow only **same-ticker, non-flagged** cached-photo fallback. Duplicates are acceptable only as a last resort; if no lawful/relevant image is available, do not claim the card is photo-complete. Retain existing daily/API safeguards. Show **Find photos** or **Improve photos** while a company still needs better images; hide the completed control.
- Keep the ten-event display limit independent from cached event count. Do not delete the eleventh event or truncate archived research when rendering ten cards.
- Target lightweight metadata storage. The measured core-row baseline was **19.6 KiB for NVDA** (10 events/10 photos) and **20.4 KiB for ULTA** (11 saved events/photos). This is a measurement, **not a hard 20 KiB ceiling**: reliable sourcing and useful descriptions take precedence.
- Database indexes, internal storage overhead, backup/replication, hosted image bytes, download bandwidth, chart resources and ongoing agent submissions are **not included** in those row-size figures.

## Tests and release criteria

The `orca-workspace-consistency.yml` workflow runs `scripts/check-shared-research-workspace.cjs` on changes to page modules. It must verify the shared ticker route, company profile and research controls, ten-featured-milestone standard, preservation of source links, archived history, separate photo metadata, accessible date/navigation, and no completed-photo button.

Also confirm manually before inviting wider external testers:
- NVDA: ten sourced events, ten photos, complete brief popups, no photo button.
- ULTA: eleven sourced events cached, ten featured, original source links and photos intact.
- A company with fewer than ten events: the verified events remain visible and the generation flow is available only to authorized researchers.
- Responsive desktop/mobile view, keyboard popup behavior, source citations, account consent, and claim → research → publish work in a real browser.

**Changes to this baseline are versioned deliberately** and should be regression-tested before they become the new default.

### Photo relevance and operational status

Photo search queries are retrieval hints, not evidence that a returned image matches a milestone. Accept contextual candidates only when their own metadata matches the event subject; save that metadata for future reuse. Existing photos without subject metadata may remain visible, but must not be newly approved for another event. International expansion queries retain the company sector.

When the shared 300-photo development rolling allowance is exhausted, show a visible explanation and next capacity time. Do not hide photo failures in the general history status. No photo change regenerates historical research. Metadata matching is not visual verification or proof of an exact event photograph.
