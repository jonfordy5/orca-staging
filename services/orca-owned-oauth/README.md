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


## Stage 2: durable private grant registry and encrypted provider-state proposal

**Review-only implementation, no Supabase migration executed.** This code is
isolated to the draft GitHub branch and does not deploy an issuer or touch
the current ORCA auth/database environment.

- private-schema-review-only.sql is a **draft SQL blueprint** for a
  non-Data-API schema: owner/client/resource-bound consent grants and
  oidc-provider model state. Do not apply it as-is; select a dedicated
  narrowly privileged non-BYPASSRLS issuer DB owner, private connection,
  catalog grants, safe encrypted backups, and a reviewed migration first.
- grant-registry.mjs supplies a parameterized PostgreSQL backed
  create/lookup/revoke/list surface. It demands an issuer-internal single-use
  approved-consent verification callback for issuance and an Auth-verified
  owner identity for revoke. The read-side lookup checks every element of the
  token's owner/client/grant/resource/scope against an unexpired and
  unrevoked row **on each MCP request**, without a grant cache. PostgreSQL
  UPDATE with an owner predicate makes Disconnect idempotent. The real
  consent UI, CSRF, and server-side approval event are not implemented yet.
- encrypted-pg-oidc-adapter.mjs implements the panva/oidc-provider
  documented persistence hooks (upsert/find/findByUid/consume/destroy/
  revokeByGrantId) using AES-256-GCM encrypted payloads, hashed opaque
  references, strict TTL, per-record authentication data, encrypted-key
  rotation and atomic SQL consume. It requires an injected private
  PostgreSQL query method and an external keyring. It has not yet been
  integrated or compatibility-tested against a running oidc-provider
  release and real Postgres transaction/concurrency behavior.
- scripts/test-orca-owned-oauth-grant-registry.mjs covers two owner accounts,
  consent rejection, owner-only revoke, no-cache revocation of a signed
  ORCA access token, expiration and simulated database outages.
- scripts/test-orca-owned-oauth-provider-store.mjs covers encrypted
  persistence, replay-denying consume, tampering, key rotation, expired
  records and unavailable SQL. Tests simulate the PostgreSQL interface;
  passing tests do not establish production-ready state durability.
- **OAuth client IDs are opaque strings**, not necessarily UUIDs. Current
  MCP authorization can use a registered HTTPS URL client ID. All Plan B
  layers now enforce exact vetted IDs without assuming UUID syntax.
  Client ID Metadata Document fetch/validation is not yet implemented;
  only explicit pre-registration is planned for the pilot.
- Refresh token issuance and refresh grant type are **both disabled** for
  now. Do not advertise or enable a long-running connected session until
  the maintained provider's refresh rotation, storage, replay and
  revocation tests are complete.

Live staging was checked read-only after the source additions: the private
owned-issuer schema does NOT exist, approved OAuth clients remain zero, and
ORCA research records and account counts are unchanged.

**Next milestone:** pin a maintained OAuth server dependency, integrate the
persistent adapter and consent UI on a local isolated Postgres instance,
verify RFC 8707 access token shape, and then build the separate ORCA-issued
token MCP runtime. After that, verify real ChatGPT login, refresh, revocation
and cross-account isolation. The issuer release switch remains OFF.
