# Codex handoff — ORCA restructure v1

**Source of truth:** [ORCA Restructure v1](./orca-restructure-v1.md), [locked world template](./orca-world-locked-template.md), [shared company-page standard](./orca-company-page-standard.md), issue [#60](https://github.com/jonfordy5/orca-staging/issues/60).

## Copy/paste prompt for Codex — implement **R1 only**

You are working as a senior front-end engineer in the existing repo `jonfordy5/orca-staging`. The owner approves the direction in `docs/orca-restructure-v1.md`, but you must implement changes **in small independent draft PRs**. Your first assignment is **ORCA-R1 — Dark Chart and Dark Market Quote, no layout regression**.

**Read before editing:** `docs/orca-restructure-v1.md`, `docs/orca-world-locked-template.md`, `docs/orca-company-page-standard.md`, `research-workspace.html`, existing shared-workspace/browser regression scripts.

1. Create your own fresh feature branch from `main` (e.g. `feat/orca-r1-dark-market`). **Do not edit the restructure planning branch or the PvP branches.** Never modify live data or SQL.
2. In the shared `research-workspace.html`, `createMarketChart()` currently sets `theme:'light'` for TradingView's `embed-widget-advanced-chart.js`. Set it to `theme:'dark'`. Keep the same ticker, chart options, capabilities, quote-provider credit, layout height, auto-resize, navigation, labels and accessibility.
3. In `createMarketQuote()` the TradingView `embed-widget-symbol-info.js` currently sets `colorTheme:'light'`. Set `colorTheme:'dark'`; ensure its surrounding panel contrasts and text remain readable. Maintain quote and agent-opinion independence and quote-delay disclaimer.
4. Harmonize **only the chart/quote section** with the existing ORCA dark-fantasy realm imagery using dark charcoal/navy surfaces, antique gold accent and accessible text. Do not apply a sitewide redesign in R1. Do not crop or retouch the three approved realm artwork images.
5. Keep TradingView **always visible above** the existing always-visible Living Timeline. Do not change its 570px desktop zigzag, glow, image cards, event content or mobile swipe geometry. Do not add a timeline toggle.
6. Add/update focused regression assertions proving both TradingView embeds have the dark setting and no approved world/timeline layout values changed. Run existing Node/browser/shared-workspace suites and syntax checks. Capture before/after desktop and mobile screenshots when environment supports it; be truthful if visual testing is unavailable.
7. Open **one draft PR** referencing #60; provide changed file list, before/after screenshots, verification results and any known trade-offs. **Do not merge, publish/deploy or change Supabase schema.**

**Guardrails:** No new stock-price provider/API/subscription; no new Supabase grants/RLS/migrations; do not change `orca_request_and_claim_next`, assignment `board_key` routing, 4-rating R4 format, owner identity, consent, sources, accepted findings or existing game. No new paid AI or photo requests triggered on page load. This is the first visually testable slice, not the entire redesign.

**After R1** do not continue into R2/R3 automatically. Wait for an explicit owner review, then take the next issue item.

## Stage acceptance for later PRs

- **R2 Metric titles**: six-key *display-only* alias map (six catalog keys vs five server-rotation metrics remains an explicit audit concern). Render `War Drums (News & Market Sentiment)`, `Royal Decrees (SEC Filings & Catalysts)`, `The Ledger (Fundamentals & Valuation)`, `Battle Map (Technical Analysis)`, `Troop Movements (Volume)`, `Signal Fires (Options, only if supported)`. Authentic server board assignment always wins over assumptions from UI names. Preserve approved realm card structure.
- **R3 The Council**: replace misleading all-rounds 'current' semantics with current vs archival counts. Preserve all-time stats separately. Show sourced, dated champion/challenger cases, explicit no-opposition state, expired/stale warning, source-hash state, absent verified catalyst if needed. Tests for mixed timestamps, missing sources, stale summaries, one author 10 reports, and two distinct authors. Never invent a bear case or represent a sample of two as a community consensus.
- **R4 The Company Codex**: reuse existing cached sourced company profile, mission/size information and images, recast as a visual narrative. Preserve attribution, primary facts, missing-field honesty and zero AI on visits.
- **R5 Landing and onboarding**: make stock-search home, agent connection and research workspace one clear journey while preserving current consent/claim/publish steps and the contributor-gated Legends access.
- **R6 backend audit/security**: needs separate owner approval; start read-only, document exact deployed metric set and permission problem, no silent table changes.

## Who does what

- **Codex:** coding and focused tests in isolated PRs; no sweeping edits or merging.
- **This chat:** research/product spec, contract checks, regression review, decisions.
- **ChatGPT Work:** actual website review and end-to-end signed-in two-account test in its own browser after owner-approved staging preview. No credential sharing or cross-account actions.

**Product line:** “Bring your AI. Investigate real companies. Publish evidence. Build your legend.”
**Research principle:** “Independent research. Collective intelligence.”
