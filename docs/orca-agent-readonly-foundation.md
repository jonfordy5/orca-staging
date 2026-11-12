# ORCA — personal AI connection, Phase 1: read-only account boundary

**Status:** Source and test scaffolding only. **Not deployed. Not connected to ChatGPT.** No ORCA user should see a fake "Connected" indicator. This branch contains no database migrations and makes no account, task, permission, publication, or website changes.

## Why this is the first implementation step

Two independent ORCA users successfully contributed evidence-based RKLB research, but Work's separate browser required repeated logins. The intended consumer path is **sign in to ORCA once → securely connect ChatGPT → request the next assignment**, without users handling credentials or long prompts.

A ChatGPT MCP integration must have its **own OAuth 2.1 authorization-code + PKCE** provider/linking flow that conforms to the OpenAI plugin authentication contract. An existing ORCA Supabase access token **cannot** simply be pasted into ChatGPT or passed as an API key in a prompt. Identical email addresses do not create SSO.

This PR implements only the read-only ORCA-side **account and assignment policy** behind an existing signed-in Supabase JWT. The future OAuth adapter must verify issuer, audience, expiry, revocation, subject and scopes before mapping its authenticated subject to the exact ORCA user session or a securely delegated identity; it must never trust a supplied alias, user UUID or email address.

## What the new code actually does

- `supabase/functions/orca-agent-readonly/index.ts`: proposed Supabase Edge Function, *not deployed*, accepting only **POST**, a verified user JWT and `action: "whoami"` or `action: "my_assignment"`.
- `policy.mjs`: RLS-scoped owner profile lookup and (for a requested stock) exact existing team-membership lookup; calls the deployed owner-scoped `commons_my_claim` and `orca_my_assigned_board` read RPCs. Rejects malformed ticker, expired task, unavailable permission check or board mismatch.
- `supabase/config.toml`: explicitly sets `verify_jwt = true` for **this function only**.
- `scripts/test-orca-agent-readonly.mjs`: tests two action types, invalid identity/ticker, no profile/team/consent, expired tasks, board mismatches, and no write/admin operations.
- GitHub CI executes the tests without contacting Supabase.

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

## What remains before deployment or a "Connect" button

1. Review implementation and tests; get explicit owner approval to deploy **staging only**. Run Supabase advisors and verify the new function's JWT enforcement in the real staging project.
2. Perform two genuine signed-in account tests, plus signed-out and revoked-consent tests, demonstrating that Alice's authorization cannot read Bob's assignments. Inspect responses privately; never publish account IDs or tokens.
3. Build a standards-compliant **OAuth 2.1 + PKCE** authorization server/adapter and a proper MCP server with discovery metadata, per-tool scopes and revocable connection status. Prefer an established identity provider; do not improvise credential exchanges. This is not provided by the read-only Supabase Edge Function.
4. Once OAuth works and account/stock-level access isolation has passed, expose these read-only tools to ChatGPT as **ORCA whoami**, **permissions** and **my assignment**. Real ChatGPT tool-calling requires a separate integration test.
5. Only after that: introduce a scoped **claim exactly once** action and a distinct **publish once** action, with owner's optional per-finding approval, source verification, active lease, existing board/rating contract, idempotent receipts, revocation and rate limits. Do not give an agent trade/broker privileges.
6. Eventually use a single human-facing **Connect Your AI** button with **Pause / Disconnect** in account settings, but these must control real server-side authorization and revocation, not a cosmetic toggle or manually set "connected" flag.

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
