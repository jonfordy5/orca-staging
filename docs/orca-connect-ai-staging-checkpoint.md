# ORCA Connect Your AI — staging implementation checkpoint

**STATUS: Draft source on PR #79 only. OAuth server disabled, MCP function not deployed, zero approved clients.**

This build preserves ORCA's existing researcher identities, Supabase research system, assignments and publication rights. No production setting or live research records were changed.

## Implementation

- orca-connect-ai.html: new four-stage staging-only setup page. Checks the signed-in existing ORCA account, public OAuth discovery, shows the planned MCP address, and links to grant management.
- scripts/orca-oauth-readiness.mjs: fail-closed exact public OAuth metadata checks for canonical staging resource, issuer, authorization-code flow, PKCE S256, and expected authorization/token/registration host.
- scripts/test-orca-connect-ai.mjs: negative and positive metadata test cases, identity/owner source checks, safe read-only public requests, no silent linking or research writes.
- account.html: exact sign-in return-path allowlist extended for the new page.
- connect-work.html: link to this pilot while retaining the functional manual ChatGPT Work research flow.
- .github/workflows/orca-connect-ai.yml: Node 24 CI tests for connection UI, authorization and revocation regressions.

The planned staging MCP resource is:
https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp

Staging page URL when its branch is merged and deployed:
https://jonfordy5.github.io/orca-staging/orca-connect-ai.html

The operator release gate ORCA_AGENT_OAUTH_PILOT_ENABLED is deliberately FALSE. Copying the resource address does not authorize a ChatGPT account.

## Launch gates

1. Confirm actual RFC 8707 resource propagation at authorization, token exchange and refresh. Upstream Supabase Auth PR #2894 remains open as of November 12, 2026: https://github.com/supabase/auth/pull/2894 .
2. Independently approve only Orca-staging OAuth activation, callback configuration, a vetted ChatGPT client, and MCP deployment after review. Never deploy the private candidate token hook as an unverified workaround.
3. Verify live bearer issuer, expected MCP resource audience, client ID, subject and signature. Confirm browser roles still work.
4. Prove direct REST/RPC writes denied to OAuth bearer; check GraphQL, Storage, Realtime and six protected Edge Functions.
5. Two distinct existing ORCA accounts: authorize, profile/assignment read, owner-isolation, expiration, disconnect, revoke and retry. No auto-created alias or altered consent.
6. Only after real revocation and write-boundary tests, separately design task-scoped claim and publication tools. Keep production and real money trading out of scope.

## Local CI commands

node --test scripts/test-orca-connect-ai.mjs
node --test scripts/test-orca-oauth-mcp-readonly.mjs scripts/test-orca-oauth-connections.mjs

These CI checks are source-level only and do not establish end-to-end OAuth connection.

## November 12 continuation: consent hardening and per-request grant validation

**Code added to draft PR #79; not deployed.** The OAuth consent page now imports a strict pilot policy whose approval switch is FALSE and whose vetted-client/callback registry is empty. It will not offer authorization or silently redirect an already-authorized request while the pilot is disabled. A user click must pass client ID and exact callback authorization again before Supabase may approve the request. Consent approvals and denials explicitly disable the SDK's automatic browser redirect to avoid double-navigation.

The MCP Edge Function now includes a read-only, user-scoped grant check after validating the JWT issuer, MCP resource audience, OAuth client ID and verified user. On **each MCP read**, it uses the SAME caller bearer to query the Supabase Auth `GET /auth/v1/user/oauth/grants` endpoint, validates the currently granted client ID, and rejects missing or revoked grants before any researcher read. It does not use the service role or expose a JWT in the response.

Implementation:
- `scripts/orca-oauth-consent-policy.mjs`
- `supabase/functions/orca-agent-mcp/grant-policy.mjs`
- `supabase/functions/orca-agent-mcp/index.ts`
- `scripts/test-orca-oauth-live-grant-safety.mjs`
- `.github/workflows/orca-oauth-grant-safety.yml`
- `orca-oauth-consent.html` and the existing source regression tests.

**Scope and limits:** this does not yet prove that a real OAuth bearer can use the Auth grants endpoint from a deployed MCP server. Live tests must show a valid grant succeeds, a revoked grant denies immediately, and the API does not reveal another user's grant. If that endpoint or a versioned response does not match, ORCA fails closed rather than bypassing the check. The tested authorization policy remains disabled; real OAuth interoperability, two-account acceptance and direct API denial tests remain mandatory.

CI receipt: [OAuth safety run #43356083582](https://github.com/jonfordy5/orca-staging/actions/runs/43356083582) passed Node regression tests and the Deno typecheck. [Grant UI run #43356083557](https://github.com/jonfordy5/orca-staging/actions/runs/43356083557) passed. Full shared workspace checks are independently tracked.

Latest staging SQL read-only check: `orca_mcp_private.approved_readonly_clients` remains 0; the global staging PostgREST request guard remains configured. Staging researchers, their permissions and existing findings were not modified by this source-only work. Security advisor notices on existing `SECURITY DEFINER` functions and informational no-policy RLS tables remain separate release-review items.
