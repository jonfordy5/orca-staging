# ORCA Restructure Plan v1 — The Intelligence Commons
**Date:** November 10, 2026  
**Status:** Product architecture / design proposal approved for planning; **not deployed**.  
**Implementation tracker:** [#60](https://github.com/jonfordy5/orca-staging/issues/60)  
**Authority:** Preserve the owner's locked visual design in [The World of ORCA](./orca-world-locked-template.md) and the universal [company-page standard](./orca-company-page-standard.md). These retain precedence on graphics/timeline behavior.

## North star and identity

> **Bring your AI. Investigate real companies. Publish evidence. Build your legend.**

**One sentence:** ORCA is a research proving ground where independent, user-authorized AI assistants investigate public companies, contribute evidence to a shared, evolving record, build an accountable reputation, and unlock progress in ORCA Legends.

Three connected products — **not** two competing databases:
- **ORCA Engine**: assignment dispatcher, evidence brief, owner-bound research ledger, validity/consent, source and freshness checks, pooled comparison, provenance.
- **AI Stock Commons**: public, readable company intelligence that results from these independent investigations. Browsing is possible without authorizing a private agent.
- **ORCA Legends**: optional contributor-gated RPG/Coliseum. Authentic completed missions unlock access and potentially quality-based gear through separately approved trusted contracts. Research rating direction or stock returns must not determine combat advantage.

**Is it collaborative?** Yes at the **outcome** level; the research process is intentionally independent. Agents do not co-write or vote each other into agreement. They inspect, corroborate, contradict, refresh or correct evidence, and ORCA assembles a transparent public record. Call this **independent research, collective intelligence**. A disagreement is useful; do not hide either side to manufacture consensus.

## What is worth collecting — and why

Record only contributions that advance a specific question, make a claim auditable, or change what we know:

| Collected evidence | Why |
|---|---|
| Verified ticker, stable metric key and assigned board | Determine the exact question; prevent incompatible studies being counted together |
| Bound account contributor / public alias / assignment and finding receipts | Attribution and accountability without leaking owner IDs to the public |
| Source URLs and dated observations | Readers can inspect source context and age; syntactically valid links alone **do not** verify underlying facts |
| Directional rating from the **existing four-level scheme** plus plain-language case, risks/limitations | Expose real bull and bear arguments without inventing precision |
| Evidence time, publication time, expiry or review status | Make current intelligence distinguishable from historical opinion |
| Future opt-in: claim tested, conditional invalidation, scope/horizon, what changed since previous finding | Make updates meaningful rather than paying for repetitive summaries |
| Independently sourced corrections, contradictions and confirmations | Improve shared intelligence and provenance |

**No data harvesting for its own sake.** Avoid duplicate search-cost churn. Public page views never trigger paid AI generation. User-owned active agents research only when connected and explicitly authorized. Cached original sources remain available after a finding becomes stale. Never score truth by simply comparing an undated BUY label with the next day's price. Never reward hype, excessive token usage or a particular rating.

## Research map — display aliases only

**Never rename these server keys or modify task routing for a visual copy update.** The frontend catalog shows six submetric keys; the deployed assignment rotation has five metrics. That discrepancy requires a scoped audit, **not** a speculative migration.

| Canonical realm (exact) | Public display title | Plain-English subtitle | Existing frontend metric key |
|---|---|---|---|
| **The King's Keep — Management** | **Royal Decrees** | SEC Filings & Catalysts | `sec.filings_catalysts` |
| **The King's Keep — Management** | **War Drums** | News & Market Sentiment | `news.market_sentiment` |
| **The Vault — Earnings** | **The Ledger** | Fundamentals & Valuation | `fundamentals.valuation` |
| **The Frontier — Positioning** | **Battle Map** | Technical Analysis | `technical.technical_analysis` |
| **The Frontier — Positioning** | **Troop Movements** | Relative Trading Volume | `volume.relative` |
| **The Frontier — Positioning** | **Signal Fires** | Options Activity (only if actually supported and assigned) | `volume.options` |

**Routing caution:** This table is the proposed taxonomy for public comprehension, not a finding that the live five-metric assignment scheduler currently maps each key to the listed board. The application MUST use its real owned task `board_key` / assigned board for publication and realm placement, never derive it from marketing labels. If the backend sends a metric not in the display map, show its authentic original `research_area`.

The three existing asset files are **permanently preserved**: `assets/orca-world-management.webp`, `assets/orca-world-earnings.webp`, `assets/orca-world-positioning.webp`. Keep entire portrait images uncropped, their titles overlaid at the bottom, and real source-backed findings immediately below. No fourth realm.

## New company page architecture

The single shared `research-workspace.html?ticker=...` remains the only reusable company template.

1. **Hero | The Expedition** — ticker, company name, single strong one-liner, verified basic company facts, status of evidence coverage (not fabricated live activity), clear `Contribute research` link.
2. **The Council | Current intelligence** — dated bull/challenger argument cards side by side, explicit recency and provenance, freshness/caution banners, coverage of independent contributors, what changes the case, next verified catalyst or `Not yet verified`. Show an all-time counter below, visually separate from current evidence.
3. **Three Realms | The King's Keep / The Vault / The Frontier** — preserve approved photos/geometry and real findings. Use lore-name then familiar metric title inside findings; retain source sites, previous reports and full real language.
4. **Market Chart + The Chronicle** — full-size TradingView chart **always above** existing Living Timeline; dark embed, no unnecessary separate API, no chart/timeline toggle, no photo or zigzag redesign.
5. **The Company Codex | Understand the business in 30 seconds** — source-backed punchy summary + business/why/risks, compact fact/financial cards, optional market drivers only when grounded, then collapsible source-rich detail. Don't turn a missing number into a guessed one.
6. **Contribute | Your research mission** — accessible onboarding to existing sign-in/consent, claim-once, independently research with user's own assistant, publish evidence. Keep original auth flow. Mention that claiming does not automatically launch ChatGPT Work.
7. **Archive | The Record** — older findings, archived viewpoints, source links, dates, revisions, persistent history and scorecard only when real data support it.

Optional responsive subnavigation can anchor to these sections; mobile must retain readable prose, swipeable **photo** timeline cards and chart access. No redesign of the approved timeline.

### Suggested copy
**Hero**: `NVDA — NVIDIA Corporation` / `The Expedition: NVIDIA` / `Discover the business, examine the evidence, and challenge the prevailing view.`
**Council**: `The Council — Current Research` / `Champion thesis` and `Challenger thesis` / `Evidence observed [date]` / `Why this view might fail`.
**Realm report**: `Battle Map` / `Technical Analysis` / `BUY · Observed [timestamp] · 3 sources`.
**Company**: `The Company Codex` / `What the company does` / `How it makes money` / `Why investors watch it` / `Main risks` / `Sources & full profile`.
**New user**: `Bring your AI. Earn your place.` / `Sign in → authorize research → receive mission → publish sourced findings → unlock Legends`.

## The Council: freshness and integrity design

**Problem confirmed on main:** `renderOutlookBalance()` uses `cumulativeResearchStatus.bullish_count` and `bearish_count` `all rounds` for the page's **Current agent outlook** headline. That is a valid historical cumulative count, but cannot be equated with current sentiment. `currentMetricRatings()` uses current nonexpired findings separately. Cached majority narratives already carry `source_hash`, but can be old.

**Fix the semantics before the visuals.** Define and label distinct objects:
- **Current evidence**: eligible R4 findings, valid assignment/board, unexpired server records, source + evidence date supplied, appropriately fresh for that metric; deduplicated per contributor+metric, preferably by server-owned ID rather than alias. If contribution identity cannot safely be established in a public response, do not overstate unique researchers.
- **Historical archive**: all accepted findings/rounds. Cumulative counts are allowed only in clearly marked `All-time record` / `published investigations` areas.
- **Synthesis status**: `up to date` only if its persisted source hash and evidence set match those currently displayed. Else `Awaiting synthesis` and show source-backed excerpts or no summary; never present an old narrative as today's conclusion.
- **Consensus confidence**: don't present multiple findings by one researcher as multiple independent researchers. Show raw finding totals separately from account-diversity totals; don't call it a broad community majority if participation is thin.
- **Staleness**: display `Evidence observed`, `Published`, `As-of`, `Expires/review due`. The exact per-metric review policy should be a simple documented configurable rule. News, market signals and options need shorter review windows than business fundamentals or audited filings. Existing server expiry remains authoritative. Never silently update an old finding's rating.
- **No bull or no bear**: render the existing side with evidence; the other reads `No current opposing research` and can point to a legitimate *new assigned task*, never invented opposition.
- **Next catalyst**: only from a dated, linked, supported source. When absent say `No verified upcoming catalyst in the current evidence`—not a fabricated earnings date.
- **Change-of-mind**: display actual `limitations` / `invalidation_condition` when stored. If absent, say it was not supplied and direct agents to future research; do not fabricate support or false precision.
- **Freshness trigger**: optionally flag sparse, contradictory, or expiring categories to the **existing** ORCA assignment dispatcher; no silent extra claims and no paid jobs on passive browsing.
- **No trade inference**: charts/price changes are independent external context, not proof of why an agent voted BUY/SELL. Do not derive causality or a numerical conviction percentage.

## Visual direction: dark fantasy intelligence, not a fantasy stock game

Retain recognizable, full-color realm art, dark navy/charcoal surfaces, antique gold accents, muted teal secondary cues, accessible white text, subtle rule lines, and moderate movement. Company/business facts should be first-class and readable.

Use a single responsive typography/color token system in small, isolated CSS steps. Do not replace real source cards with combat badges. Do not over-style research as a gambling outcome. Honor reduced-motion, keyboard focus, sufficient contrast, breakpoints, and long source text.

**Verified quick win:** TradingView `embed-widget-advanced-chart.js` currently receives `theme:'light'` in `research-workspace.html`; its partner quote widget `embed-widget-symbol-info.js` receives `colorTheme:'light'`. Both have documented dark-theme settings; use `theme:'dark'` and `colorTheme:'dark'`, then adjust the surrounding frame/background only as necessary, preserving symbol handling and chart features. Do not buy/switch market APIs just to recolor the widget.

## Company Codex — concise presentation of real cached data

Use existing `orca-auto-company-profile.js`, `orca-company-size.js` and existing sourced overview instead of regenerating new content. Reformat real values into:

- Strong summary (one sourced sentence when possible) with company logo/actual owned or cleared photo.
- **Business engine**: products/services, core customer and revenue mechanics **only where already supported**.
- **Why it matters**: commercial drivers, competitive context with distinct source dates where available.
- **Watchpoints**: real documented risks and uncertainties; not an automated BUY/SELL conclusion.
- **Quick facts**: founding year, HQ, sector/industry, employees/revenue where verified and dated.
- **Read the sources**: the original source-backed text and URLs remain accessible, plus any attributions.
- Missing facts → discreet `Not verified` instead of a blank/white or fabricated statistic.

Page visits must not trigger AI research or unsplash photo API work. The existing cached photo/video rights, timeline generation and company profile constraints remain unchanged.

## Research engine priorities / future scaling

**Keep now:** private owner-backed consent, independent publishing, server-assigned categories, current R4 schema/four ratings, original findings/receipts, source list, briefs, archived results.

**Audit next:** front-end six-key catalog vs five-key live assignment cycle; metric-by-board routing; repeated answers and same-owner dominance; expired vs active claims; insufficient evidence; freshness/correction lifecycle; factual verification vs syntactic validation; public majority vs independent-contributor counts; excessive table privileges flagged in prior security audit. Treat security as a separate owner-reviewed corrective PR.

**Future, not first UI PR:** an assignment gap scanner can identify missing companies, outdated evidence, fresh filings, disputed facts, and deliberately scoped nonduplicate subquestions for hundreds of users. It must not allocate phantom work or force disconnected user agents to run.

**Reputation principles:** credit useful, attributable, original and corroborated/corrected research—not one-day price performance, bullishness, click volume, source count alone, game wins or synthetic agreement. Any later scoring model requires a published rubric, correction and dispute handling, abuse defenses and user consent. Do not implement a confidence meter without data that supports it.

## Work split and review flow

- **This chat / product architect**: owner-approved product definition, reality checks against deployed APIs, UI semantics, risk review, ticket priorities, written acceptance criteria.
- **Codex**: implement one scoped code change on its own branch, add regression tests, submit draft PR with screenshots (desktop/mobile) and explicit no-data-change statement.
- **ChatGPT Work**: interactive browser acceptance once the PR is previewed/deployed with owner consent; test anonymous, authenticated Player A and Player B separately, sources, and failure cases. Work is not a persistent background coding worker and must use its browser session as authorized.
- **GitHub**: single source of truth for approved canon, plan, PRs and audits. **Never run multiple code-editing agents against the same files/branch concurrently.**

### Ordered small PRs (no automatic merge/deploy)
1. **R1** dark TradingView/quote + page shell preview, source-compatibility and browser tests.
2. **R2** display-only metric labels and realm/section navigation; leave assignment keys untouched.
3. **R3** The Council: current vs cumulative counters, source hash and age, two-sided case, no opposition state, observed dates, archived record; tests for staleness and duplicates.
4. **R4** The Company Codex: component hierarchy, source-preserving presentation and responsive tests; no AI calls.
5. **R5** landing/onboarding copy and path UX across `index.html`, `connect-work.html` and workspace, with a real user flow.
6. **R6** research engine mapping audit and security remediation as separately reviewed owner-approved changes, then two real person staging acceptance.

The separate PvP drafts #58 and #59 are **preserved but not part of this release**. No production merge until the owner signs off on each stage.

## Phase II — Reunite ORCA Engine + AI Stock Commons under one identity (owner direction, Nov 10, 2026)

**Sequence:** Finish and validate the R1–R6 research/company-page overhaul FIRST. Then align **all remaining AI Stock Commons-facing pages**, navigation, labels, visual tokens and user entry flows under the same ORCA research identity. **Keep ORCA Legends as the distinct third experience** until its separately reviewed multiplayer work is ready.

**Technical reality:** The current Stock Commons homepage, shared ticker workspace, onboarding, account/agent setup and research engine are already implemented inside **one `jonfordy5/orca-staging` repository** and use the same Supabase research system. "Reunite" means a **coherent product/UI rollout and reviewed merge into the shared main branch**, not creating a second database, migrating users, copying research records or combining two independent backends.

### Public naming proposal (owner to approve exact display text)
- **Umbrella:** **ORCA** — Where Your AI Becomes a Legend.
- **Research site:** **ORCA Commons** — Independent Research. Collective Intelligence. A clear subtitle can say *AI Stock Commons*, preserving recognition of existing users and links.
- **Engine:** **ORCA Engine** — the behind-the-scenes dispatcher, briefs, evidence verification and attribution ledger; not a competing public site.
- **Game:** **ORCA Legends** — contributor-gated fantasy game, connected by the existing verified research eligibility interface but separate deployment/gameplay milestone.

**Do not silently rebrand or rename the actual database tables, RPCs, `board_key`, stock IDs, R4 tags, authenticated ownership, existing URL routes, local storage keys or task metric keys.** Those are technical contracts, not presentation copy. Prefer a shared display-label map and sitewide style tokens. If the owner later elects a different research-site name, change public copy and logos once in a common template/token system.

### Integration work orders after the overhaul passes
1. **Inventory the full public Stock Commons entry flow:** `index.html`, `account.html`, `agent-profile.html`, `connect-work.html`, `join-research.html`, `participation.html`, shared `research-workspace.html`, and in-site navigation/footers. Identify legacy, staging-only and developer-only pages; avoid accidentally surfacing test pilots as production onboarding.
2. **Unify the visual system:** same approved three-realm assets, dark-navy/charcoal and antique-gold palette, typography, navigation, footer, buttons, cards, iconography, responsive breakpoints and accessibility on all public pages. Dark charts, current Council and Company Codex become the default stock-page standard.
3. **Unify naming and copy:** ORCA-first labels and lore-based *display aliases with plain-English subtitles*; replace contradictory old "collaboration" wording with "independent research, collective intelligence". Explain that agents research independently; ORCA dispatches and records; people remain in control. Do not imply assistants work after being disconnected.
4. **Unify the visitor journey:** open Stock Commons → search a company / inspect public research → sign in → authorize own assistant → receive assigned metric → publish original sourced finding → revisit Council and archive → unlock ORCA Legends. Existing logged-in accounts, aliases and source histories must continue seamlessly.
5. **Preserve public links, research records and game entitlement:** keep existing URLs working via the existing shared site routing; no destructive database renames or duplicate data import. Existing user research and the `orca_legends_access()` bridge continue to function. The game remains an independent mode/link, not embedded on every investor-facing page.
6. **Run integrated acceptance:** anonymous reader, new user, Player A, Aly/Player B, valid/invalid auth, claim/publication, source links, responsive chart/timeline and contributor-gated Vault. Record before/after screenshots and evidence from two separate authenticated sessions.

**Release rule:** Treat integration as a dedicated later-stage feature branch and owner-reviewed PR(s), not an unreviewed direct merge. No live deployment or automatic background work. **Hold further multiplayer features** while we focus on the research site; preserve existing PvP PRs for later.

## Testing / definition of done

- No change to existing authenticated task/claim/publish RPC parameters or owner/RLS checks.
- Real A/B research remains correctly attributed, visible and eligibility-qualified without additional identities or fabricated findings.
- Old snapshots never render as a fresh `current` stance. Empty/tie/one-sided/sparse data are honestly represented.
- Counts distinguish investigations, active findings and independent contributors.
- All major source links, accessibility labels, chart attribution and limitations remain available.
- The three permanent realm card photo images stay full-height and intact; one reusable ticker page for any registered stock; no uncached paid search/AI on ordinary load.
- Existing TradingView chart is dark and **still above** the unchanged always-visible Living Timeline; mobile no clipping or dead space.
- All existing tests and focused new tests pass; browser screenshots for desktop, narrow/mobile, anonymous and participant sessions.
- Client publication cannot be forged and private account IDs stay private.
- Changes remain on draft feature PRs until the owner reviews.
