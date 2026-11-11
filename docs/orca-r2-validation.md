# ORCA R2 — Legends metric names: implementation and review

**Scope:** Display-only research aliases in the shared ticker workspace. This is the second small change in [ORCA Restructure v1](./orca-restructure-v1.md), tracked by [Issue #60](https://github.com/jonfordy5/orca-staging/issues/60). The plan is in draft PR #61; do not merge that separately without owner review.

## Labels

| Original public/server name | Legends title |
| --- | --- |
| SEC Filings & Catalysts | Royal Decrees |
| News & Market Sentiment | War Drums |
| Fundamentals & Valuation | The Ledger |
| Technical Analysis | Battle Map |
| Volume & Market Positioning / Volume | Troop Movements |
| Options / Options Activity | Signal Fires |

All themed metric titles retain the **original name as a readable subtitle**. Unknown/server-new metrics display their unaltered original name. Naming is implemented once in `orca-metric-labels.js`. The title is presentation-only: it is **never sent to a publication RPC, task claim, finding record, evidence packet or board/category selection**. Options is merely a display label if existing work uses that metric; the feature does not assert the live assignment scheduler serves it.

## Updated public surfaces

- The approved three permanent realm photos/headers remain **The King's Keep (Management)**, **The Vault (Earnings)**, and **The Frontier (Positioning)**. They are still uncropped and retain the exact existing image assets and existing adjacent findings layout.
- Current finding cards, historical findings, research metric accordion, researcher activity strip and outlook citation links show the themed display label with the authentic metric and contributor.
- Active task display and claim status show the label but retain the canonical task ID, assigned board key, deadline, actual question and ratings.
- The hidden legacy metric selector shows display aliases, while its values and server task catalog remain unchanged.
- The existing public quick navigation uses **Research Realms**. No page geometry, charts, timeline, supplier or game changes.

## Authority boundaries

Do **not** change `researchCategories[].metrics[].key` or `area`, `metricForTask()`, `researchCategory()`, `researchPillar()`, `ratingMeta()`, the board select `#research-question` option values, `orca_request_and_claim_next` arguments, assignment brief packet or `commons_publish_*` arguments. The actual owner's assigned `board_key` is authoritative even where a public metric is associated with a different realm in someone's proposed taxonomy.

The frontend's six catalog keys and live five-metric server rotation remain distinct; no schema or scheduling change in R2. Research/publication data are untouched; all existing source links, timestamps, cached research and R4 ratings remain accessible.

## Test plan

- `node --test scripts/test-orca-metric-labels.mjs`: all public aliases, original subtitles, unknown fallback, six immutable catalog metric keys/areas, actual DOM label helper, unchanged approved realm and chart/timeline markers.
- `node --test scripts/test-research-publication-confirmation.cjs`: preserve prior R4 publication receipt and same-task board/rating selection behavior; presentation labels are stubbed only in this isolated original receipt fixture.
- `node scripts/check-shared-research-workspace.cjs`: existing locked photo/timeline, six catalog and dark chart regression assertions.
- GitHub shared-workspace CI runs all of the above and original mobile/layout/browser/games tests.

A live signed-in session and desktop/mobile visual acceptance are **not** implied by the tests. No preview deployment, Supabase changes, or publication were performed by this PR. Leave as draft until approved.
