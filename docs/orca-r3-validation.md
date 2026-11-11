# ORCA R3 — The Council: evidence-first outlook
**Scope:** Shared stock workspace UI and a pure, read-only evidence selector. No Supabase changes, claims, publishing, identity logic, market data subscriptions, source generation, game or company timeline changes. Tracked by [#60](https://github.com/jonfordy5/orca-staging/issues/60).

## What changed
- The stock page's former Market Price & AI Research Outlook is now **The Council**, a dark navy and antique-gold intelligence room. TradingView's existing dark quote remains as independent market context.
- **Champion thesis / Challenger thesis** show the strongest *current side by number of recent findings* and a representative, **latest observed** Bull/Bear argument. These are not actual independent-owner or investment conviction rankings. If split, the cards say contested; when one side lacks recent reports it is explicitly absent.
- Each current side displays the reporter's original rating/metric, their own source-backed report text, evidence observed/published dates, directly linked sources, and stored limitations. Additional recent findings are expandable.
- **Latest source-backed current findings** are derived from the already retrieved bounded R4 records, not all-round cumulative counters. They require valid four-level direction, a real evidence/publication timestamp not in the future, syntactically valid HTTP(S) source URL, no passed server expiry, and a configurable metric-specific observation window. The simple defaults are 3 days for news/market activity/technical, 14 days for SEC filings, 30 days for fundamentals. Unknown submetrics remain archived until reviewed rather than silently giving fresh status.
- Only the newest currently eligible finding per **public display alias + metric** is counted in this bounded frontend view. Aliases are not proof of unique human or AI ownership; therefore the UI never calls the count independent people or a market consensus. Actual verified ownership stays with existing backend/receipts.
- The **Historical Record** (closed by default) separately lists the server's cumulative count of published research searches, sampled superseded/old reports, and any older cached majority narratives with a clear historical label. Cached summaries cannot masquerade as the current Council judgment, even if the source-hash cache is still marked current for the cumulative dataset.
- No automatic AI synthesis, new sources, paid API calls, invented bear/bull counterarguments, invented catalysts or inferred stock price explanations. Next catalyst is honestly "not established" until a structured original source is available; new research remains user-owned, opted-in and assigned.

## Truth and scope limitations
- The public query loads the most recent **100** R4 records. The current live Council counts and historical preview are a **bounded sample**, not all public published research. All-time total is identified separately and sourced from the existing cumulative status RPC.
- Current evidence means *recently dated, source-linked submitted research*, not independently verified factual accuracy. The UI says this.
- There is no public contributor owner ID in this read query; alias grouping could merge two different accounts using the same alias, and one person can have multiple metrics. Do not claim exact independent contributor totals.
- Publication doesn't presently include a structured "next catalyst" or "invalidation condition" field in the R4 finding receipt. The UI shows submitted `limitations` and declines to invent precision.
- The server R4 board assignment, expiry and account ownership remain authoritative for actual publishing. This frontend classifier checks the R4 tag and source/dates only and **is not a replacement backend validation**.

## Regression
- `node --test scripts/test-orca-council.mjs`: separate fresh/history, direction, one-sided, duplicate aliases, stale and future evidence, expiry, sources, unmapped metrics, no mutation of stored finding.
- `scripts/test-orca-council-browser.cjs`: actual Council HTML/CSS and renderer with isolated local fixtures (no backend), desktop 1440px and phone 393px/320px, champion/challenger/empty cases, source URLs, old summary history, no stale text in live cases and no horizontal overflow. Explicitly does **not** impersonate actual signed-in owners.
- Existing research publication confirmation, metric-name, shared-photo/timeline, market widget and game browser checks remain in the same CI workflow.

## Approval
Merge/deploy to staging only if required tests pass and no unrelated changes. Test actual RKLB and NVDA via shared `research-workspace.html?ticker=...` after deployment. Keep the stock's original source-backed reports and legend portrait cards intact. Owner judges the appearance on the live staging site, without having to inspect source code.
