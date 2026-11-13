# ORCA first real AI agent — implementation checkpoint (2026-11-13)

**Branch:** `feat/orca-owned-oauth-fallback-20261112` (draft PR #83).  
**Deployment:** CODE ONLY. No Plan B issuer, MCP endpoint, public login/consent route, database migration, signing secrets, or client is activated. The owner-issued token release switch is OFF. No production changes.

## What is built

- Stages 1–5: verified researcher binding, exact client/callback/resource policy, ES256 resource-bound tokens, revocable private grant registry and encrypted OAuth storage adapter. A real `oidc-provider@9.14.0` authorization-code + PKCE + consent + token exchange succeeds **in an isolated local test with a synthetic Supabase identity and mock persistence**. This is not a real ChatGPT connection.
- Stage 6: `trusted-browser-session.mjs` seals a short-lived existing Supabase session into an HttpOnly, Secure, SameSite, host-only AES-256-GCM cookie. Requires authenticated same-origin HTTPS POST, verified `Auth.getUser`, opted-in owner profile, approved host and proxy/TLS trust. No token is handed to an agent. Key rotation and hostile-input tests pass.
- Stage 7: `interaction-http-routes.mjs` is a **non-listening**, disabled-by-default interaction adapter. It can render a script-free login/consent page with explicit Approve/Deny for `orca:research.read`, strict same-origin form POSTs, bounded bodies, one-use CSRF via the verified existing-controller, and no arbitrary owner/alias input. The private finalizer is server-only. HTTP regression tests pass.
- Stage 8: `mcp-admission-http.mjs` is a **non-listening**, disabled-by-default protected-resource metadata and MCP admission adapter. It rejects missing, wrong-audience, expired or revoked ORCA-issued bearers, enforces exact user/client/current grant, permits only `orca_whoami` and `orca_my_assignment` tool calls, and passes only scoped identity and limited JSON to a future vetted dispatcher. It does not implement a full MCP SDK server or read the database. Regression tests pass.
- Additional local code-flow test examines RFC 9207 `iss` callback consistency instead of assuming eligibility for ChatGPT's stable redirect URI.

## Checkpoint security evidence

- Offline policy, session, consent-HTTP and MCP-admission tests: https://github.com/jonfordy5/orca-staging/actions/runs/43474225489
- Maintained-library local OAuth/PKCE loopback smoke: https://github.com/jonfordy5/orca-staging/actions/runs/43474225446
- The isolated private PostgreSQL schema checks are **not** a live Supabase migration.

## What is still required for a first real agent test

1. Select and securely host real HTTPS issuer and MCP resource endpoints. Publish exact protected-resource and OAuth discovery plus JWKS, and verify callback-mode requirements with the ChatGPT plugin management page. Stable callback requires RFC 9207 issuer identification; otherwise use the actual callback-ID-specific redirect from the management page. Never guess a client ID, callback or domain.
2. Run a maintained OAuth server with real signing key custody/rotation, persistent encrypted provider state and approved ORCA grant registry under an audited least-privilege PostgreSQL role. Review schema and implement controlled migrations, preserving the current website and research data.
3. Provide a real same-origin Supabase sign-in/bootstrap on the issuer host, verify the browser cookie and owner profile at each step, and bind the Stage 7 approval flow to the deployed OAuth runtime. Review cookie size, server-session invalidation and token handling; an opaque server-side session is preferable before public release.
4. Implement and test the actual MCP SDK read-only tool dispatcher using owner-scoped research queries **without forwarding ORCA tokens to Supabase Auth/Data API**. Research publication is out of scope for the first connection test.
5. Independently exercise two distinct real researcher accounts, current grant checks, signed token exchange, negative paths, revoked-token rejection, and no write/RPC bypass. Confirm existing site sign-in, aliases, tasks and published findings are unchanged.

## Next success condition

A real ChatGPT MCP client discovers ORCA staging, signs the human into the correct existing ORCA researcher identity, obtains explicit approval, exchanges PKCE for a resource-bound token, and successfully calls `orca_my_assignment` for that user only. Then revoke access and confirm the same token is denied. No live deployment is claimed until every step is observed.

Do **not** merge or activate Plan B solely because the offline tests pass. PRs #79/#80/#81/#82 remain separate and should not be accidentally merged as a shortcut.

## Stages 9–10 — research database and least-privilege boundary (November 13, 2026)

**CODE ONLY — no deployment, live migration or real account connection.**

- Built `services/orca-owned-oauth/read-only-research-dispatcher.mjs`, implementing `orca_whoami` and `orca_my_assignment` with three static, parameterized SELECT statements against actual ORCA staging tables. The verified OAuth owner is the only owner used in queries; agent-supplied identity is never accepted.
- Unit and composed request tests check two different synthetic owners on the same ticker, signed owner/client/grant isolation, research opt-out, revoked access, unjoined ticker, malformed board and private database failure. No automatic claiming, findings, or publishing.
- Added `services/orca-owned-oauth/verified-owner-read-query.mjs`: an allowlisted query adapter requiring `orca_owned_mcp_reader` current_user, READ ONLY transactions, and transaction-local verified owner context. It rejects service_role, admin and arbitrary SQL and rolls back on failure.
- Added `services/orca-owned-oauth/mcp-reader-rls-review-only.sql`: NOLOGIN, NOBYPASSRLS dedicated role blueprint, minimal column SELECT grants and owner-filtered row policies. **Not migrated.** The custom PostgreSQL owner setting is defense in depth, not independent cryptographic authentication.
- Added `.github/workflows/orca-owned-oauth-reader-policy.yml`: isolated PostgreSQL 17 tests prove two-owner profile/membership/task/board visibility and deny writes. The actual assignment SELECT also compiled under read-only EXPLAIN against the real ORCA staging schema, without executing the SELECT or changing records.

**CI passed at commit 8e103c21:**
- OAuth offline security: https://github.com/jonfordy5/orca-staging/actions/runs/43479621149
- Private PostgreSQL reader RLS: https://github.com/jonfordy5/orca-staging/actions/runs/43479621115
- Standards-library OAuth loopback: https://github.com/jonfordy5/orca-staging/actions/runs/43479621510
- Isolated private schema: https://github.com/jonfordy5/orca-staging/actions/runs/43479621160

**Still required for first live ChatGPT agent test:** audited private role and connection, real Supabase browser session/consent on HTTPS issuer, correctly configured ChatGPT client/callback and signing keys, deployed MCP SDK gateway, real two-account and revocation acceptance. The release gate remains OFF.
