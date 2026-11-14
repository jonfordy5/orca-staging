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


## Stage 15 — automated deployment preflight (BUILT, TESTED; no public host yet)

Run the checks from the official MCP SDK repository package. These are **unauthenticated read-only GET/POST probes**, never a login and never a research query. They use Node's normal HTTPS certificate validation. A passing result does not activate OAuth and is not permission to publish the endpoint.

Set `ORCA_MCP_RESOURCE` and `ORCA_ISSUER_ORIGIN` on the operator's machine to the two real approved HTTPS URLs, with different hostnames. Do **not** use test-only example URLs, local IPs, service-role secrets, client passwords or tokens. The resource URL must end in `/mcp`.

```bash
cd services/orca-owned-oauth/mcp-sdk
npm ci --ignore-scripts --no-audit --no-fund
node deployment-preflight.cli.mjs --mode locked
```

**Locked mode** requires public HTTPS `/healthz` to return `200` with `status=locked` while `POST /mcp` and `GET /.well-known/oauth-protected-resource/mcp` each return `503`. The output is `blocked` if the TLS certificate is untrusted, host/DNS is wrong, the response redirects, or a protected route unexpectedly becomes accessible. The existing loopback-only Compose template is not externally reachable; the operator must first provision and review real public host connectivity before this public-URL check can pass. Do not bypass TLS verification with `-k` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.

After the **separately reviewed** real issuer and MCP service exist, run:

```bash
node deployment-preflight.cli.mjs --mode oauth-discovery
```

**OAuth-discovery mode** requires exact RFC 9728 MCP protected-resource metadata, the `401` `WWW-Authenticate` challenge, exact read-only scope `orca:research.read`, an issuer with authorization-code and PKCE S256 metadata, and a same-issuer public ES256 JWKS without private signing material. This is **not** a full OAuth login test. Even a passing result sets `publicDeploymentAuthorized=false`; it does not verify human consent, real Supabase authentication, private database roles, registration of the actual ChatGPT callback, or two real consenting research accounts.

Implementation: `mcp-sdk/deployment-preflight.mjs`, `.cli.mjs`, and `.test.mjs`. The preflight tests are exercised by the official MCP CI suite. If a probe fails, fix the actual host/issuer configuration rather than weakening the checks. Keep the issuer and MCP release gates OFF until the real acceptance criteria above are met.


## Stage 16 — operator-approved public locked HTTPS pilot

**Prepared in draft code; NOT deployed.** This uses a distinct, manually selected Compose file, never an automatic GitHub Actions deployment. The public locked-only build still makes `/mcp` and authorization discovery return 503. It does not connect a real ChatGPT agent.

### Before publishing TCP 443

Choose and control the actual VPS and two separate public DNS names, as described above. Confirm the provider-level firewall allows only approved management access and TCP 443 for this staging service. **Docker port publishing can bypass some host firewall rules; use the provider/cloud firewall or audited DOCKER-USER rules.** There must be no public Supabase database port or issuer service accidentally reachable. Obtain a real publicly trusted certificate and renew it without writing private keys to GitHub, the container image, logs or chat.

Prepare a restricted directory holding **key.pem** and **cert.pem**, readable by the non-root Node container UID **1000**. The private key should not be readable by other users. Certbot-managed live symlinks may not be directly usable as a read-only mount; copy the renewed PEMs into the restricted mount with an audited deploy hook and restart only after validating both files.

From repository root, place the following in a **private operator-host file**, replacing placeholders with real values:

```dotenv
ORCA_SECRETS_DIR=/absolute/restricted/orca-certs
ORCA_MCP_RESOURCE=https://APPROVED-MCP-HOST/mcp
ORCA_ISSUER_ORIGIN=https://APPROVED-DIFFERENT-ISSUER-HOST
ORCA_PUBLIC_LOCKED_DEPLOY_ACK=I_APPROVE_PUBLIC_LOCKED_TLS_ONLY
```

Use the Stage 16 private certificate preflight first. It requires the DNS SAN, key pair and at least 14 remaining days of certificate validity, and intentionally **does not** claim to validate a public CA chain:

```bash
cd services/orca-owned-oauth/mcp-sdk
npm ci --ignore-scripts --no-audit --no-fund
set -a; . /path/to/private/staging.env; set +a
node host-tls-preflight.cli.mjs
cd ../../..
```

Only after confirming the actual host/firewall/DNS/TLS and getting the operator's explicit approval for a **public locked-only pilot**, use the separate Compose file:

```bash
docker compose --profile public-locked --env-file /path/to/private/staging.env \
  -f services/orca-owned-oauth/mcp-sdk/compose.public-locked.yml config --quiet
docker compose --profile public-locked --env-file /path/to/private/staging.env \
  -f services/orca-owned-oauth/mcp-sdk/compose.public-locked.yml up -d --build
```

That intentionally maps public TCP **443 to container 8443**, with direct HTTPS termination in Node and the deployment acknowledgement enforced at startup. **Do not combine it with the localhost Compose file.** Run the certificate-trusting remote preflight from a separate operator computer (not `curl -k`):

```bash
cd services/orca-owned-oauth/mcp-sdk
ORCA_MCP_RESOURCE=https://APPROVED-MCP-HOST/mcp \
ORCA_ISSUER_ORIGIN=https://APPROVED-DIFFERENT-ISSUER-HOST \
node deployment-preflight.cli.mjs --mode locked
```

A pass requires valid public HTTPS plus locked health=200, `/mcp`=503 and protected-resource metadata=503. It is **not** permission to activate agents. No OAuth keys, private database roles, connected ChatGPT clients or real human consent are supplied by this package.

### Public pilot rollback

On the operator host, remove just the locked public pilot using its dedicated Compose manifest:

```bash
docker compose --profile public-locked --env-file /path/to/private/staging.env \
  -f services/orca-owned-oauth/mcp-sdk/compose.public-locked.yml down
```

Then close public 443 for this service in the provider firewall, inspect logs without exposing secrets, and leave the existing ORCA Pages and Supabase research records untouched. Only a separately reviewed Stage 17 issuer/MCP activation flow can change the locked behavior.
