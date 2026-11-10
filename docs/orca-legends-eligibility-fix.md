# Vault eligibility integration correction

The completed RKLB research did not need to be repeated. The public game selected **and filtered** `commons_research_findings.contributor_id`, but the authenticated API role deliberately lacks SELECT permission on that ownership column. PostgREST rejected the request; the catch block discarded the error and displayed a generic contributor denial. The earlier alias correction could not repair this permission boundary.

Read-only staging inspection confirmed the reported RKLB publication at `2026-11-10T05:53:29.125927Z` (November 9, 11:53 PM Central), its completed assignment, opted-in owner, ORCA-R4 BUY marker and HTTPS source. It remains unexpired. The live game assets matched the latest prior commits, so a missing deployment was not the primary fault.

## Correction

- `public.orca_legends_access()` is a no-argument, authenticated-only read RPC. A private, fixed-search-path helper derives the owner from `auth.uid()` and checks the owner's opted-in profile and accepted source-backed publication joined to its completed assignment. Mutable aliases do not establish ownership.
- The RPC returns only `{allowed,status,ticker}`. It neither exposes private ownership IDs nor grants browser SELECT on `contributor_id`. Existing research table grants, RLS policies, rows, assignments and permissions remain unchanged. New execute permissions apply only to the new self-scoped functions. The SQL was applied to staging project `vbziibatnejoswsdggga`; production is untouched.
- The browser verifies its identity with `getUser()` and calls the RPC without an owner or alias argument. Authentication failures, disabled permission, missing profile/contribution, and service errors have separate useful statuses. Backend failures do not ask the user to repeat research.
- The game uses the same project/default session storage and refresh behavior as the account page. Rechecks run on auth changes and returning to the tab, with SDK auth callbacks deferred outside its lock. Concurrent stale checks cannot overwrite a later identity check.
- An allowlisted account return route sends the verified sign-in back to The Vault, which checks eligibility automatically. Other account destinations are preserved; external return URLs remain disallowed.
- Versioned entry/import URLs avoid the old JavaScript module cache during rollout. Artwork, combat, dungeon geometry and research boards are unchanged.

`sql/orca_legends_contributor_access.sql` is the applied function definition. The elevated helper is in an unexposed private schema; the public wrapper is SECURITY INVOKER, and anonymous execute is revoked. Postmigration advisors introduced no new eligibility-function warning.

## Verification boundaries

Real staging data was checked under an authenticated SQL role with transaction-local JWT subject claims in a read-only transaction, then rolled back. The legitimate owner qualifies; a different existing opted-in owner without accepted research does not; a missing JWT subject is denied. The private ownership column remains unreadable to the API role. Anonymous requests to the actual staging RPC return HTTP 401 / `42501`.

The owner has an earlier accepted NVDA contribution too, so the RPC can return NVDA as the first qualifying expedition. The reported RKLB record was independently verified against the same predicate; an earlier mission does not invalidate it.

`scripts/test-orca-legends-access.sql` reproduces the real-data role-context checks. `scripts/test-orca-legends-access.mjs` tests the runtime auth/RPC contract. `scripts/test-orca-legends-access-browser.cjs` uses the shipped SDK and actual game/account modules with isolated synthetic Auth/RPC HTTP responses to exercise sign-in return, refresh, denials, Recheck, Enter and the 3D scene. Those simulated browser sessions are **not** the owner's real login.

A real authenticated owner browser session was unavailable in this workspace. That final user-session confirmation remains distinct from the successful real-data server authorization and browser integration tests. No passwords, tokens or new assignments are required for troubleshooting; sign in through the existing account page in the same browser/profile as the Vault.

Observed checks before deployment: 25 Node tests, 12 public-origin browser integration groups, and 50 existing research-workspace assertions passed. Browser checks cover the actual shipped SDK session refresh and account-to-Vault return, as well as Recheck enabling Enter and loading the real 3D game. The GitHub staging workflow runs these alongside the existing game and research regressions before publishing.
