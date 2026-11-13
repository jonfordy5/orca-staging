# PR #81 — staging-only Edge OAuth protection rollout

**Status: SIX STAGING EDGE FUNCTIONS DEPLOYED; PR STILL DRAFT/UNMERGED.** On November 12, 2026, the owner explicitly approved rolling out PR #81 to only `Orca-staging` (`vbziibatnejoswsdggga`), keeping OAuth off and production (`hsgfwsghxdcgpjlekfqf`) untouched. No other Auth, API, database, task or publication permissions changed.

## Authorized staging deployment and verification receipt — Nov 12, 2026

**Scope authorized:** redeploy the six listed existing staging functions individually with only PR #81's browser-only OAuth guard. Keep each original `verify_jwt` flag, all business logic and external API budgets, and production untouched.

**Before each deployment**, retrieved its live source and verified byte-for-byte that removing only the PR #81 helper import and added guard recreated the exact previous live `index.ts`. Each previously deployed function consisted of one `index.ts`; existing `verify_jwt` values were recorded and preserved. This makes the prior source reconstructable from the reviewed Git branch without retaining an actual user's credentials. No keys were logged.

**Deployed individually and then read back each complete function:**

| Function | Original version | New active version | JWT setting retained |
|---|---:|---:|---|
| `orca-ai-profile-pilot` | 7 | **8** | true |
| `orca-av-ulta-private-preview` | 5 | **6** | true |
| `orca-majority-synthesis` | 6 | **7** | false |
| `orca-auto-ai-profile` | 17 | **18** | false |
| `orca-timeline-discovery` | 19 | **20** | false |
| `orca-timeline-photo-fill` | 47 | **48** | false |

Every Supabase deployment returned `ACTIVE`, and the follow-up `get_edge_function` confirmed the exact reviewed `index.ts` and byte-identical shared `_shared/orca-browser-token.ts` code, with the JWT flag unchanged. No new function was introduced.

**After installation:**
- The original SQL baseline was unchanged: **17 stocks, 3 researcher profiles, 9 team memberships, 50 tasks, 29 published findings**.
- The approved OAuth client registry remained **empty**, and PostgREST's existing `pgrst.db_pre_request` security gate remained enabled.
- The live read-only smoke [GitHub Actions #43335403345](https://github.com/jonfordy5/orca-staging/actions/runs/43335403345) passed: all six endpoints returned **HTTP 204** to harmless CORS OPTIONS; the five functions safely queried without credentials rejected signed-out GET/POST with **HTTP 401 or 403**. The auto-profile function's potentially public/cached endpoint was only tested with OPTIONS; no paid generation/request was attempted.
- Focused OAuth source/security regression [#43335403230](https://github.com/jonfordy5/orca-staging/actions/runs/43335403230) passed.
- These checks prove deployment availability, no-credential denial and source consistency. They **do not** prove that an actual connected OAuth access token is denied (no OAuth client is enabled), nor that users can still perform every signed-in paid function. Real authenticated browser acceptance remains to be performed.

**Rollback:** If a function's legitimate browser behavior breaks, retrieve the exact proposed branch source, remove only the added top-level guard import and the corresponding single guard call (restore original whitespace), and deploy the resulting **byte-identical former live `index.ts`** with its original `verify_jwt` flag. Check the version/readback and no-token behavior. Stop and investigate before restoring other functions; no account or research data modifications are needed. The original six function version numbers and source sizes were verified before deployment.

**No merge, no OAuth activation:** PR #81 remains DRAFT. Supabase OAuth Server is disabled, no client is registered or approved, and PR #79's MCP OAuth endpoint is still not deployed. This is a staging-only deployment milestone.

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

**No automatic merge or wider deployment:** The owner approved and the six-function staging rollout described above is complete. PR #81 has not been merged, and production deploy or OAuth-server activation remains a later, independent decision.

## After PR #81 rollout

- **PR #79** remains the read-only MCP + OAuth consent prototype.
- **PR #80** has its staging database policies and global API guard active, but its optional OAuth audience hook and registered clients are still disabled.
- **OAuth RFC 8707 audience binding is an external compatibility gate.** As of Nov 12, upstream Supabase Auth [issue #2610](https://github.com/supabase/auth/issues/2610) and [PR #2894](https://github.com/supabase/auth/pull/2894) remain open; do **not** weaken the MCP audience requirement to skip this gate. A tested compatible issuer path is required before ChatGPT can genuinely connect.
- Once OAuth works, verify Connect / explicit consent / read-only researcher data / token expiry / Disconnect and revocation with both real accounts. Claim and publish scopes come later under additional review.


## November 12 follow-up: two additional website-only endpoint guards (code only)

The OAuth threat-surface review found two **additional** existing staging Edge Functions that should not accept the linked read-only agent's bearer. Both are now protected in PR #81 **SOURCE ONLY; THEY HAVE NOT BEEN DEPLOYED**:

| Function | Current live version | `verify_jwt` to retain | Added guard | Why |
| --- | ---: | --- | --- | --- |
| `orca-stock-discovery` | **5** | `false` | On authenticated POST, immediately after `admin.auth.getUser(token)` | Stops a linked AI bearer from using a service-role stock-registration upsert |
| `orca-unsplash-photo-pilot` | **1** | `true` | On GET, after `supabaseAuth.auth.getUser(token)`, before Unsplash key or HTTP request | Stops OAuth-bearer consumption of the browser-only photo-search API quota |

The stock-discovery public GET search/OPTIONS handlers remain untouched. Only its authenticated POST path is guarded. The Unsplash preview has gateway JWT verification already enabled; its new authenticated-user check uses the project's **public anon key**, never a service-role client. The existing response format, event mapping, Unsplash request and browser CORS headers remain intact.

Each new guard reuses the SAME verified-bearer, owner-bound `_shared/orca-browser-token.ts` deny rule that has already been used for the six deployed website functions. CORS/Origin alone is not trusted to establish browser identity.

**Source fidelity and CI:** `scripts/test-orca-extra-browser-edge-oauth-boundary.mjs` strips only the newly added import/guard from each candidate source and verifies the exact character length and stored FNV-64 UTF-16 fingerprint of the pre-change deployed source. The tests also assert Auth verification occurs before any service-role stock write or paid photo request, and test synthetic browser vs OAuth token claims. Added both functions to the Edge dependency resolver. [Browser-only Edge CI #43362070314](https://github.com/jonfordy5/orca-staging/actions/runs/43362070314) **PASSED**.

**Deployment authorization remains separate.** Prior approval and deployment covered only the original six functions. Do not assume that permission extends to these two. Before deploying either to Orca-staging, confirm source fidelity again against freshly retrieved LIVE source, preserve its `verify_jwt` flag, snapshot the old version for rollback and explicitly authorize the two-function staging rollout. Production stays untouched.

**Boundary disclosure:** `orca-company-profile` and `orca-company-official-metrics` are anonymous GET-only endpoints using service-role writes to PUBLIC cached company data; even an unlinked visitor can invoke them without OAuth. These are existing public rate/cost-abuse surfaces and require a separate quota review, not a claim that blocking the OAuth bearer alone closes them. `orca-wikimedia-pilot` is a public GET-only no-database endpoint; `orca-agent-readonly` is independently owner-scoped, read-only and JWT verified.


## November 12 activation receipt — the two additional protected Edge functions

**The existing two-function guard proposal was explicitly advanced in staging on November 12, 2026.** Production was not modified; the OAuth server remains disabled, no OAuth client is approved, and the read-only MCP Edge Function is not deployed.

Both live sources were retrieved from Supabase **immediately before deployment** and compared byte-for-byte with candidate sources after removing only the added imports/guards. Their deployed original `verify_jwt` values were preserved. The shared helper was byte-identical to the helper already deployed with an existing protected function.

| Staging function | Prior version | Verified new version | JWT flag | Deployment readback |
| --- | ---: | ---: | --- | --- |
| `orca-stock-discovery` | 5 | **6** | `false` | ACTIVE; candidate index and shared guard exactly match PR #81 |
| `orca-unsplash-photo-pilot` | 1 | **2** | `true` | ACTIVE; candidate index and shared guard exactly match PR #81 |

**Security behavior:** The stock-registration **POST** first authenticates the same caller token via Supabase Auth; any `client_id` in the verified token denies before profile reads or service-role stock writes. Its original public **GET** ticker lookup stays unchanged. The photo preview now authenticates the same bearer using only the public Supabase anon API key and denies linked OAuth callers before spending the Unsplash API quota. Its original authenticated page already sent a Supabase bearer, so the user interaction stays the same.

**Testing and rollback:** The source-fidelity, ordering, synthetic OAuth-denial and Deno dependency tests passed before deployment in [CI #43362070314](https://github.com/jonfordy5/orca-staging/actions/runs/43362070314). Full readback after deployment confirmed exact new file contents, shared helper, active status and preserved JWT flags. An additional safe no-token HTTP smoke is available at `scripts/test-orca-extra-live-edge-unauthorized.mjs` and `.github/workflows/orca-extra-live-edge-unauthorized.yml`; it tests only OPTIONS, a rejected unsigned stock POST and a rejected unsigned photo GET, with no paid Unsplash request or stock write. [Smoke run #43363521022](https://github.com/jonfordy5/orca-staging/actions/runs/43363521022) should be checked for its conclusion rather than assumed successful.

After deployment, the counts remain **3 researcher profiles, 9 memberships, 29 published findings, 0 approved OAuth clients**, verified with a read-only staging SQL count. No task, account, or research publication was changed.

**Rollback if needed:** Reconstruct the original source by removing only the candidate import/guard and restoring exactly the original checked-in source fingerprint documented by `scripts/test-orca-extra-browser-edge-oauth-boundary.mjs`. Redeploy that one function with its original JWT flag (`false` for stock, `true` for photo) and check the deployed source/version. Never change production or another function as part of this rollback.

**Not yet proven:** The existing signed-in website user's stock registration/photo preview must be tested in a real user session; the real OAuth client denial cannot be tested until resource-bound signed OAuth tokens are issued. These source and signed-out checks are not a complete OAuth acceptance test.
