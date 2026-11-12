# PR #81 — staging-only Edge OAuth protection rollout

**Status:** Reviewed/source-only, not deployed or merged. User asked to continue building; no additional live-function rollout authorization is implied. Only project `vbziibatnejoswsdggga` (Orca-staging) may be targeted in the next explicitly approved deployment. The production project `hsgfwsghxdcgpjlekfqf` is out of scope.

## What this prevents

A linked read-only OAuth token is a legitimate user bearer and may otherwise be accepted by existing Edge Functions, which can invoke privileged service-role operations that are **outside** PostgREST's now-active pre-request filter. PR #81 adds a browser-only token gate after the *same bearer* is verified with `auth.getUser(token)`.

**Six actual deployed staging functions were compared to the proposed branch code.** No feature or business-logic change is intended beyond the new import and the OAuth client-denial guard. All six functions still require their original user permission, source, budget and consent checks.

| Function | Staging version at review | Existing gateway JWT verification | Guard placement |
|---|---:|---|---|
| `orca-majority-synthesis` | 6 | off; manually verifies Auth | immediately after `auth.getUser`, before synthesis |
| `orca-timeline-discovery` | 19 | off; manually verifies Auth | immediately after `auth.getUser`, before generation |
| `orca-timeline-photo-fill` | 47 | off; manually verifies Auth | immediately after `auth.getUser`, before photo lock |
| `orca-auto-ai-profile` | 17 | off; manually verifies Auth on refresh | immediately after refresh-path `auth.getUser`; public cached reads unchanged |
| `orca-ai-profile-pilot` | 7 | on | inside `checkUser`, after Auth and before profile lookup |
| `orca-av-ulta-private-preview` | 5 | on | immediately after `auth.getUser`, before quota reservation |

**Do not change `verify_jwt` settings during this rollout.** Functions using explicit Auth validation have known historical gateway configurations; preserving them avoids bundling unrelated changes.

## Pre-deployment gates

1. Re-run focused browser-token unit tests, authorization-order regression tests, full website regressions and the strict Deno typecheck of the shared helper. Legacy functions have pre-existing TypeScript errors: `deno info` checks their imports, **not** clean strict typecheck. Do not hide that limitation.
2. Before each deployment, **retrieve the currently deployed source** and compare with PR #81's proposed file, subtracting only its extra import and guard. If any underlying business logic drifted since this review, stop and reconcile first. The listed live versions are **observations, not evergreen locks**.
3. Save each currently deployed `index.ts` (plus metadata/`verify_jwt`) privately as a rollback snapshot, with no secrets printed or copied into chat, before replacing it.
4. Confirm each function's shared-module bundle includes `../_shared/orca-browser-token.ts`; verify that an existing function's other files and environment/secrets remain as currently configured.
5. Deploy to **Orca-staging only**, ideally one function per deployment rather than all six at once. Preserve the existing `verify_jwt` value for each, and check the returned version and complete deployed file readback.

## Post-deployment acceptance

- A **signed-out** call to each existing privileged route must fail to authorize without invoking an OpenAI request, paying for a search, writing a profile, claiming any research task, or consuming quota.
- A **valid signed-in website session** must retain its *previous* behavior and authorization. Test safely with no-cost dry-run/read-only paths or known invalid request bodies where possible; a publishing/generation test requires separate explicit approval.
- A bearer representing an approved OAuth client must be **rejected by each of the six website-only functions before any privileged work**. No real client is currently approved. Use synthetic tokens only against isolated test servers; live OAuth bearer tests await genuine token issuance.
- Verify the MCP read-only candidate and existing `orca-agent-readonly` API remain independent of this guard.
- Verify the staging stock count, researcher profiles, memberships, tasks, published findings, and research-cost controls unchanged.
- Review latest Supabase security advisors and any new function errors. Verify normal researcher account-check page still passes for both existing accounts.

## Rollback / stop rules

If any existing browser function breaks or function changes unexpectedly, immediately restore its exact pre-deployment source and JWT configuration from the private snapshot, confirm it is active, then recheck the site. Do **not** revoke real users, reset their consent, modify database policies, reissue tokens or delete findings as a workaround. Stop the sequence; do not continue redeploying the other functions.

**No automatic merge or deployment:** The owner must separately approve staging rollout of these six Edge Functions. Production deploy or OAuth-server activation is a later, independent decision.

## After PR #81 rollout

- **PR #79** remains the read-only MCP + OAuth consent prototype.
- **PR #80** has its staging database policies and global API guard active, but its optional OAuth audience hook and registered clients are still disabled.
- **OAuth RFC 8707 audience binding is an external compatibility gate.** As of Nov 12, upstream Supabase Auth [issue #2610](https://github.com/supabase/auth/issues/2610) and [PR #2894](https://github.com/supabase/auth/pull/2894) remain open; do **not** weaken the MCP audience requirement to skip this gate. A tested compatible issuer path is required before ChatGPT can genuinely connect.
- Once OAuth works, verify Connect / explicit consent / read-only researcher data / token expiry / Disconnect and revocation with both real accounts. Claim and publish scopes come later under additional review.
