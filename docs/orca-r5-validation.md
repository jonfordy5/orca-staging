# ORCA R5 — Unite ORCA Commons (Homepage, navigation & contributor journey)

**Status:** Staging implementation of the public umbrella identity. Tracked by [Issue #60](https://github.com/jonfordy5/orca-staging/issues/60). ORCA Engine remains the actual assignment and persistence backend. ORCA Legends remains the separately contributor-gated experience. This is a visual and route unification, not a database merge or migration.

## Identity & navigation
- **ORCA Commons** — public-facing research site; **AI Stock Commons** remains visible as its origin/subtitle in the wordmark, homepage and metadata. No application/data/schema filenames or technical contract names were renamed.
- **ORCA Engine** — same server-owned task dispatcher, assignment, permissions and source-backed publication storage as before.
- **ORCA Legends** — access-gated separate game prototype, linked as a next chapter. No assertion of two-player capability, stock-game scoring, direct agent execution or brokerage support.

Unified four-link nav: Discover; Research Realms; How It Works; My Account. It is shared across `index.html`, `research-workspace.html`, `account.html`, `agent-profile.html`, `join-research.html`, `connect-work.html`, and `participation.html`. Existing `id` selectors and stock-specific account back links are preserved. Individual auth/permissions/claim/publish scripts are untouched.

## Page experience
- A premium dark navy/gold ORCA Commons landing page with hero, the **original approved** King's Keep illustration, a prominent **actual working stock search**, all three approved realm illustrations with links to the existing shared Rocket Lab workspace, the real owner-controlled four-stage research journey, and an honest invitation to the eligibility-gated Legends game.
- The homepage uses existing `mountStockSearch` and `orcaStagingHref` (no duplicate ticker directory or new API). Corrected its direct `?ticker=...` shortcut to read the actual `registered` field returned by `mountStockSearch`, not a nonexistent `supported` array.
- `orca-commons-theme.css` gives research/account/agent/team/permissions/Work entry pages one navy/gold header, responsive navigation and compatible form-page surfaces. `orca-commons-home.css` owns the public home art, search and responsive marketing sections. The shared research chart, Council, Company Codex, realm photography and Living Timeline CSS retain their existing geometry.
- Existing sign-in/agent-profile static copy that incorrectly said research participation was entirely unavailable is now accurate: sign-in **does not** authorize or connect an AI; team membership, consent, and independent-publishing permissions remain separate.

## Functional boundaries
- No Supabase SQL or schema changes, no RLS/permission changes, no new AI calls, no paid images, no account creation or claim/write actions performed by R5, and no change to existing research sources or publication records.
- Preserve the original Supabase auth/owner browser session, role checks, server-assigned board keys, and research metric contract. New homepage page views must be free of paid AI calls.
- Existing `research-workspace-staging.html` redirect is still the canonical stock entrance; `orca-stock-search.js` still protects stock registration by requiring an owner session.
- Existing photo assets are `assets/orca-world-{management,earnings,positioning}.webp` with accessible alt and lazy loading as appropriate. Avoid new source/license assumptions.

## Acceptance
- **CI:** `node scripts/check-shared-research-workspace.cjs` and all existing mobile/photo/market/chart, Council, Company Codex, publication/auth and Legends tests remain mandatory.
- **New browser acceptance:** `scripts/test-orca-commons-r5-browser.cjs` loads the real homepage with synthetic read-only Supabase stock listings, verifies 3 approved realm images, the four-step journey, accessible responsive 1440/393/320px layout, nav on all six other pages, preserved auth form IDs, registered ticker search navigation, and the fixed `?ticker=RKLB` redirect. It deliberately avoids private sign-in or publishing.
- **Live site review:** open staging homepage, search for RKLB or NVDA, follow into shared research page, then test account and Work entry routes. Only a real owner session can verify authenticated role and eligibility checks; offline browser tests do not establish this. Owner acceptance is a visual check on live staging, not a GitHub code review.

No part of the old published research or multiplayer prototype was removed. A later multiplayer integration is an independent explicit project phase.
