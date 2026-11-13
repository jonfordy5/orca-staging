# ORCA-owned OAuth fallback — Stage 1

**STATUS: CODE ONLY, NOT DEPLOYED, ISSUER DISABLED.** This branch does not change Supabase, production, the existing ORCA MCP server, researcher identities, tokens, or current research data.

## Architecture

ORCA can operate its own standards-compliant OAuth authorization service while retaining Supabase **only for existing user login and account identity**. ChatGPT must never receive the Supabase login token. Instead, it receives a short-lived ORCA-issued token with exactly one ORCA MCP resource audience.

Use a maintained authorization-server implementation such as [panva/oidc-provider](https://github.com/panva/node-oidc-provider), which implements authorization code, PKCE, resource indicators (RFC 8707), discovery, revocation and refresh token support. Do not improvise the authorization server's OAuth code or refresh-token state machine.

### Trust flow

1. ChatGPT requests authorization with vetted client ID, exact HTTPS callback, authorization-code grant, PKCE S256 and the ORCA MCP resource indicator.
2. The ORCA-owned issuer uses the existing Supabase Auth getUser method to verify the human account and requires its existing opted-in researcher profile. The user must explicitly approve a CSRF-protected consent prompt.
3. The OAuth server stores a short-lived, hashed, atomically consumed authorization code and binds it to client, callback, resource and challenge. The code is exchanged with the PKCE verifier.
4. The issuer signs a five-minute, ES256 access token with ORCA-held private keys. The token contains an exact issuer, single MCP audience, existing owner ID, client ID, grant ID, scope and expiration. Public keys are discoverable through JWKS. Signing keys must never enter GitHub or chat.
5. The separate ORCA-owned MCP resource server verifies the signature, all claims, approved client, and current durable grant on **each** call, so disconnect revokes previously issued bearer access.
6. The MCP server performs independently authorized owner-scoped read-only ORCA research lookups. It must NOT forward the ORCA-issued token to Supabase Auth or Data API as if it were a Supabase session. PR #79's Supabase-JWT middleware is not interchangeable with this token.

### Built and tested in this stage

- issuer-policy.mjs: strict resource, callback, client, scope, PKCE and code exchange policy, **issuer release switch OFF**.
- bound-token.mjs: real ES256 sign and verify, short token lifetime and live grant requirement, with ephemeral keys only in tests.
- existing-researcher.mjs: verified Supabase user identity and existing opted-in profile only; no aliases or permissions created.
- scripts/test-orca-owned-oauth-fallback.mjs: offline tests for valid paths, wrong issuer/audience, forged signatures, wrong client/owner, expired tokens and revocation.
- GitHub CI runs only these tests. No OAuth listener is started and no client can connect from this branch.

### Still required before live use

- Implement and externally security-review the library-backed OAuth issuer, secure user interaction/cookie/CSRF flow, durable code/grant/session store, refresh rotation, revocation, discovery and client registration.
- Verify actual ChatGPT callback and real issuer hostname; no guessed domains or unapproved clients.
- Protect and rotate real ES256 keys using a secret manager; publish only public JWKS.
- Build the ORCA-owned MCP verifier and narrowly scoped database reads, avoiding broad service-role proxying.
- Test with two existing ORCA accounts, revocation, resource isolation, user login flows, write-denial and original website compatibility.
- Keep Plan A unchanged until Plan B is independently proven. Do not enable this issuer by default.

**Local test command:** node --test scripts/test-orca-owned-oauth-fallback.mjs

Passing offline tests is evidence for the core policy and token cryptography ONLY. It does not establish a complete authorization server or a live ChatGPT integration.


## Stage 1 follow-up: standards-library and standalone resource gates

A separately testable oidc-provider configuration proposal is now included in
oidc-provider-proposal.mjs. It enables RFC 8707 resource indicators with
strict approved audience selection, forces PKCE, disables development login,
disables dynamic registration and leaves refresh issuance OFF until durable
rotation and revocation are implemented. This object is not an instantiated
or running authorization server.

mcp-resource-policy.mjs verifies only exact POSTs to the intended ORCA-owned
MCP resource. It rejects missing or malformed bearer tokens, validates the
ES256 JWT through bound-token.mjs, then checks the owner/client/grant against
a fresh server-side grant lookup. It never forwards any credential to
Supabase as a browser token. Resource metadata is prepared, not deployed.

The test suite includes a real ECDSA P-256 sign/verify round-trip using
**ephemeral, test-only keys**, forged JWT and wrong-audience rejection,
two-step revocation, wrong-client and wrong-user checks, and the
separate MCP request gate.

**Remaining critical work:** implement the complete maintained OAuth runtime,
consent/login interaction, durable atomic store, signed key custody and
rotation, owner-only database read boundary, HTTP discovery, hosting and
real-world ChatGPT callback/authorization acceptance. Do NOT treat a
passing crypto test as a secure publicly accessible OAuth service.
