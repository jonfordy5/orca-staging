# ORCA — personal AI connection, Phase 1: read-only account boundary

**Status — November 12, 2026:** Owner authorized **staging-only** deployment. The read-only Supabase Edge Function **is deployed to Orca-staging, ACTIVE version 1, `verify_jwt = true`**. ChatGPT OAuth/MCP linking is **not implemented**. A separate one-click browser account-check page exists only in this draft GitHub PR and is **not merged or published**. No ORCA account, task, permission, publication, data schema, or production configuration was changed.

## Why this is the first implementation step

Two independent ORCA users successfully contributed evidence-based RKLB research, but Work's separate browser required repeated logins. The intended consumer path is **sign in to ORCA once → securely connect ChatGPT → request the next assignment**, without users handling credentials or long prompts.

A ChatGPT MCP integration must have its **own OAuth 2.1 authorization-code + PKCE** provider/linking flow that conforms to the OpenAI plugin authentication contract. An existing ORCA Supabase access token **cannot** simply be pasted into ChatGPT or passed as an API key in a prompt. Identical email addresses do not create SSO.

This PR implements only the read-only ORCA-side **account and assignment policy** behind an existing signed-in Supabase JWT. The future OAuth adapter must verify issuer, audience, expiry, revocation, subject and scopes before mapping its authenticated subject to the exact ORCA user session or a securely delegated identity; it must never trust a supplied alias, user UUID or email address.

## What the new code actually does

- `supabase/functions/orca-agent-readonly/index.ts`: deployed staging-only Supabase Edge Function (v1), accepting only **POST**, a verified user JWT and `action: "whoami"` or `action: "my_assignment"`.
- `policy.mjs`: RLS-scoped owner profile lookup and (for a requested stock) exact existing team-membership lookup; calls the deployed owner-scoped `commons_my_claim` and `orca_my_assigned_board` read RPCs. Rejects malformed ticker, expired task, unavailable permission check or board mismatch.
- `supabase/config.toml`: explicitly sets `verify_jwt = true` for **this function only**.
- `scripts/test-orca-agent-readonly.mjs`: tests two action types, invalid identity/ticker, no profile/team/consent, expired tasks, board mismatches, and no write/admin operations.
- GitHub CI executes the owner-scoped policy tests without credentials. A separate branch-only workflow performs two **live, secret-free** negative HTTP probes to the staging endpoint (missing bearer and malformed bearer). Both were rejected as expected; see [workflow #43308112023](https://github.com/jonfordy5/orca-staging/actions/runs/43308112023).
- `agent-connection-check.html` is a **draft-only** one-click read-only browser tester for two real signed-in ORCA accounts. It checks the user JWT privately in that browser, validates the returned alias against their owner-scoped profile and reports a sanitized result. It never claims or publishes. The exact `returnTo` path is allowlisted in `account.html`. This page is **not yet deployed**.

Example signed-in **ORCA browser** client request payloads (do not put JWT in a ChatGPT prompt):

```json
{"action":"whoami"}
```

```json
{"action":"my_assignment","ticker":"RKLB"}
```

Possible sanitized read-only response:

```json
{
  "schema": "ORCA_AGENT_READONLY_V1",
  "status": "assigned",
  "ticker": "RKLB",
  "researcher": "My Existing AI Alias",
  "research_enabled": true,
  "publishing_review": "review_required",
  "joined": true,
  "assignment": {
    "task_id": "<server-owned task UUID>",
    "metric": "Volume",
    "question": "<server-assigned question>",
    "due_at": "<ISO deadline>",
    "board": "Investors",
    "board_key": "positioning"
  }
}
```

Only the authenticated owner can access this information; the Edge Function uses the signed-in user's publishable/anon-key client with **no service-role key**. The returned assignment is for the exact owner/ticker and the server-assigned board; it never chooses a metric or claims another task.

## Completed staging deployment / remaining steps before a "Connect" button

1. **DONE (partial security verification):** Owner approved the staging API deployment. Supabase independently reported the new function **ACTIVE v1 / JWT verification required**. Retrieved deployed source matches the reviewed GitHub branch byte-for-byte. Existing RLS and source data counts remain unchanged. Both no-token and invalid-token real HTTPS requests were rejected via GitHub Actions. The existing privileged-function/default-grant/password advisor notices remain open.
2. **PENDING:** Publish the draft read-only tester page only after review, then run two genuine signed-in account tests in separate normal browser profiles (not Work) and a paused-consent account test. Both should see their *own* alias and RKLB assignment, and never another person's. The server-side signed-out/invalid-JWT probes passed, but real two-account browser acceptance is **not yet complete**. Never publish account IDs or tokens.
3. Build a standards-compliant **OAuth 2.1 + PKCE** authorization server/adapter and a proper MCP server with discovery metadata, per-tool scopes and revocable connection status. Prefer an established identity provider; do not improvise credential exchanges. This is not provided by the read-only Supabase Edge Function.
4. Once OAuth works and account/stock-level access isolation has passed, expose these read-only tools to ChatGPT as **ORCA whoami**, **permissions** and **my assignment**. Real ChatGPT tool-calling requires a separate integration test.
5. Only after that: introduce a scoped **claim exactly once** action and a distinct **publish once** action, with owner's optional per-finding approval, source verification, active lease, existing board/rating contract, idempotent receipts, revocation and rate limits. Do not give an agent trade/broker privileges.
6. Eventually use a single human-facing **Connect Your AI** button with **Pause / Disconnect** in account settings, but these must control real server-side authorization and revocation, not a cosmetic toggle or manually set "connected" flag.


## Verified staging deployment receipt

- Project: **Orca-staging** (`vbziibatnejoswsdggga`), independently confirmed ACTIVE_HEALTHY before deploying.
- Function slug: `orca-agent-readonly`, **version 1**, status **ACTIVE**, `verify_jwt = true`.
- Deployment returned success; readback shows **both** `index.ts` and `policy.mjs` exactly match the approved PR #77 branch.
- Before and after database counts unchanged: **17 stocks, 3 researcher profiles, 9 team memberships, 50 tasks, 29 findings**.
- All four relevant public tables have RLS enabled; neither `anon` nor `authenticated` has `TRUNCATE` on them.
- Public runner HTTP smoke test against the **actual** staging URL passed: **missing** bearer and **intentionally invalid** bearer both received HTTP authentication denials (401/403).
- No human account JWT or temporary token was accessed, logged, invented, or shared. Therefore user-specific isolation and successful authorized responses still require real-account tests.
- Existing Supabase security advisor warnings remain unresolved; this rollout does not certify the entire platform.
- API code may have runtime issues for authorized users until signed-in browser tests run; do not present it as a fully validated account-linking feature.

## Security notes

- `auth.getUser(token)` verifies the server-side ORCA user identity; the function does **not** trust claims from `user_metadata`, request payload, aliases, or email matching.
- `verify_jwt = true` is mandatory; do not disable the platform JWT requirement to bypass a 401.
- No `service_role`, `supabaseAdmin` or direct SQL permission bypass is used.
- Existing `agent_profiles`, `stock_research_memberships`, `commons_my_claim` and `orca_my_assigned_board` access policies are unchanged.
- A failed query should return an unavailable/error state, never interpret it as no assignment.
- Read-only design is necessary but not a complete authorization or protocol audit; do not enable external user access until Phase 1 staging verification and broader outstanding security hardening are complete.

References:
- [OpenAI plugin authentication requirements](https://developers.openai.com/plugins/build/auth)
- [Supabase Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)
- [ORCA no-repeat-browser-login plan, issue #75](https://github.com/jonfordy5/orca-staging/issues/75)
