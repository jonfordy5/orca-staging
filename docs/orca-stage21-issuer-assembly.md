# ORCA Stage 21 — maintained OAuth issuer assembly (locked)

**Status: CODE ONLY, NOT DEPLOYED. Release remains OFF.**

## Built

A new Stage 21 assembly in services/orca-owned-oauth/locked-issuer-assembly.mjs combines these independently tested ORCA components into one logical issuer setup:

- The actual pinned oidc-provider 9.14.0 authorization-code + PKCE S256 implementation, configured for one exact approved OAuth client, callback, resource audience, and read-only research scope.
- The existing private AES-256-GCM PostgreSQL OIDC model adapter and the restricted Stage 21 issuer-private-query transaction wrapper. The input must be the role-verified Stage 20 database connector; the assembly does not accept arbitrary SQL callbacks.
- Separate, external ES256 P-256 signing JWK (validated private/public key pair), two distinct provider cookie secrets, and separate provider-state/browser-session AES-256-GCM keyrings. Signing/private keys are never returned from the assembly.
- The real Supabase Auth and owner-RLS researcher adapter, consent CSRF challenge store, host-only opaque browser sessions, and the same real human login/approve routes exercised in Stage 17.
- The durable owner-bound grant registry, provider-grant link, read-only scope restriction, and refusal to mint an access token for an unlinked/revoked grant.

The assembly intentionally exposes **only** an always-503 HTTP handler, plus non-sensitive issuer/resource/client metadata. It does not return the underlying provider callback, private PostgreSQL query adapter, signing JWK, or enabled consent finalizer. It cannot be switched to a functioning OAuth service by changing an environment variable.

The Stage 21 issuer-private-query helper permits only bounded internal SELECT/INSERT/UPDATE/DELETE SQL on four ORCA private OAuth tables; each call gets a fresh Stage 20 issuer-role session and a transaction. A failed query is rolled back, the connection is discarded, and secrets are not included in errors.

## What was tested

The Stage 21 test constructs an **actual oidc-provider instance** with ephemeral ES256 keys and a real-shaped Supabase HTTP adapter using intercepted/synthetic network data; it proves that assembling the issuer and sending requests to /auth, /token, discovery, session bootstrap and consent routes all leave OAuth disabled without making database or Supabase calls.

Separate tests reject invalid P-256 signing material, duplicate/weak cookie keys, recycled encryption keys, HTTP/wrong resource URLs, unauthorized clients and missing database verifier. The issuer database helper tests fresh transactions, SQL allowlisting, rollback and connection disposal.

These are local CI security checks only. The older Stage 17 test still verifies real OAuth library code exchange, human consent and PKCE using synthetic researcher identity and in-memory provider storage. Stage 19 verifies encrypted PostgreSQL persistence against an isolated real database; **Stage 21 does not yet combine those two into one publicly hosted OAuth authorization flow.**

## Remaining before an actual agent can sign in

1. Choose and approve two real HTTPS origins and a secured Node host. Test direct TLS and DNS with real certificates; no TLS spoofing or proxy-trust shortcut.
2. Independently security-review the private PostgreSQL schema, database login roles, backups and rollback. Provision separate issuer/MCP credentials only in the host secret manager; never in source, GitHub, a container image, or chat.
3. Supply current Supabase staging publishable key to the private server and validate genuine existing researcher sign-in and opted-in owner profile. Never use Supabase service_role for the agent connection.
4. Import the real ES256 private JWK, provider encryption key, browser-session encryption keys and cookie secrets from restricted secret mounts. Plan key rotation and recovery; avoid reuse across purposes.
5. Obtain actual ChatGPT OAuth client registration and exact redirect URL from the connector management process, and confirm authorization-code + PKCE S256 + resource metadata interoperability.
6. Create a **separately reviewed and explicitly approved** live issuer entrypoint. This Stage 21 module deliberately cannot serve OAuth.
7. Prove two consenting **real** ORCA researcher accounts can see only their own existing assignments and that a previously valid token is denied immediately after revocation. Test rollback and existing website behavior.

**No-go until then.** Leave PR #83 draft, no live DB migration or OAuth/MCP activation, and no production changes.
