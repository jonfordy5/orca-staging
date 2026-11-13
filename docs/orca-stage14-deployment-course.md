# ORCA Stage 14 — course to first live agent connection

**November 13, 2026. Draft PR #83.**  
**Current status: CODE ONLY. No public deployment or live OAuth activation.**

## Chosen architecture

Preserve the existing ORCA GitHub Pages frontend and database. The first staging backend will run separately as a **Dockerized Node 24 HTTPS service with TLS terminated directly in Node**, so the existing ingress can verify a genuinely encrypted socket. Do not trust client-supplied X-Forwarded-Proto headers or place the current Node ingress behind a TLS-terminating proxy without a separately audited secure proxy boundary.

Reserve two distinct real hostnames, selected and controlled by the operator:
- MCP: https://YOUR-MCP-HOST/mcp
- OAuth issuer: https://YOUR-ISSUER-HOST

These are placeholders, not live URLs. GitHub Pages alone cannot host the continuously running Node issuer/MCP service.

## Stage 14A — locked HTTPS shell (BUILT AND CI TESTED)

Repository files:
- services/orca-owned-oauth/mcp-sdk/Dockerfile.staging
- services/orca-owned-oauth/mcp-sdk/locked-https.mjs
- services/orca-owned-oauth/mcp-sdk/run-locked-staging.mjs
- services/orca-owned-oauth/mcp-sdk/compose.locked-staging.yml
- .github/workflows/orca-locked-https-container.yml

The image runs as non-root Node with no private keys baked in, under a read-only filesystem with dropped capabilities when using the provided Compose configuration. Only HTTPS GET /healthz can return 200, with the deliberately limited response:

~~~json
{"service":"orca-mcp-staging","status":"locked"}
~~~

MCP, protected-resource metadata and OAuth discovery all return 503. Changing ORCA_MCP_ENABLED or ORCA_OWNED_ISSUER_ENABLED to true is rejected at startup; no environment switch can enable OAuth in this container.

### Operator prerequisites — not yet available

1. Select a Docker-capable server/VPS controlled by the operator, with a default-deny firewall, monitoring and backups. Obtain real DNS for the MCP host; reserve a distinct issuer hostname.
2. Obtain a publicly trusted TLS certificate matching the MCP hostname. Store its private key and certificate only in a restricted server-side secret mount. Never commit them to GitHub, bake them into an image, or paste credentials into chat. Ensure the non-root container user can read the mounted files, and arrange renewal.
3. Confirm actual HTTPS public ingress and a safe deployment/rollback process. This initial Docker Compose template binds to **127.0.0.1:8443 only**; do not casually expose it on a public interface.
4. Keep both release gates OFF until the full issuer, database, signed client and acceptance work is complete.

### Local-only deployment rehearsal

On the chosen host, create a non-secret environment file at a path outside the repository using the real approved domain values:

~~~dotenv
ORCA_SECRETS_DIR=/absolute/private/path/orca-tls
ORCA_ISSUER_ORIGIN=https://YOUR-ISSUER-HOST
ORCA_MCP_RESOURCE=https://YOUR-MCP-HOST/mcp
~~~

Place the host's key.pem and cert.pem in ORCA_SECRETS_DIR. From the repository root:

~~~bash
docker compose --env-file /path/to/local-staging.env \
  -f services/orca-owned-oauth/mcp-sdk/compose.locked-staging.yml config --quiet

docker compose --env-file /path/to/local-staging.env \
  -f services/orca-owned-oauth/mcp-sdk/compose.locked-staging.yml up -d --build
~~~

Verify **HTTPS /healthz = 200 and status=locked**. Verify **/mcp, / .well-known OAuth protected-resource, and issuer endpoints are unavailable**. Use full certificate verification on any actual public host. Test-only -k/certificate bypass is never proof of production TLS.

Only after a security review should the operator create a separately reviewed direct-TLS public-port binding for port 443. The existing GitHub Pages site stays unchanged.

## Stage 15 — real OAuth issuer and human consent (NOT DONE)

- Deploy maintained oidc-provider code behind real HTTPS with operator-managed ES256 keys and public JWKS; do not improvise a new OAuth implementation.
- Configure the actual Supabase Auth getUser check and owner-scoped opt-in profile on every consent action. Use opaque encrypted server-side browser sessions; never pass the Supabase bearer to ChatGPT.
- Provision the reviewed private OAuth schema with least-privilege DB roles, real durable state and atomic PKCE/CSRF/consent storage, after backups and security audit. All current schema files are review-only.
- Obtain the exact ChatGPT OAuth client ID and callback/redirect URI from the real connector management flow. Enforce exact resource audience, authorization code + PKCE S256, and real issuer identification.
- Confirm token rotation and immediate revocation, without creating new researcher identities or changing consent/publishing permissions.

## Stage 16 — first live read-only MCP connection (NOT DONE)

- Provision and verify the NO-BYPASSRLS, SELECT-only owner-scoped database reader; never use Supabase service_role for this interface.
- Connect the official MCP SDK to that private reader and real, currently authorized OAuth grants.
- Expose only orca_whoami and orca_my_assignment; no claiming, publishing, account management or team joining.
- Test with two different **real, consenting** ORCA researchers. Verify correct aliases, memberships, assignments and deadlines; prohibit cross-account reads.
- Revoke one already-issued access grant, then demonstrate that the same previously valid token is denied **before any database read**.
- Confirm wrong issuer/client/audience, forged signature, expired token, bad callback, revoked consent and write/RPC bypass attempts are denied.
- Regression-test the ORCA GitHub Pages login/workspaces and preserve existing researchers, assignments and findings.

## GO / NO-GO

GO only after verified public HTTPS, independently reviewed issuer and MCP, exact registered client/callback, valid private database roles, two-live-account owner isolation, confirmed revocation, monitoring, backup, rate limiting and an explicit decision to activate a **separate staging pilot**.

Otherwise NO-GO: keep the locked server and OAuth off. Do not merge the draft PR as a shortcut.

## Rollback

Replace the live MCP service with the Stage 14 locked container or stop exposure, revoke private OAuth grants, disable issuer approval/token endpoints and block the firewall. Rotate leaked credentials if necessary. Preserve the existing ORCA frontend and research data. Restore later-approved database changes only from a reviewed data-preserving backup plan.

**Definition of done:** a real ChatGPT agent discovers ORCA over HTTPS, the human signs in as their existing ORCA researcher and explicitly consents to read-only access, the agent retrieves that researcher's existing assignment, and revoking access immediately blocks the previously valid token.
