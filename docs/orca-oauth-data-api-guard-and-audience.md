# ORCA OAuth — read-only Data API gate and audience hook

**Current status: STAGING GLOBAL POSTGREST FILTER ACTIVE; OAUTH STILL DISABLED.** The owner separately approved the global filter activation on November 12, 2026. Only **Orca-staging** (`vbziibatnejoswsdggga`) was changed; production (`hsgfwsghxdcgpjlekfqf`) was not touched. The exact API filter is active as `authenticator`'s `pgrst.db_pre_request`; zero OAuth clients are approved; no OAuth server, token audience hook, or MCP function has been enabled/deployed. This PR remains **draft and unmerged**. The six-browser-Edge-function OAuth safeguards are in separate draft PR #81 and remain **undeployed**.

## Global PostgREST activation receipt — November 12, 2026

- **Owner approval:** Explicit approval to activate the global PostgREST security filter in **Orca-staging only**, keeping OAuth disabled and production untouched.
- **Activation script:** Exact reviewed `sql/orca_oauth_activate_postgrest_hook_staging.sql` GitHub blob SHA `b939fdabc20abd0c98bb851018208d0d0076021f`; project preflight confirmed healthy status, seven restrictive policies, installed guard, zero approved clients, no previous global hook, and original data counts.
- **Activated:** `ALTER ROLE authenticator SET pgrst.db_pre_request = 'orca_mcp_private.enforce_readonly_oauth_data_api'` followed by `NOTIFY pgrst, 'reload config'`. SQL returned no error; independent follow-up query found the exact active setting.
- **Real staging HTTP smoke:** [GitHub Actions #43329337017](https://github.com/jonfordy5/orca-staging/actions/runs/43329337017) passed GETs for publicly readable `stocks` and `commons_research_findings` endpoints through the actual hosted staging API using only its pre-existing **public publishable key**. Both returned HTTP 200 and JSON arrays. No researcher JWTs, passwords, task claims, publishing calls, write requests or production endpoints were used.
- **Important service-role compatibility correction:** A post-activation SQL privilege check found `service_role` initially lacked `USAGE` on the private schema and `EXECUTE` on the pre-request function. These privileges are necessary so existing ORCA server-side PostgREST operations do not break. Applied exactly two **narrow grants** on Orca-staging to `service_role`, no table-data grants: `GRANT USAGE ON SCHEMA orca_mcp_private TO service_role` and `GRANT EXECUTE ON FUNCTION orca_mcp_private.enforce_readonly_oauth_data_api() TO service_role`. A direct SQL `SET LOCAL ROLE service_role` invocation then passed. The candidate guard SQL and activation preflight in PR #80 were updated to include/test this requirement.
- **Revised real HTTP regression suite:** [GitHub Actions #43329767599](https://github.com/jonfordy5/orca-staging/actions/runs/43329767599) passed **18 CI steps** testing approved read paths, OAuth denials, ordinary browser publishing, and `service_role` publishing through a real **isolated** PostgREST server, plus activation/rollback. This is not a real user-token acceptance test.
- **State after activation and correction:** 17 stocks, 3 researcher profiles, 9 memberships, 50 research tasks, 29 published findings, **zero approved OAuth clients**, no custom token hook. No research records modified, OAuth connection still off.
- **Remaining acceptance:** A real, already signed-in browser session must recheck profile/team/assignment through the existing `agent-connection-check.html` page. No claim that both users' browser workflows were newly verified after this global activation; no end-to-end OAuth link, audience issuance, revocation, or direct bearer bypass test has been done.
- **Rollback ready but not used:** `sql/orca_oauth_deactivate_postgrest_hook_staging.sql` matches the exact ORCA setting before resetting it, then reloads PostgREST. A user-reported browser failure should trigger rollback/incident triage before OAuth moves forward.

## Orca-staging installation receipt — November 12, 2026

- **Explicit user approval:** Install PR #80's database protections in **Orca-staging**, while keeping OAuth disabled and production unchanged.
- **Project:** `Orca-staging` / `vbziibatnejoswsdggga`. **Not** `AI Stock Commons` / `hsgfwsghxdcgpjlekfqf`.
- **Source:** exact reviewed GitHub `sql/orca_oauth_readonly_data_api_guard.sql` blob SHA `d82ece57fa3619fc3f532e7c72939f558aa7d687`; no extra role/activation command was appended.
- **Staging migration:** `20261112225051_orca_oauth_readonly_data_api_guard_stage_20261112`, applied successfully.
- **Created:** private `orca_mcp_private` schema, a zero-row `approved_readonly_clients` registry with RLS, a dormant `enforce_readonly_oauth_data_api()` function, and seven restrictive OAuth-only policies on `agent_profiles` and `stock_research_memberships`.
- **Not installed:** `issue_orca_mcp_audience(jsonb)` token-hook candidate. **Not activated:** any `pgrst.db_pre_request` role setting, Supabase OAuth Server, or connected MCP function/client. The global Data API request filter remains dormant; read/write policies are enforced by Postgres RLS immediately.
- **Data count pre/post:** 17 registered stocks, 3 agent profiles, 9 research-team memberships, 50 research tasks, 29 published findings. Counts unchanged.
- **Installed-policy verification:** seven policies in `pg_policies`, all **RESTRICTIVE** / `authenticated`; registry zero approved clients; no token hook / no global pre-request role setting.
- **Live SQL-session verification (no user data changes):**
  - Normal browser-style JWT (no OAuth `client_id`) passes the dormant guard and sees the original research-team listing.
  - Unknown OAuth `client_id` is rejected by direct invocation of the installed guard.
  - Synthetic OAuth JWT with an existing researcher's UUID (kept inside the database, never exposed) sees **only their own membership rows** under the new RLS policy.
  - All tests used transactional context and `ROLLBACK` without changing researcher data.
- **Security advisor:** original categories remain: RLS-enabled/no-policy informational notices and warnings about existing callable security-definer functions and leaked-password protection. They require separate attention; not evidence that the entire system has passed security review.

**Limits:** These tests verify installed SQL function/policy behavior—not live OAuth authorization-code/PKCE, an actual resource-bound JWT, or the Data API pre-request integration (deliberately inactive). GraphQL, Storage, Realtime, and independently deployed Edge Functions still require separate review. Existing ORCA user sessions have not been used for live write tests.

## Problem solved in code

OpenAI's chat agents must use OAuth tokens bound to the intended MCP server. Supabase OAuth issues ordinary authenticated JWTs, and those can call Supabase's Data API **directly**, bypassing any read-only MCP tool menu. OAuth scopes don't grant/deny table or RPC operations; the database must enforce these.

Read-only staging audit as of November 12 found:
- 19 callable public functions for authenticated users, 14 `SECURITY DEFINER`.
- 2 directly writable public tables: `agent_profiles` (DELETE), `stock_research_memberships` (INSERT and DELETE).
- `commons_my_claim(ticker)` and `orca_my_assigned_board(task_id)` are genuinely read-only and owner-bound despite currently marked VOLATILE.
- 26 public tables use RLS; `stock_research_memberships` currently lets all authenticated website users view each other's team membership.
- No existing `pgrst.db_pre_request` role setting for `authenticator`.

## New code (not activated)

### 1. `sql/orca_oauth_readonly_data_api_guard.sql`

Introduces a private `orca_mcp_private.approved_readonly_clients` registry, initially empty and disabled by default, and a private `orca_mcp_private.enforce_readonly_oauth_data_api()` function.

The proposed PostgREST pre-request hook:
- Leaves all **ordinary ORCA browser JWTs with no OAuth `client_id`** untouched, including current sign-in, research claims and publications.
- For OAuth JWTs, requires a previously approved `client_id`, exact Orca-staging `iss`, and the exact **MCP resource audience**.
- Allows only GET/HEAD to `/agent_profiles` or `/stock_research_memberships`, and POST to two **read-only, owner-bound** RPCs: `/rpc/commons_my_claim` and `/rpc/orca_my_assigned_board`.
- Blocks all other routes, tables, RPCs, methods, method override headers and alternative-schema headers.
- Avoids using any user-editable `user_metadata` value for authorization.

It also adds **RESTRICTIVE RLS policies**: OAuth users can SELECT only **their own** stock-team membership and cannot directly INSERT, UPDATE, or DELETE on either `agent_profiles` or `stock_research_memberships`, including through non-PostgREST routes such as GraphQL. Ordinary ORCA browser sessions retain their existing profile/team permissions.

**The hook function is installed in Orca-staging, but the global PostgREST pre-request hook is NOT active.** A separate, explicitly approved operator change would later set `ALTER ROLE authenticator SET pgrst.db_pre_request='orca_mcp_private.enforce_readonly_oauth_data_api'` and `NOTIFY pgrst,'reload config'`. The current branch deliberately contains no live activation command.

### 2. `sql/orca_oauth_mcp_audience_hook_candidate.sql`

Creates (but does not register) a native **Supabase Auth Custom Access Token Hook** in the private schema. The function:
- Is executable only by `supabase_auth_admin` and reads the approved-client registry as SECURITY DEFINER with locked search path.
- Leaves **ordinary browser** claims entirely unchanged.
- Rejects OAuth token issuance for unapproved `client_id`.
- Sets only the OAuth JWT `aud` for an approved MCP client to ORCA's exact staging MCP resource URL; preserves `sub`, `role`, `session_id`, and the other claims.

This is a *candidate workaround* for resource-specific audiences, not proof that Supabase Auth forwards/echoes RFC 8707 `resource` in its authorization and token exchanges. **The real ChatGPT OAuth handshake must prove standards compatibility**. Supabase can have only one configured custom-access-token hook per project, so inspect/merge any existing hook before changing that project-wide Auth setting.

### 3. Isolated PostgreSQL regression suite

- `scripts/fixtures/orca_oauth_gateway_pg_fixture.sql` creates temporary substitute database roles, Auth claims functions, and two fake RKLB memberships.
- `scripts/fixtures/orca_oauth_gateway_pg_tests.sql` checks browser preservation, OAuth deny-by-default, four allowed read patterns, denied claim/publish/profile/team mutations, unregistered clients, absent/wrong audience, wrong issuer, alternate schema, malformed headers and owner-isolated team visibility.
- `scripts/fixtures/orca_oauth_mcp_audience_hook_pg_tests.sql` validates audience rewrite, preservation of normal browser JWTs, unapproved OAuth denial, and the exact Auth-admin execute privilege.
- `.github/workflows/orca-oauth-readonly-gateway.yml` runs everything against a fresh **PostgreSQL 16 GitHub Actions service**, not ORCA staging or production. No Supabase secrets, human accounts, database dumps or user data are used.

**Latest evidence:** GitHub Actions isolated Postgres run [#43321663506](https://github.com/jonfordy5/orca-staging/actions/runs/43321663506) passed all steps after correcting an ambiguous hook variable. This tests SQL policy decisions and RLS in standalone Postgres; **it does not prove that a live Supabase gateway is configured**, that Storage or Realtime is protected, or that an actual OAuth code/token exchange works.



## Cross-API RLS defense and its limits

A subsequent read-only staging audit found **no currently configured RLS policies in the `storage` schema** (Storage tables have RLS enabled, but authenticated roles have base grants). This does not itself establish a usable Storage write path; services have additional checks and policies, so real signed-in negative testing is still needed. The exposed `graphql_public.graphql` function is executable by authenticated users and does not use the PostgREST pre-request hook.

For that reason, the proposal now has six additional **RESTRICTIVE** OAuth DML policies on the two directly writable `public` tables. These are independent of the PostgREST pre-request hook; they prevent a bearer carrying top-level `client_id` from changing those tables even through GraphQL or a future service that applies RLS. The isolated test suite verifies both OAuth DML denial **and** unchanged normal browser profile edits and team join/leave rights.

The policies **do not by themselves secure `SECURITY DEFINER` RPCs**, because those may bypass RLS. The central pre-request block is still required for Data API RPCs, and any other callable non-PostgREST definer endpoint needs its own review.

## Real PostgREST HTTP and reversible-activation rehearsal (Nov 12)

Additional tests were run against a real, **isolated** PostgREST v14.18 server backed by fake PostgreSQL 16 accounts, fake JWT signatures, and mock claim/publish RPCs:

- [GitHub Actions HTTP gate #43325817535](https://github.com/jonfordy5/orca-staging/actions/runs/43325817535) — passed. A synthetic browser token kept both team-member reads and its publishing RPC; an allowlisted OAuth token could read only its own member row and profile and call only the two safe read RPCs. OAuth mutation RPCs, direct profile/team updates, unapproved clients, wrong audiences, unrelated tables and method-override requests were rejected. The test verified no unwanted fake writes.
- [GitHub Actions activation/rollback #43326652194](https://github.com/jonfordy5/orca-staging/actions/runs/43326652194) — passed. The activation script **refused** to run while the synthetic approved-client registry was nonempty. The isolated test then removed only the fake client, activated the PostgREST setting, verified its exact value, reset the setting using the matching rollback script, and verified no leftover setting.
- `sql/orca_oauth_activate_postgrest_hook_staging.sql` — **code-only, not executed on staging**. Requires zero approved clients, all seven restrictive policies, an installed guard, and no existing global hook; then sets `authenticator`'s `pgrst.db_pre_request` and notifies PostgREST. It must never be run against production.
- `sql/orca_oauth_deactivate_postgrest_hook_staging.sql` — **code-only, not executed on staging**. Resets the global PostgREST hook only if its current value matches the expected ORCA function. It does not delete database objects or research records.

At the time of these **earlier isolated** tests, the live staging global hook remained inactive. It was subsequently activated with separate user approval (see the receipt above). Isolated regression tests are still not proof of a real Supabase Auth OAuth JWT or ChatGPT's authorization flow.

## Additional OAuth bearer bypass gate: existing Edge Functions

A read-only inspection of the 12 deployed Orca-staging Edge Functions found existing functions which authenticate a user via Supabase Auth and then perform privileged server-side operations using a service-role client. Examples: `orca-majority-synthesis`, `orca-timeline-discovery`, `orca-timeline-photo-fill`, and `orca-auto-ai-profile`. Their source confirms user authentication checks but did not show a separate OAuth `client_id` check in those paths.

**This is a release blocker, not proof of an existing exploit**: once an OAuth token exists, those independent Edge Function routes could accept it as a normal user token and perform operations that our read-only Data API guard would have rejected. The HTTP pre-request function is not invoked for arbitrary Edge Functions.

Before OAuth linking is enabled, the scope and authorization of each independently deployed Edge Function must be reviewed. Any browser-only write/generation endpoint should **reject linked OAuth client tokens after authenticating them**, unless a separate explicit OAuth scope and server-side policy authorizes that function. Do not rely on CORS/Origin headers as an authorization boundary. Do not deploy modifications to existing Edge Functions without separate testing and approval.

## What we must do before public account linking

1. **Separate owner approval for staging SQL deployment**. Take a security baseline, verify today's pre-request settings and RLS policies, snapshot existing Auth hook configuration. Never target project `hsgfwsghxdcgpjlekfqf` (production).
2. Install the policy/helper in staging **without activating the global PostgREST hook**, then verify new objects and their default-deny registry, with read-only checks. Do not change any user record.
3. Review and test any existing **Custom Access Token Hook** before registering this one. The first-choice compatibility path should be a native Supabase Auth OAuth server that forwards RFC 8707 resource; only use a reviewed audience hook if it genuinely produces valid tokens and preserves existing browser sessions.
4. Test all OAuth write bypasses with an approved **real test client**, including direct RPC to `orca_request_and_claim_next`, `commons_publish_finding`, `commons_set_my_research_consent`, and direct table DELETE/INSERT. The pre-request hook must reject them before execution. Test ordinary website claims/publishing still work.
5. Audit other product APIs separately: **the PostgREST hook does not protect Supabase Storage, Realtime, GraphQL or independent Edge Functions**. Don't infer all-product isolation from the Data API tests. Confirm no other OAuth token route can alter protected research records.
6. Verify the staging signing algorithm is asymmetric, OAuth discovery + PKCE, provider `resource` echo, correct audience, and the exact OpenAI callback. The OAuth server remains **disabled** until the gates pass.
7. Only after two actual owner accounts pass OAuth connecting, revocation, error/expiry behavior and cross-account tests should we expose **Connect Your AI** (and true Pause/Disconnect) on the ORCA website.
8. Claim/publish MCP tools are a *later separately scoped feature*. The initial OAuth connection remains read-only.

## Current safe stopping point

The staging global `pgrst.db_pre_request` filter **is now active**. No OAuth clients are registered or approved, and the optional Auth audience hook and MCP OAuth server remain **inactive**. The public staging REST smoke test passed; real signed-in browser acceptance is outstanding. **Do not activate the OAuth server, audience hook, or read-only MCP client linkage until remaining direct Edge/GraphQL bypass tests and genuine browser account checks are complete.**

## Rollback planning

A rollback for the newly installed staging protections (if an existing browser flow breaks) would remove only the seven added restrictive policies, then remove the dormant private function and registry **only if empty**, with careful preservation of any later live configuration. The audit baseline counts and prior policies were recorded. Never drop user profiles, team memberships, tasks, findings, or general Supabase Auth tables. No rollback has been necessary after the narrowly scoped `service_role` execution-grant correction.

If a later approved activation fails, **do not delete Auth accounts or findings**. Restore the exact previous Supabase Auth hook configuration. Restore the previous PostgREST `pgrst.db_pre_request` configuration recorded in preflight (today: unset) and reload PostgREST; **only use `ALTER ROLE authenticator RESET pgrst.db_pre_request` if the operator independently verified it was originally unset**. Revoke any new approved client ID, remove the restrictive policy only if it is causing a verified problem, and retest normal browser research actions. Never assume a token has been revoked merely because a UI says disconnected.

### Source references

- [Supabase Token Security and Row Level Security](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase API pre-request function](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [OpenAI authenticated MCP plugin requirements](https://developers.openai.com/plugins/build/auth)
