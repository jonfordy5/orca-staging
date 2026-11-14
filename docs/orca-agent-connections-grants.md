# ORCA Connect Your AI — owner-controlled grant management (draft)

**Status: CODE COMPLETE, PR UNMERGED, NO LIVE OAUTH OR AUTH CONFIG CHANGES.**

This milestone adds a minimal, real provider-backed **AI Connections** page and user-initiated **Disconnect** action. It uses the exact user-scoped Supabase Auth OAuth grant APIs. No new user identities, team membership changes, research permission toggles, task claims, published findings, API secrets or broker access are introduced.

## Purpose and user experience

Before connecting, ORCA presents a simple owner-only status page. Once Supabase's OAuth 2.1 server is safely enabled and a real authorization has been granted, the same page will show **applications authorized by this user's ORCA account**, with the client's name, granted scopes and date. The page does *not* infer a live background AI from an authorized grant, and does not claim a ChatGPT link merely because an application has a similar name.

Clicking **Disconnect** opens a separate confirmation; **Confirm Disconnect** invokes Supabase Auth's `oauth.revokeGrant({clientId})` for the selected ID returned by `oauth.listGrants()`. The page fetches the authoritative grant list again; only after the selected client disappears does it report authorization successfully revoked. Errors, malformed responses, another signed-in user, and a grant still present after revocation all fail closed.

- `agent-connections.html` is a small, dark ORCA staging page with no other enable/disable buttons.
- `agent-grant-control.mjs` contains pure, testable grant parsing, owner-list and revoke logic.
- `connect-work.html` links to this one page from the existing advanced settings. It does not replace the current Work copy-prompt process.
- `account.html` allowlists `agent-connections.html` as one additional **exact relative return target** so users can sign into their existing ORCA account and continue without open redirects.
- A disabled/unavailable OAuth API shows **unavailable**, not a misleading **not connected**, **connected**, or **disconnected** state.
- All provider-originated labels are written with `textContent`, never inserted as HTML or navigation links. Only authenticated owner-generated grant IDs, not URL/query values, can be revoked.
- There is no token printing, raw JWT parsing, storage modification, local connection flag, or implicit OAuth consent.

## Provider contracts verified against current Supabase JS source

The official `@supabase/auth-js` TypeScript interfaces declare:

```ts
client.auth.oauth.listGrants(): Promise<AuthOAuthGrantsResponse>
client.auth.oauth.revokeGrant({ clientId: selectedClientId }): Promise<AuthOAuthRevokeGrantResponse>
```

`AuthOAuthGrantsResponse.data` is an array of `{ client: { id, name, uri, logo_uri }, scopes: string[], granted_at: string }`. The `client_id` in the revoke call is sourced only from that response. We deliberately **do not** copy the older incorrect examples that call `revokeGrant(clientId)` with a positional string or expect flat grant records.

Source: [Supabase auth-js OAuthGrant types](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/lib/types.ts) and [GoTrueClient implementation](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueClient.ts).

**Pinned-version verification:** the exact `@supabase/supabase-js@2.119.0` package used by the new page was verified against its published [v2.119.0 auth-js GoTrueClient source](https://github.com/supabase/supabase-js/blob/v2.119.0/packages/core/auth-js/src/GoTrueClient.ts), which exposes both `oauth.listGrants` and `oauth.revokeGrant`. No runtime OAuth network request was made.

## Tests

- `scripts/test-orca-agent-connections.mjs` covers malformed lists, duplicate clients, owner-only selection, no third-party client ID from URLs, account-switch clearing, incomplete provider responses, exact `{clientId}` argument, failure when the list cannot be fetched, failure when revocation is rejected or not verified, no UI markup injection, source integrity and new sign-in allowlist.
- `.github/workflows/orca-agent-connections.yml` runs Node 24 grant tests and syntax checks on this branch.
- The normal ORCA shared-site regression workflow also runs on draft pull requests; the page and link modifications must not break existing research or account behavior.

## Security and launch limitations

**Disconnect is not a kill switch for currently issued JWTs.** Supabase revokes the grant and invalidates its associated sessions and refresh tokens, but a bearer already issued can remain valid until expiration unless a server validates session/grant revocation on every sensitive request. The UI makes this distinction visible. **A true immediate Disconnect guarantee remains a separate blocker to public launch.** Design that verification with the live OAuth issuer; do not claim instant token invalidation based only on the grant list.

**OAuth is deliberately NOT enabled by this PR.** The native Supabase OAuth authorization-server discovery still returns 404 in staging, and upstream [RFC 8707 audience binding PR #2894](https://github.com/supabase/auth/pull/2894) is unmerged as of Nov 12, 2026. No authorization code, OAuth access token, refresh token or revocation has been generated or sent from either real researcher account in these code-only tests. The OAuth connect button must remain a placeholder until an actual issuer, callback and resource-bound token work together.

## Future acceptance

1. Merge this UI-only PR into staging after CI approval. When OAuth is disabled, the page will show an unavailable state rather than false connection status.
2. Test both existing browser sessions; each sees only its own genuine grants once OAuth is available.
3. Confirm the user explicitly approves a real ChatGPT OAuth client, with a vetted exact client ID and callback. Verify MCP audience, expiry, subject isolation, and direct API write denial.
4. Connect and read two accounts' own profiles and assignments; do not claim or publish.
5. Revoke one grant and verify no refresh or reauthorization can proceed without new consent; verify immediate MCP/Data API handling of an already-issued access token before advertising Disconnect as immediate.
6. Keep production unchanged until staged release gates pass.

Relevant PRs: #79 (read-only MCP/OAuth consent), #80 (staging Data API guard, active), #81 (six staging Edge function browser-only OAuth guards, deployed).
