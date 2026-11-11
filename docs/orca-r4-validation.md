# ORCA R4 — The Company Codex

**Implementation:** Single shared company renderer in `orca-auto-company-profile.js`, the curated Rocket Lab input in `orca-company-profile.js`, and scoped CSS/header in `research-workspace.html`. Tracking [Issue #60](https://github.com/jonfordy5/orca-staging/issues/60).

## New user-facing presentation
- A dark navy / antique-gold **The Company Codex** masthead matching ORCA R1–R3.
- Company name and original source-attributed summary above an at-a-glance strip (industry, headquarters, founded and ticker listing only if supplied).
- Four concise intelligence panels: **How the business makes money**, **Strengths & advantages**, **What investors watch**, and **Risks & unknowns**.
- Verified company image led area when a source URL and photograph are already available, with original photo link, credit and attribution. If a photo is missing, a distinctly labeled abstract ticker design fills the visual space; it is **not** presented as a genuine photo.
- Logo, logo attribution when applicable, dated company metrics and original source links preserved.
- An accessible expandable **full company dossier** retains the previous mission, core company facts, complete business lines and `Company size and impact` including original periods and per-item source links.
- Persistent footer **Sources & verification**, with source links that open original HTTPS references in a safe new tab.

## Important integrity boundaries
- The four cards **never automatically invent** a competitive moat, advantage, catalyst, specific risk or revenue figure. Missing claims display a clearly stated verification limitation. Business revenue prose uses the already available operating explanation; if it is unavailable, the original 'not yet sourced' copy remains.
- Rocket Lab capabilities/risks are cautious paraphrases of preexisting sourced Launch Services, Space Systems, Neutron execution uncertainties and investor-focus content. They are linked to the same preexisting company filings.
- General/automated company profiles do **not** get stock-specific strengths/risks or revenue invented from ticker symbols.
- Existing automatic profile generation and existing calls are unchanged. R4 adds **no** AI, external photo, Supabase, market data or other API request.
- No schema/RPC/claim/publication/auth change. Existing original realm artwork, dark TradingView, Council, full chart and Living Timeline untouched. No alternate profile pages or new logo provider.

## Regression acceptance
- `scripts/test-orca-company-codex-browser.cjs` mounts the **real shared renderer and CSS** in isolated Chromium at 1440px, 393px, 320px. It checks the photo/source attribution, all four cards, summary, full dossier, metric period/source, HTTPS-only links, unknown/empty profile fallback, one-render-only behavior, and no horizontal overflow.
- All existing shared workspace, company headline, timeline and research publication test suites stay in GitHub CI.
- **Staging acceptance:** open the real RKLB and NVDA shared workspace. Review desktop and mobile text, logo/photography, source links and 'Open full company dossier'. The preview/test uses local synthetic fixtures and cannot replace a signed-in user session inspection.

The owner should judge the live staging result, not the GitHub patch. If CI is green and scope remains intact, merge and deploy staging without editing production or Supabase.
