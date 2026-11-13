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

A fresh staging catalog check on November 12 found **19 authenticated-callable public functions**, **14 of them SECURITY DEFINER**, **12 possible write RPCs by name**, **2 public tables with direct authenticated-role write grants**, and **zero callable public functions whose source text mentions `client_id`**. These are exposure-review counts, **not** a claim that 12 functions are proven exploitable or that an OAuth token already exists. The operator can reproduce the aggregate assessment with the read-only `sql/orca_oauth_direct_api_readonly_audit.sql` file. The previously secured ordinary-client `TRUNCATE` privilege is unrelated.

**Before OAuth is switched on:** implement and test an explicit `client_id`-aware policy for every existing write-capable table and RPC, including `SECURITY DEFINER` routines. For the initial read-only pilot, block *all* OAuth-token-originated direct mutations while preserving existing ordinary browser JWT workflow. Do not assume `TO authenticated` or a client-side checkbox does that. Server-side enforcement must apply even when an attacker sends the OAuth bearer directly to the Supabase REST/RPC endpoint without calling MCP.

Because the OAuth server shares the same identity infrastructure, a project-level policy review must include custom access token hooks (if any), audience/issuer, signing keys, `session_id` revocation semantics, RLS and the two-user ownership test.

## Additional standards compatibility gate: RFC 8707 resource audience

OpenAI's MCP OAuth guidance requires the authorization server to echo the `resource` parameter during the OAuth exchange and issue a token whose audience identifies the actual protected MCP resource. **Supabase's native OAuth server documentation alone does not prove the deployed project performs this mapping.**

As of November 12, 2026, Supabase upstream [issue #2610](https://github.com/supabase/auth/issues/2610) and proposed [pull request #2894](https://github.com/supabase/auth/pull/2894) discuss RFC 8707 resource-indicator to token-`aud` binding; verify release/deployment status rather than assuming a pending change has shipped. Their existing default `aud: "authenticated"` is **not sufficient** for a strict MCP resource audience.

The MCP prototype now **fails closed** unless the signed OAuth JWT's `iss` is the exact Orca-staging issuer and `aud` includes `https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp`. This intentionally means the prototype cannot be used with an incompatible issuer. If the project does not emit resource-bound tokens, stop and use a supported solution (for example, a carefully reviewed audience-setting Supabase access-token hook), not a bypass that ignores issuer/audience.

The user-facing connection cannot go live until a real issuer/token exchange confirms compatibility with ChatGPT's exact registered OAuth callback and MCP resource URL. No authorization credentials or identity data may be pasted into chat during testing.

## Live staging public discovery + tested MCP authorization — November 12, 2026

The read-only, credential-free [OAuth readiness preflight](https://github.com/jonfordy5/orca-staging/actions/runs/43337454398) ran against **Orca-staging only**. It issued plain HTTP GET requests to public discovery/JWKS endpoints. It did **not** enable the OAuth server, register any client, perform authorization, issue tokens or touch research records.

| Checked public endpoint | Actual result | What it proves |
|---|---|---|
| `/.well-known/oauth-authorization-server/auth/v1` | **404** | OAuth authorization-server discovery is not active yet (consistent with deliberately disabled OAuth) |
| `/auth/v1/.well-known/openid-configuration` | **200** | Issuer matches the expected staging Auth URL; authorization-code and PKCE S256 capabilities advertised |
| `/auth/v1/.well-known/jwks.json` | **200**, with **one** asymmetric signing key | The publicly advertised JWKS has an asymmetric key; this is a prerequisite for the chosen Supabase middleware |
| RFC 8707 `resource` passed through code exchange and refresh | **Not tested / no token issued** | A discovery response does not prove resource audience binding |

**Security improvement in PR #79:** `supabase/functions/orca-agent-mcp/token-policy.mjs` now contains a small, pure, fail-closed resource, OAuth client and owner identity validator used by the actual MCP handler. The `scripts/test-orca-oauth-resource-policy.mjs` matrix exercises:
- Upstream proposed `aud: ["authenticated", "<exact ORCA MCP resource>"]`, as well as a single resource-string audience.
- Rejection of ordinary browser tokens, wrong issuer, generic audience, similar-looking resource URL, missing/unknown `client_id`, malformed claims and wrong researcher.
- Empty client allowlist rejects everybody; even metadata-document URL client IDs require an **exact** explicit allowlist match.

**These tests do not verify a JWT signature, expiry, grant revocation or a real ChatGPT authorization-code exchange**: the existing Supabase middleware and Auth validation are responsible for verifying bearer signatures and sessions. The token policy alone is never sufficient authentication.

**Actual upstream standards status** checked via GitHub on November 12: Supabase Auth [issue #2610](https://github.com/supabase/auth/issues/2610) remained open and [PR #2894](https://github.com/supabase/auth/pull/2894) remained **open/unmerged**. Its proposal binds the resource audience during authorization-code issuance and refresh. **Do not enable OAuth or relax the audience checks merely because synthetic audience tests pass.**

Separate owner approval is required for OAuth enabling, client registration, token hook registration and MCP function deployment. Until native resource binding is verified against the actual deployed staging Auth version, the account-connection screen must continue to report **not linked**.

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
