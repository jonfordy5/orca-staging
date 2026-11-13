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
