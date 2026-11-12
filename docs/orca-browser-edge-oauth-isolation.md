# ORCA OAuth — website-only Edge Function boundary (draft)

**Status:** Source-only staging proposal. The existing Edge Functions are **NOT redeployed**, no OAuth clients are approved, Supabase OAuth Server is off, and the production backend remains unchanged. This branch is separate from PR #80's database policies and PR #79's read-only OAuth/MCP prototype.

## Why this is necessary

The proposed OAuth token can represent an existing Supabase Auth user. Several ORCA Edge Functions accept that user's bearer, call `auth.getUser(token)`, then use privileged server-side permissions for research synthesis, timeline creation, AI profiles or photo generation. Those functions run outside PostgREST and **do not execute the `pgrst.db_pre_request` guard**. A token restricted in the read-only MCP interface may otherwise reach these site-only endpoints directly.

Read-only examination of the actual Orca-staging deployed functions identified six authenticated, privileged pathways:
- `orca-majority-synthesis`
- `orca-timeline-discovery`
- `orca-timeline-photo-fill`
- `orca-auto-ai-profile`
- `orca-ai-profile-pilot`
- `orca-av-ulta-private-preview`

These function sources had no separate OAuth `client_id` check in their user-authenticated path. **This does not establish existing token misuse**—the OAuth client connection isn't active yet.

## Implementation

- `supabase/functions/_shared/orca-browser-token.ts` adds a small fail-closed guard.
- It accepts a bearer and user ID **only after** the existing Supabase `auth.getUser(sameBearer)` successfully verifies the user's identity. It parses that exact verified JWT, confirms `sub` equals the verified owner ID and role is `authenticated`, then rejects **any** top-level `client_id` (including malformed/null values).
- The six website-only Edge Functions call the guard immediately after successful Auth identity checks and before privileged research or model operations. A rejected linked agent gets an authorization error (or a user-not-authorized result in the pilot function).
- Existing normal ORCA browser JWTs without top-level OAuth `client_id` retain their previous flow. No account permission changes or API budgets are introduced.
- The **read-only** `orca-agent-readonly` Edge Function and future OAuth-aware `orca-agent-mcp` function are explicitly excluded.
- This is an initial deny-all browser-only policy for OAuth clients; later, **separately approved scopes** may permit an agent to use selected generation functions.

## Verification and remaining gates

- Tests use mock JWT payloads to verify browser token allowance and denial for OAuth clients, wrong owner, wrong role and malformed bearer.
- Static checks verify all six source functions authenticate with `auth.getUser` **before** calling the guard.
- GitHub Actions typechecks the shared guard and six existing functions against Deno 2.x, with no deployment or user data.
- **The guard itself does not authenticate signatures**. It must never be called as a substitute for `auth.getUser`; the real ORCA auth check must run on the exact same token first.
- Some deployed function sources were missing from the GitHub tree; this branch imports their previously deployed code for review and adds the guard. **Inspect a clean diff of each function before ever redeploying**.
- Real acceptance still requires separate owner approval to redeploy the six functions to Orca-staging, then testing genuine browser sessions and synthetic/real OAuth client tokens against each endpoint, including errors, no financial/research record changes, and quota/rate controls. OAuth stays disabled until all bypass paths are checked.
- Public/no-user-auth Edge endpoints remain a separate cost-control and abuse-surface review; a bearer-less public endpoint cannot be secured by distinguishing browser JWT from OAuth JWT.

Related: [OAuth tracker #75](https://github.com/jonfordy5/orca-staging/issues/75), [MCP prototype PR #79](https://github.com/jonfordy5/orca-staging/pull/79), [database gateway PR #80](https://github.com/jonfordy5/orca-staging/pull/80).
