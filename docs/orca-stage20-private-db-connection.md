# ORCA Stage 20 — restricted PostgreSQL connection handoff

**Date:** November 13, 2026  
**Status:** source code and ephemeral CI only — NOT deployed to Supabase, NOT a production migration, NO user session or ChatGPT connection.

## What Stage 20 adds

- \`verified-supabase-db-connector.mjs\` is a **server-side** \`pg.Client\` connector for TWO named database logins only:
  - \`orca_owned_issuer_login\` may assume \`orca_owned_issuer_writer\`, for private OIDC/consent/grant persistence.
  - \`orca_owned_mcp_grant_login\` may assume \`orca_owned_mcp_grant_reader\`, for a single read-only current-grant query.
- It refuses \`postgres\`, \`service_role\`, \`authenticator\`, the wrong role, the wrong Supabase project, missing CA, unverified socket, untrusted hostname, wrong SSL server name, unexpected database name, transaction-pooler port, and a non-verified TLS environment.
- It only accepts the **direct** connection to \`db.<exact-project-ref>.supabase.co:5432\` or an **operator-supplied** Supabase **session-mode** pooler host on port \`5432\` (never 6543). Copy the latter directly from Supabase Dashboard **Connect**; do NOT infer the pooler cluster from the region.
- Node's TLS connection is configured with \`ca\`, \`rejectUnauthorized:true\`, \`servername:<host>\`, and a TLS 1.2+ minimum. Each operation creates a fresh client, checks the authenticated \`session_user\`, assumes only its predetermined PostgreSQL role, verifies \`current_user\`, and closes the session rather than recycling owner/role state. A hard concurrent-connection cap denies overload.
- \`private-db-logins-review-only.sql\` creates NOLOGIN/NOINHERIT roles and role memberships, with \`INHERIT FALSE, SET TRUE\`. It contains no password or usable login. The operator must **separately** approve and securely provision credentials after audit.
- Tests cover wrong host, wrong CA, wrong user, wrong role, disabled TLS and denial before SQL. An isolated PostgreSQL CI checks that neither login can inherit private roles or assume the other service's privileges.
- A separate **ephemeral actual TLS** GitHub Actions test creates a local PostgreSQL 17 server with a disposable CA-signed certificate matching a synthetic Supabase hostname, and unique temporary passwords. It verifies two distinct restricted logins plus role-switched grant creation/current lookup/revocation, and rejects an unrelated CA. It never connects to actual Supabase.

## Required operator choices BEFORE applying anything live

1. Select an approved host for the private Node issuer/MCP backend and verify it can resolve and reach the selected Supabase **staging** database over an appropriately restricted outbound network. Keep the existing GitHub Pages frontend as-is.
2. In the Supabase staging project, inspect **Connect** for the direct endpoint; if the host cannot use IPv6 or the project lacks IPv4 support, inspect the **session pooler** entry at port 5432. Use the exact endpoint; do not guess the pooler hostname or username. **Do not use transaction pooling on port 6543** with these role-bound sessions.
3. In Database Settings, securely download the applicable Supabase TLS CA certificate, verify its provenance, and mount it on the private host. Encryption without certificate/hostname verification is not enough. Do not disable TLS verification or use \`NODE_TLS_REJECT_UNAUTHORIZED=0\`.
4. Obtain a **fresh independent security review** of the proposed private schemas, role-membership grants, existing Supabase RLS/catalog grants, connection limits, migration rollback, backup, and risk of adding \`LOGIN\` roles. Only apply changes to staging with explicit owner approval. Never install these roles in production by default.
5. If approved, create separate high-entropy passwords **within a secret manager**, provision those credentials through the authorized DBA process, and keep them outside GitHub, Docker images, browser JavaScript, ChatGPT conversation, and CI logs. For a session pooler, the username normally appends \`.<project-ref>\` to the exact custom login name. Validate the actual dashboard format before enabling.
6. Confirm the issuer's stored session, encrypted provider model, CSRF/consent, and grant registry use **only** the issuer login. Confirm the MCP token verifier uses **only** the restricted grant login; the separate research reader remains read-only and owner-scoped.
7. Perform a staging-only, **non-public connection preflight** with correct CA, correct expected database role, wrong-role refusal, wrong CA refusal, short connection timeout, no persistent session state, and zero credential logging. Do not yet connect ChatGPT or enable publishing.

## Go/no-go

Stage 20 verifies a **connection design and isolated tests**, not a live user connection. Until we have an actual secure staging DB login, real hosted HTTPS issuer, server signing keys and registered client/callback plus two real consenting owners, the **first agent connection remains NO-GO**. All new SQL remains under \`services/orca-owned-oauth\` as **review only**, never under deployed migrations. Release flags remain OFF. Production remains unchanged.

Sources: Supabase [Connect to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement).
