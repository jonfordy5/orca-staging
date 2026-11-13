# ORCA Stages 22–26 — guarded issuer host checkpoint

**November 13, 2026 — DRAFT SOURCE ONLY. NOTHING DEPLOYED. NO REAL AGENT CONNECTION.**

## Implemented on the existing PR #83 branch

1. **Stage 22 — protected secret custody:** `locked-issuer-host-startup.mjs` loads an externally provided private ES256 JWK, distinct provider cookie and AES-256-GCM secrets, PostgreSQL CA/password and Supabase *publishable* key. It requires owner-only regular files in a canonical private directory, no symlink/hardlink/execute bits, bounded sizes, and exact staging project and client/redirect/resource configuration.
2. **Stage 23 — positive real-library startup:** `locked-issuer-host-startup-integration.test.mjs` generates ephemeral test materials, assembles actual `oidc-provider@9.14.0`, and proves OAuth remains 503 with no Supabase HTTP calls or PostgreSQL opening. Negative tests cover invalid signing material, key reuse, weak files and malicious settings.
3. **Stage 24 — isolated real PostgreSQL TLS:** `private-pg-tests/stage24-locked-real-pg.test.mjs` runs against the EXISTING disposable PostgreSQL 17 Docker workflow, uses test-only CA-signed SSL and restricted login/role, then assembles the issuer from synthetic mount files. It never contacts hosted Supabase or any real user.
4. **Stage 25 — direct locked HTTPS host:** `locked-issuer-tls-server.mjs` checks the issuer hostname against the certificate SAN, certificate/key match, at least 14 days remaining validity, exact HTTPS Host **and** TLS SNI. The only possible bind is `127.0.0.1` via an explicit `listenLoopback()` call. No public listener is returned, and metadata/auth/token/consent endpoints stay 503. Real CA-verified loopback HTTPS tests reject spoofed Host headers.
5. **Stage 26 — complete locked host composition:** `locked-issuer-host-bootstrap.mjs` connects all pieces from one protected mount directory, including `issuer-tls-private-key.pem` and `issuer-tls-certificate.pem`. It cannot be enabled using an environment flag, and no network bind occurs on construction.

All secret files are read from an **operator-provided private host mount**, never committed or provisioned in GitHub. The local-only tests generate disposable values. No real signing keys, database passwords, session tokens or OAuth credentials may be pasted into chat, CI or source code. Do not set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Release posture

- The `ORCA_OWNED_ISSUER_ENABLED` and `ORCA_MCP_ENABLED` gates remain **OFF**.
- Stage 21 intentionally exposes only an always-503 handler. Stages 22–26 preserve this: **they are not a live issuer**, even with correct real secrets.
- No Supabase migration, issuer role provisioning, OAuth client approval, private key issuance, public DNS/certificate deployment or real ChatGPT account connection has occurred.
- The existing website, production, research assignments and existing user identities were not modified by these GitHub-only commits.
- PR #83 must remain **draft** and unmerged until an independent security review and owner-authorized release.

## Remaining independently approved steps before first real agent connection

1. Choose and approve distinct **real** HTTPS issuer and resource hostnames plus a Node-capable host, DNS, and publicly trusted TLS. Never use the synthetic `.invalid` CI identities in production.
2. Review and explicitly approve private Supabase staging schema/least-privilege roles, migration, rollback, backup and network access. Provision passwords in an external secret manager and verify direct/session PostgreSQL TLS certificate and hostname.
3. Provision separate real signing, cookie, encryption and TLS keys with rotation/recovery procedures. The mount must be inaccessible to the frontend, clients, CI logs and GitHub.
4. Obtain and validate the **real ChatGPT OAuth client registration and exact redirect URI**. Confirm registered metadata, RFC 8707 resource indicators and authorization-code + PKCE S256 interoperability.
5. Implement a **separately reviewed, separately enabled live issuer host** with the persistent provider, real Supabase researcher login, user-bound consent sessions, grant linking and custom signed tokens. The locked host must NOT be repurposed by a release toggle.
6. Implement and deploy the separate authenticated MCP read-only gateway, verifying exact JWT audience, grant and owner on every call. Never send ORCA-issued JWTs to Supabase Auth/Data API.
7. Run two genuine opted-in ORCA researcher identities through full ChatGPT OAuth/MCP acceptance; test consent refusal, callback/replay rejection, owner isolation, immediate revocation, denied writes, website regression and rollback.

**No-go until ALL seven external/live requirements are met.** Do not confuse passing CI with authorization to activate a public issuer.
