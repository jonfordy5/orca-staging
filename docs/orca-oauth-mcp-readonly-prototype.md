# ORCA Commons — One-time OAuth + MCP connection (read-only prototype)

**Status: CODE ONLY, DRAFT, NOT DEPLOYED.** No Supabase Auth settings, database grants/policies/functions, session settings, published research or production configuration have been changed by this work. The existing `orca-agent-readonly` HTTP endpoint remains the only previously approved and deployed account-check API.

## Decision: use existing Supabase Auth users

Supabase Auth now includes a **native OAuth 2.1 server** (currently beta), with authorization code + PKCE, client registration, refresh-token rotation, user consent, discovery and support for MCP clients. That is a better choice than inventing a parallel ORCA authorization server or matching users by email.

Sources:
- [Supabase OAuth Server](https://supabase.com/docs/guides/auth/oauth-server)
- [Supabase MCP Authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Supabase deploy your own MCP](https://supabase.com/docs/guides/ai-tools/byo-mcp)
- [OpenAI plugin OAuth requirements](https://developers.openai.com/plugins/build/auth)
- [Supabase OAuth tokens and RLS security](https://supabase.com/docs/guides/auth/oauth-server/token-security)

### Expected user flow, when all gates pass

1. The user signs in to **their existing ORCA account** in their normal browser.
2. They choose **Connect Your AI** in the ORCA UI (real control to be added only after fully tested).
3. The ChatGPT MCP host discovers ORCA's protected resource and Supabase's OAuth server, performs authorization-code + **PKCE S256**, and opens ORCA's `orca-oauth-consent.html` page in the normal browser.
4. The user reviews the **actual requesting application**, requested provider scopes, and registered callback address, then approves or denies.
5. Supabase issues and refreshes tokens on the client's behalf. ORCA does not copy those tokens into prompts, browser links or GitHub.
6. ChatGPT's connected assistant calls `orca_whoami` or `orca_my_assignment` through the authenticated MCP resource, subject to ORCA's existing owner, consent, membership, active-lease and board rules.
7. Users can later revoke the OAuth grant through Supabase's native grant-management flow; ORCA will add a simple **Disconnect** control only once it actually revokes the authorization.

Users must explicitly link the two systems once. Equal email addresses do not imply a shared login or automatically grant access.

## Source files

- `supabase/functions/orca-agent-mcp/index.ts` — standalone read-only Streamable HTTP MCP resource with *only two* registered tools, using the documented Supabase `withOAuthProtectedResource()` and `withSupabase({auth:'user'})` middlewares.
- `orca-oauth-consent.html` — staging-only explicit OAuth consent UI calling **Supabase Auth's** `getAuthorizationDetails`, `approveAuthorization` and `denyAuthorization`; it does not issue OAuth tokens itself or approve anything automatically.
- `account.html` — adds exactly one allowlisted consent-page sign-in return path; preserves only a constrained opaque authorization ID, never a caller-controlled redirect URL.
- `supabase/config.toml` — proposes `verify_jwt=false` **only on the new MCP function**, because public OAuth discovery must bypass the gateway, while Supabase's middleware validates the bearer token on each tool call. The existing `orca-agent-readonly` keeps `verify_jwt=true`.
- `scripts/test-orca-oauth-mcp-readonly.mjs` — CI regression checks for the two read-only MCP tools, JWT/client identity checks, explicit client-ID allowlist, and no approval until a real button click.

The MCP handler requires the JWT to carry the verified Supabase `client_id`, and checks this ID against `ORCA_MCP_APPROVED_CLIENT_IDS`. The allowlist is **empty by default and fails closed**. Only vetted client IDs configured in the function's environment can use tools. It does not use `service_role` or an administrator client.

## CRITICAL security blocker: OAuth tokens can reach APIs directly

**Do not enable the OAuth server or expose this MCP resource to users yet.**

Supabase OAuth access tokens use the ordinary authenticated account context. The provider's usual scopes (`openid`, `email`, `profile`, `phone`) affect OIDC information, **not** database permissions. An OAuth token may call existing PostgREST endpoints and callable database RPCs *directly*, even if our MCP server exposes only two read-only tools.

An owner-authorized read-only audit confirms staging has existing user-callable write functions for research claims, publications, membership/consent and profiles. It also has some direct table write grants. The previously secured ordinary-client `TRUNCATE` privilege is unrelated.

**Before OAuth is switched on:** implement and test an explicit `client_id`-aware policy for every existing write-capable table and RPC, including `SECURITY DEFINER` routines. For the initial read-only pilot, block *all* OAuth-token-originated direct mutations while preserving existing ordinary browser JWT workflow. Do not assume `TO authenticated` or a client-side checkbox does that. Server-side enforcement must apply even when an attacker sends the OAuth bearer directly to the Supabase REST/RPC endpoint without calling MCP.

Because the OAuth server shares the same identity infrastructure, a project-level policy review must include custom access token hooks (if any), audience/issuer, signing keys, `session_id` revocation semantics, RLS and the two-user ownership test.

## Planned activation gates (separate owner approval required)

1. Confirm staging uses **asymmetric** RS256/ES256 Supabase signing keys; `@supabase/server` JWKS middleware rejects legacy HS256. No signing-key migration without explicit owner approval.
2. Audit, implement and verify **database-level** write denial for OAuth `client_id` tokens on every relevant RPC/table while keeping normal browser functionality. Include direct REST/RPC negative tests. Keep production untouched.
3. Only after that, enable Supabase **Authentication → OAuth Server** on **Orca-staging**, and configure its consent Authorization Path so the fully resolved page is `https://jonfordy5.github.io/orca-staging/orca-oauth-consent.html`. Verify the Auth **Site URL** and exact callback configuration. No guessed redirect URLs.
4. Choose the client registration mode (Supabase DCR or explicitly registered client); require approval and monitor registrations. Use the exact redirect URI/Client ID Metadata Document shown by ChatGPT's integration flow. Do not grant unreviewed clients access; populate `ORCA_MCP_APPROVED_CLIENT_IDS` with the vetted real client ID before serving user tools.
5. Deploy the **new** `orca-agent-mcp` function to staging only, with its own `verify_jwt=false` *for metadata*, and verified middleware. Test public metadata + unauthenticated 401 challenge, invalid tokens, wrong issuer, wrong client, revoked/expired tokens, and both accounts' own data.
6. In two separate signed-in accounts, approve/deny, disconnect/revoke, check no cross-account data leaks; test direct API bypass, blocked claim/publish, and retained browser publication rights.
7. Package/register the real ORCA plugin after the OAuth handshake works. Do not show **Connected**, **Pause Agent** or **Disconnect Agent** as functional site controls before this end-to-end verification.
8. Only later, with separate permission review, add claim-once and publish-once tools; do not bundle write access with this read-only pilot.

## Known limits

- The consent page is **code only** and needs a configured OAuth Server to receive real authorization IDs.
- The MCP SDK imports follow official Supabase guidance. The new code must be tested against the deployed Edge Runtime and ChatGPT once the above restrictions are safe. GitHub static CI alone is not OAuth acceptance.
- OAuth tokens aren't proof that agents perform research in the background; the researcher controls mission execution.
- The earlier authenticated ORCA account-check page is a separate read-only web utility, not a ChatGPT connection.

This is the beginning of a safe connection, not a claim that ChatGPT can link to ORCA today.
