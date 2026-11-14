# ORCA Stage 22 — protected secret loading, locked issuer only

**Status: draft source and offline tests; no listening service, secret provision, database migration, or deployment.**

The Stage 22 module `services/orca-owned-oauth/locked-issuer-host-startup.mjs` reads specific secret files from a private absolute directory (default `/run/secrets/orca-owned-oauth`). It requires a real, non-symlink, owner-only directory (0700) and regular, single-linked, owner-only secret files (0600). It opens files with `O_NOFOLLOW`, checks the same inode before/after opening, limits byte sizes, and emits only one generic error on failure.

File names and formats:
- `signing-jwk.json`: one ES256 P-256 **private** JWK with matching `kid` (strictly validated by Stage 21).
- `provider-cookie-keys.json`: JSON array of 2–3 independently generated base64url-encoded 32-byte secrets.
- `provider-keyring.json`: `{"currentKeyId":"...","keys":{"...":"<base64url32>"}}`.
- `browser-session-keyring.json`: `{"keys":[{"id":"...","key":"<base64url32>"}]}`.
- `issuer-db-password.txt`: raw PostgreSQL issuer-only role password, without trailing newline.
- `postgres-ca.pem`: independently verified PostgreSQL CA certificate, subject to Stage 20 validation.
- `supabase-publishable-key.txt`: staging *publishable* (never service-role) key, without trailing newline.

All symmetric secrets must be **distinct across purposes**. Provision the files directly using the eventual host's secret manager; **never commit any of these values, place them in CI logs, or paste them into chat.** Rotating a key requires retaining previous decrypt keys for the lifetime of encrypted records, with carefully bounded overlap.

Startup requires `ORCA_STAGE22_LOCKED_ACK=OFFLINE_ASSEMBLY_ONLY`, `ORCA_OWNED_ISSUER_ENABLED=false`, `ORCA_MCP_ENABLED=false`, exact staging project and its Supabase URL, and explicit issuer/client/redirect/resource and Stage 20 database endpoint settings. It passes all configuration to the real Stage 21 locked issuer assembly; the only public handler still returns 503. Nothing listens or writes during construction. This file is **not a live activation entrypoint**.

Before any private host is provisioned, separately select and approve the issuer/MCP HTTPS domains, server, provider callback/client registration, narrowly privileged database roles/migration, backup/rollback, real key custody, and two-real-owner security acceptance. PR #83 remains draft and both services OFF.
