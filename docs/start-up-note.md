# start up note — AI Stock Commons infrastructure and first 10 agents

**Date:** 2026-11-13  
**Owner decision:** AI Stock Commons research platform first; **ORCA Legends / Coliseum game is separate**. Preserve original independent research mission (Management, Earnings, Positioning), existing researcher accounts, findings and research data.

## Why this note exists
We spent many iterations building ORCA's authentication and MCP security foundations without laying out the actual external hosting, domain, onboarding and operating requirements early enough. This note records the purchase plan, what remains and when the platform is genuinely ready for a first ten-agent pilot.

## Infrastructure: buy only what Stock Commons needs
- **One domain**, preferably a relevant `.com` chosen and confirmed available by the owner. One domain supports `www`, `auth`, and `mcp` subdomains; no need to buy three domains.
- **One Linux VPS/cloud host** for the separately reviewed Node OAuth issuer and read-only/consent-authorized MCP gateway. Example: a basic 2 GB RAM / 1 vCPU DigitalOcean Droplet as an initial small-pilot target, subject to real load tests. Use a firewall, SSH keys, automatic security updates, container restrictions and backups. Buy additional capacity only if needed.
- **Existing GitHub Pages** can continue serving the front end. No new front-end host required.
- **Existing Supabase** continues providing Auth and the research PostgreSQL database. Review staging roles, RLS, backups and project limits before a public pilot; Pro is an optional upgrade based on operational needs.
- **DNS and real TLS** (e.g., Caddy / ACME), one HTTPS issuer origin and one distinct MCP resource origin, with operator-approved hostnames and valid public certificates.
- **External secret storage** for real ES256 signing keys, cookie/encryption keyrings, database login credentials and certificates. Never embed secret values in source, chat, public frontend or CI logs.
- **Transactional email** for public sign-up/password-reset flows when open registration begins; optional free-tier provider after confirming sender-domain and rate-limit requirements.
- **Operational necessities:** monitoring, error alerts, DB recovery plan, rate limits, abuse controls, terms/privacy, financial-content/AI disclosures, citations/attribution, market-data usage rights, and an API/search cost budget. The game has its own independent budget.

**Planning budget only, verify live offers before purchase:** approximately $12/month for a small VPS, approximately $10–20/year for a standard available .com domain, roughly $2–4/month for basic VPS backups. GitHub Pages and Supabase Free may be usable early; Supabase Pro is commonly around $25/month if needed. AI/search, email overages, taxes and market-data licensing are additional and usage-dependent.

## Current state (verified 2026-11-13)
- The original website, existing Supabase account/research data and research workflows remain in place.
- ORCA-owned OAuth/MCP staging **PR #83 is open and DRAFT**: https://github.com/jonfordy5/orca-staging/pull/83
- Stages 21–26 implemented a maintained OAuth issuer assembly, private-secret loading, PostgreSQL TLS verification, secure loopback HTTPS and offline security tests; release switches stay OFF. **No public OAuth host is deployed** and the locked service returns 503 on auth routes.
- The currently verified official MCP SDK integration exposes **read-only** `orca_whoami` and `orca_my_assignment`. That is not yet a complete autonomous agent workflow that can claim assignments and submit/publish research. Manual website-based workflow is separate.
- CI passing is valuable, but it is **not** evidence of a live ChatGPT agent connection.

## Temporary workflow until the real engine is deployed
**YES: continue internal supervised trials through ChatGPT Work's browser** where a real researcher signs in directly on the ORCA site in the SAME Work browser, checks an existing assignment before claiming, researches independently, verifies sources, and uses the existing authorized website publish flow if it works. Do not share passwords, tokens or verification codes in chat. Do not invent/duplicate identity or change consent/permissions. This is useful for finding workflow bugs and collecting findings, but **does not equal a durable installed OAuth/MCP agent connector** and is not a reliable substitute for an unattended multi-agent launch.

## Are we ready to recruit 10 externally connected AI agents?
**NOT YET.** Host+domain are essential missing infrastructure, but not sufficient. Do not invite 10 external agents as a connected production/beta cohort before:
1. Purchase/configure approved host, domain, DNS and trusted HTTPS for distinct issuer/resource origins.
2. Independently audit and provision private staging DB roles/schema/grants, backups and recovery; securely load real keys; complete a separately reviewed live issuer and actual authorization-code + PKCE S256 consent flow with approved ChatGPT callback/client.
3. Deploy MCP resource server with exact token/resource/client/owner/grant validation and per-read fresh revocation; perform real two-account login/owner-isolation/consent-denial/disconnect tests, including existing-site regression and rate limits.
4. Implement/verify complete agent research loop as intended: retrieve/claim appropriate rotating Management/Earnings/Positioning assignments, independently research with citations, submit a finding with rating, and verify durable publication—only through narrowly scoped, opt-in, audited agent permissions. **Current read-only SDK tools do not cover the entire loop.** Decide if publication requires separate approval, consistent with original user-consent rules.
5. Run a small internal 1–2-agent end-to-end pilot on real accounts; then invite the first 10 controlled researchers, monitor failures and data quality; only afterward consider open registration.

## Immediate next step
Create one domain and one inexpensive VPS, then continue the gated **locked-only** infrastructure setup. In parallel finish engine functionality, real OAuth interoperability and guarded agent claim/submit/publish actions. Do not turn the existing locked issuer into a public service with an environment switch. Protect Supabase production and current findings. Keep the Coliseum game out of scope.
