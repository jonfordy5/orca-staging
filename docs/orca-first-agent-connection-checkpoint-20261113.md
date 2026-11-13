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


## Stage 11 — opaque browser sessions and OAuth discovery (November 13, 2026)

**Status: draft code only, OAuth issuer and MCP still disabled and undeployed. No real user credentials or approved client.**

- Replaced the proposed browser-token-in-cookie approach with a new **opaque encrypted server-side session** path (`services/orca-owned-oauth/opaque-browser-session.mjs`). A host-only `__Host-` cookie contains only a random 32-byte handle. The SHA-256 handle digest indexes an AES-256-GCM encrypted server-side record containing the verified existing Supabase bearer, owner ID and a separate browser-session binding. No bearer leaves the issuer in a cookie.
- The bridge requires exact same-origin HTTPS bootstrap, verified Supabase `getUser`, current opted-in owner profile, secure cookie flags, expiration, a private store, authorized decryption key and durable logout revocation. The OAuth interaction controller still verifies the researcher again on each login/consent action.
- Added private PostgreSQL store adapter with fixed, parameterized insert/select/revoke statements and `browser-sessions-review-only.sql` to propose a private RLS table. **This SQL was tested only in ephemeral PostgreSQL; not applied to Supabase staging.** Dedicated least-privileged DB role, credential rotation and live revocation tests remain required.
- Expanded automated session tests for no bearer in cookies, encrypted storage, expiry, tampering, wrong host/origin/TLS, cross-site, account opt-out, database read/write shape, key rotation and confirmed logout revocation.
- Swapped the earlier fixture-signed cookie in `services/orca-owned-oauth/tests/code-flow.test.mjs` for the actual encrypted opaque bridge. The full maintained `oidc-provider@9.14.0` code+PKCE+human-consent+ES256 token+revocation path still runs only with a **synthetic Supabase identity and in-memory storage over loopback**, not a real user or public service.
- Corrected Stage 8 protected resource metadata routing to canonical RFC 9728 well-known path `/.well-known/oauth-protected-resource/<resource-path>`; tests reject the old nonstandard path. Actual HTTPS domain and exact ChatGPT callback/client metadata must be obtained from the management page.

**Verification:**
- Offline OAuth/session tests: https://github.com/jonfordy5/orca-staging/actions/runs/43483473109
- Real-library OAuth code-flow with opaque session: https://github.com/jonfordy5/orca-staging/actions/runs/43483473234
- Ephemeral PostgreSQL private schema (including opaque browser sessions): https://github.com/jonfordy5/orca-staging/actions/runs/43482892661

**What remains before real-agent testing:** choose a vetted HTTPS issuer+MCP host, install and lock the official MCP v2 SDK, deploy the maintained issuer with private signing keys and persistent state, establish dedicated private DB roles, connect real Supabase sign-in and human consent, register the exact ChatGPT client/callback, then run two actual owners and revoke/write-bypass acceptance. The existing OAuth release gate stays OFF.


## Stage 12 — official MCP SDK HTTP boundary (November 13, 2026)

**Code only; not deployed.** Added a real HTTP MCP protocol implementation from the maintained official TypeScript SDK v2.

- Package: `services/orca-owned-oauth/mcp-sdk`, pinning `@modelcontextprotocol/server@2.3.1` and `zod@4.1.12` with a committed resolved `package-lock.json` and `npm ci` in CI.
- `secure-handler.mjs` uses SDK `createMcpHandler` with an isolated per-request `McpServer`, a 16 KiB request cap, schema-validated `orca_whoami` and `orca_my_assignment`, and SDK-managed legacy 2025 stateless compatibility alongside newer protocol support.
- Every MCP POST passes the previously implemented ES256 bearer signature, exact issuer/resource/client, and **fresh durable grant** check BEFORE the SDK creates a server or invokes a tool. The SDK tool callback receives only the verified owner/client/grant identity. No raw OAuth access token is passed into the database.
- SDK tools reuse the existing owner-scoped Stage 9 read dispatcher, backed by the Stage 10 static parameterized SELECT-only SQL adapter (to be provisioned under its dedicated read-only DB role). Both tools have readOnlyHint=true; publishing, claiming and other mutations are not exposed.
- Added official SDK integration tests for OAuth resource metadata, 2025-style initialize and tool listing, two synthetic owners with different assignments, rejected malicious tool names and schema arguments, wrong/absent bearer, and immediate denial of previously issued tokens after grant revocation.
- CI successful with a reproducible clean `npm ci`, no dynamic npm install or drift; test-only synthetic identities and ephemeral ES256 keys. [Official SDK run](https://github.com/jonfordy5/orca-staging/actions/runs/43485762865).

**First real-agent blockers remain:** HTTPS host and exact registered client/callback, live OAuth issuer and fresh grant-checking database role, real Supabase browser account/consent, signing secret custody, deploy of SDK handler behind a trusted HTTPS reverse proxy, and two *real* owner acceptance tests. OAuth activation switch stays OFF. No production or live staging schema changes.


## Stage 12b — official MCP client acceptance (November 13, 2026)

**TESTS ONLY, NOT A REAL CONNECTED ACCOUNT.** Added `@modelcontextprotocol/client@2.3.1` as a pinned dev-only dependency and regenerated/committed the npm lock; CI returned to strict `npm ci`.

- `services/orca-owned-oauth/mcp-sdk/official-client.test.mjs` launches TWO distinct official MCP SDK clients (not hand-built JSON-RPC objects) through a test-only fetch transport into the actual Stage 12 official MCP server handler. The bridge rewrites synthetic loopback URL to a fictional HTTPS resource solely inside the test; no real public service exists.
- The official clients negotiate MCP, list only `orca_whoami` and `orca_my_assignment`, receive their separately owned synthetic research assignments, and confirm revoked consent immediately blocks any additional reads.
- Tests reuse ephemeral ES256 signing keys and synthetic researcher IDs. Neither a real ChatGPT client, actual Supabase Auth user session, genuine consent, nor live staging DB is involved.
- Official client/server integration with temporary resolved lock: https://github.com/jonfordy5/orca-staging/actions/runs/43486435877 (PASS). Final clean-lock CI remains required after this checkpoint update.

**First real connection remains gated:** real HTTPS issuer and MCP host, audit-ready private DB role/schema and secret custody, verified Supabase login/consent, vetted ChatGPT callback/client, live two-owner isolation and revoke tests, and existing-site acceptance. No live OAuth enablement or data mutations.
