# ORCA OAuth — read-only Data API gate and audience hook

**Status: REVIEWED CODE CANDIDATES — NOT DEPLOYED OR ENABLED.** Branch `security/orca-oauth-readonly-gateway-20261112`. This is the next staged milestone for [ORCA agent connection #75](https://github.com/jonfordy5/orca-staging/issues/75) and [OAuth/MCP prototype PR #79](https://github.com/jonfordy5/orca-staging/pull/79).

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

It also adds a **RESTRICTIVE RLS policy**: OAuth users can SELECT only **their own** stock-team membership, while ordinary ORCA users keep their existing all-team view.

**The hook is NOT installed by SQL alone.** A separate, explicitly approved operator change would later set `ALTER ROLE authenticator SET pgrst.db_pre_request='orca_mcp_private.enforce_readonly_oauth_data_api'` and `NOTIFY pgrst,'reload config'`. The current branch deliberately contains no live activation command.

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

## What we must do before public account linking

1. **Separate owner approval for staging SQL deployment**. Take a security baseline, verify today's pre-request settings and RLS policies, snapshot existing Auth hook configuration. Never target project `hsgfwsghxdcgpjlekfqf` (production).
2. Install the policy/helper in staging **without activating the global PostgREST hook**, then verify new objects and their default-deny registry, with read-only checks. Do not change any user record.
3. Review and test any existing **Custom Access Token Hook** before registering this one. The first-choice compatibility path should be a native Supabase Auth OAuth server that forwards RFC 8707 resource; only use a reviewed audience hook if it genuinely produces valid tokens and preserves existing browser sessions.
4. Test all OAuth write bypasses with an approved **real test client**, including direct RPC to `orca_request_and_claim_next`, `commons_publish_finding`, `commons_set_my_research_consent`, and direct table DELETE/INSERT. The pre-request hook must reject them before execution. Test ordinary website claims/publishing still work.
5. Audit other product APIs separately: **the PostgREST hook does not protect Supabase Storage, Realtime, GraphQL or independent Edge Functions**. Don't infer all-product isolation from the Data API tests. Confirm no other OAuth token route can alter protected research records.
6. Verify the staging signing algorithm is asymmetric, OAuth discovery + PKCE, provider `resource` echo, correct audience, and the exact OpenAI callback. The OAuth server remains **disabled** until the gates pass.
7. Only after two actual owner accounts pass OAuth connecting, revocation, error/expiry behavior and cross-account tests should we expose **Connect Your AI** (and true Pause/Disconnect) on the ORCA website.
8. Claim/publish MCP tools are a *later separately scoped feature*. The initial OAuth connection remains read-only.

## Rollback planning

No rollback is needed for this PR since it changes no live system.

If a later approved activation fails, **do not delete Auth accounts or findings**. Restore the exact previous Supabase Auth hook configuration. Restore the previous PostgREST `pgrst.db_pre_request` configuration recorded in preflight (today: unset) and reload PostgREST; **only use `ALTER ROLE authenticator RESET pgrst.db_pre_request` if the operator independently verified it was originally unset**. Revoke any new approved client ID, remove the restrictive policy only if it is causing a verified problem, and retest normal browser research actions. Never assume a token has been revoked merely because a UI says disconnected.

### Source references

- [Supabase Token Security and Row Level Security](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase API pre-request function](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [OpenAI authenticated MCP plugin requirements](https://developers.openai.com/plugins/build/auth)
