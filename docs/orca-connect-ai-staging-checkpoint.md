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

## Next build: request-level OAuth grant transport and denial tests

The MCP prototype no longer embeds an opaque Auth-fetch helper inside the Edge Function. It imports a separately testable, fixed-origin transport from `supabase/functions/orca-agent-mcp/grant-request.mjs`. The transport performs **one fresh GET per MCP tool call** against `https://vbziibatnejoswsdggga.supabase.co/auth/v1/user/oauth/grants`, using the identical signed bearer already accepted by Supabase's user middleware. It supplies the public project API key, never sends cookies, rejects redirects, forbids cached results, has a 6-second request timeout, and rejects a non-array grant payload or Auth service failures.

This wire format was verified against Supabase Auth's actual GoTrue implementation, not merely inferred from docs:

- [GoTrue UserListOAuthGrants implementation](https://github.com/supabase/auth/blob/88725864802773ad4533e0cad28f7a2740c89a7e/internal/api/oauthserver/handlers.go) — user-scoped active grants are a JSON array with `client.id`, `scopes` and `granted_at`.
- [GoTrue UserRevokeOAuthGrant implementation](https://github.com/supabase/auth/blob/88725864802773ad4533e0cad28f7a2740c89a7e/internal/api/oauthserver/handlers.go) — revokes consent and deletes the relevant OAuth client refresh sessions.
- [GoTrue OpenAPI contract](https://github.com/supabase/auth/blob/88725864802773ad4533e0cad28f7a2740c89a7e/openapi.yaml) — exact GET path and 200 response shape.

New `scripts/test-orca-oauth-grant-transport.mjs` exercises the actual transport with mock HTTP responses: correct bearer passthrough, exact URL, no cookie/redirect/cache behavior, current grant, denial for wrong issuer/client/audience/owner, immediate denial after simulated revoke on the second request, malformed/missing bearer, missing API key, Auth error and bad response shape. These are offline tests of security logic, **not** real-signed-in end-to-end acceptance.

First full post-refactor results: [OAuth safety CI #43358112573](https://github.com/jonfordy5/orca-staging/actions/runs/43358112573) PASS, [grant UI CI #43358112412](https://github.com/jonfordy5/orca-staging/actions/runs/43358112412) PASS. The full shared-workspace regression is tracked separately in [run #43358112498](https://github.com/jonfordy5/orca-staging/actions/runs/43358112498).

**No OAuth clients were registered, no real bearer was handled, no MCP endpoint deployed, and no production setting or research permission changed.** The next release gate remains a real audience-bound OAuth bearer, followed by a two-existing-account signed-in authorize/read/revoke/negative-test and inspection of alternate service entry points.


## November 12 — canonical discovery and two-account request-level gate

A current review of [Supabase's own MCP middleware guide](https://github.com/supabase/supabase/blob/e2425b7214086f789bb2810177a93efa51892dbc/apps/ui-library/content/docs/headless/mcp.mdx) exposed a concrete path mismatch. The middleware serves protected resource metadata at `<function-url>/oauth-protected-resource`. The previously guessed `<function-url>/.well-known/oauth-protected-resource` path was incorrect. `scripts/orca-oauth-readiness.mjs` and the user's connection page now use the canonical path, with tests preventing regression.

Dynamic client registration is optional under Supabase's documented OAuth server configuration. The metadata verifier now permits a manually pre-registered client while still rejecting an untrusted advertised dynamic-registration URL. Any client used for the pilot must still be separately approved using its exact registered client ID and HTTPS callback URI.

An additional `owner-authorization.mjs` module now drives the authorization of BOTH exposed MCP read tools. It verifies `getClaims`, verifies a live Auth user with `getUser`, enforces the exact issuer/resource-audience/client allowlist/subject, then fetches current owner-scoped Auth grants using the same bearer **on every request** before allowing any ORCA research read. That exact module is exercised by `scripts/test-orca-oauth-two-account-gate.mjs`, covering two distinct accounts, same-bearer revocation, invalid owner mismatch, wrong client, wrong resource and unavailable Auth. These are mock two-account tests, not yet an actual linked ChatGPT session.

### Credential-free live staging preflight

The preflight script checks the canonical protected-resource metadata URL, OAuth authorization metadata, OpenID metadata and JWKS without cookies, tokens, client registration or writes. [GitHub Actions run #43359733621](https://github.com/jonfordy5/orca-staging/actions/runs/43359733621) observed:

| Endpoint | Actual response |
| --- | --- |
| ORCA MCP resource metadata | HTTP 404 (function not deployed) |
| Supabase Auth OAuth server metadata | HTTP 404 (OAuth server still off) |
| Existing Auth OpenID discovery | HTTP 200; expected issuer matched |
| Existing Auth public JWKS | HTTP 200; one asymmetric signing key |

No permission or identity grant was created. The shared PostgREST pre-request guard remains set to `orca_mcp_private.enforce_readonly_oauth_data_api`. The approved client table was queried read-only and remains EMPTY. The existing `orca-agent-readonly` Edge Function remains deployed, while `orca-agent-mcp` is NOT deployed.

**Next action is a deliberate staging activation decision, not another refactor.** The blocking upstream Supabase Auth RFC 8707 resource-binding change remains an open pull request. Do not turn on OAuth or deploy the publicly discoverable MCP endpoint before demonstrating that the hosted Auth service issues a token whose `aud` contains the exact ORCA MCP resource and before reviewing approved callback/client configuration. Keep production unchanged.
