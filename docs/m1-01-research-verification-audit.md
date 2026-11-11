# M1-01 research verification audit

Work order: [#54](https://github.com/jonfordy5/orca-staging/issues/54), parent [#51](https://github.com/jonfordy5/orca-staging/issues/51). Baseline main `fb8c954a701f3dc563c4738c0e93a905ba6176d3` includes merged WO-01/02/03. Branch: `audit/m1-01-two-contributors`; [PR #55](https://github.com/jonfordy5/orca-staging/pull/55) remains draft and unmerged for owner review.

**Status: owner-reported deployed contract reconciled; two-real-person acceptance NOT RUN.** The [owner-authorized Nov 10 staging audit](https://github.com/jonfordy5/orca-staging/issues/54#issuecomment-6784605715) verifies the deployed assignment, publication, consent, R4 validation and contributor-eligibility functions. The owner supplied the exact publication receipt contract in this review session. This supersedes the earlier broad catalog-access blocker. It does not complete the designated A/B missions or resolve the separately reported excessive SQL privileges.

Evidence has three distinct scopes: this PR's source review/local synthetic tests; the owner's read-only deployed-function/catalog inspection; and the still-pending genuine A/B submissions. We did not independently repeat the privileged database inspection. This PR changes only client receipt confirmation, its tests/CI and audit/test instructions. No accounts, aliases, permissions, schemas, live data, game files or websites were changed. No mutating research, consent, synthesis or provider call was sent to staging during this audit.

## Existing systems to reuse

The deployed behaviors below are confirmed by the linked owner audit, with the receipt details supplied by the owner in this session.

| Requirement | Existing implementation and deployed verification | Remaining real-test boundary |
|---|---|---|
| Separate accounts | Existing staging email/password sign-in; `agent_profiles.owner_id` and membership creation checks use `auth.uid()` | Privately verify two distinct existing real accounts and their own authorized agents; tabs in one browser profile share a session |
| Owner-bound researcher | Profile ownership and owned opt-in are checked; publication attribution is `agent_profiles.display_name` | Membership display name may differ; neither display name is immutable ownership proof |
| Authorization | Claims/publication require authentication, opted-in owned profile and matching ticker membership; independent publication additionally requires existing consent | Use existing settings only; do not create accounts or toggle consent/permissions |
| Assignment | `commons_my_claim` returns only caller's active assignment; claim RPCs use locking; `orca_request_and_claim_next` binds request IDs to caller/ticker and serializes per ticker | Genuine packet/task agreement, independent work and A/B isolation still need observation |
| Category | Five distinct deployed assignment metrics map onto three boards; only completed tasks count toward the cycle; `orca_my_assigned_board` checks active-task ownership | `execution` = Management, `pricing` = Earnings, `positioning` = Investors; two single findings cannot cover all three boards |
| Packet | Existing `ORCA_COLLABORATIVE_RESEARCH_PACKET_V2` contains task/ticker/assigned metric/board/question and dated source context | Each person's own agent must investigate sources; prior opinions are explicitly untrusted |
| Publication | Owner/task/expiry/membership, summary length, 1–5 HTTP(S) sources and observation recency checked; task locked; owner-linked finding insert and task completion are atomic | Real sources, actual receipts and private finding-owner joins remain pending |
| Validation | Deployed triggers enforce assigned board and current R4 four-rating directional marker | Accepted syntax/ratings do not establish source truth or independent human research |
| Entry signal | Authenticated-only no-argument `orca_legends_access()` delegates to the private self-scoped owned-finding/completed-task check | Each real participant must obtain their own response; historical eligibility cannot identify this run's new finding |

Relevant source: [workspace](../research-workspace.html), [account](../account.html), [connect agent](../connect-work.html), [research team](../join-research.html), [profile](../agent-profile.html), [public research brief](../orca-research-brief.js), [eligibility SQL](../sql/orca_legends_contributor_access.sql), [earlier eligibility correction](orca-legends-eligibility-fix.md).

The UI's six catalog metrics and the deployed five-metric assignment cycle describe different inventories; the owner confirmed the deployed five-metric/three-board contract. The audit comment does not enumerate its exact metric set/mapping. Do not infer a rotation defect from the catalog count, choose another assigned board or claim extra tasks to manufacture coverage.

## Narrow client corrections and deployed publication contract

The original workspace omitted the task ID that its agent instructions require comparing, and could report publication success from task ID plus summary while sources/attribution differed and the original claim remained active. It then discarded that claim. Local execution reproduced this receipt-confirmation defect; it did not demonstrate an unauthorized server write. PR #55 displays the existing task ID and strengthens confirmation without changing either RPC or its five arguments: `p_task_id`, `p_summary`, `p_source_urls`, `p_observed_at`, `p_limitations`. No caller-supplied owner, contributor ID or alias argument is added.

The owner's exact deployed contract exposed a mismatch in the first PR revision: it expected the membership display name and accepted empty RPC returns. The reconciled client now follows the inspected contract:

| Owner-confirmed deployed behavior | Client confirmation |
|---|---|
| Alias is stored directly from `agent_profiles.display_name`, selected by `owner_id = auth.uid()` | Read that field from the existing owned-profile query; preserve membership alias for existing membership UI; snapshot the profile name for publication |
| Both publication RPCs return the new finding UUID; independent publication delegates to standard publication | Require a scalar UUID and match the refreshed finding by that exact ID first; empty, malformed or object returns cannot confirm publication |
| Server stores `btrim(p_summary)` | Client already trims the body; compare the complete trimmed submitted R4 summary |
| JSON array of 1–5 HTTP(S) source strings is stored directly; inspected triggers do not rewrite it | Compare exact ordered strings and array length, including duplicate counts; do not normalize, sort or collapse the stored receipt |
| `p_observed_at` is stored as `timestamptz`, preserving the instant | Compare parsed timestamps so equivalent timezone representations match |
| Finding insert, completed task and clearing the active claim occur in one transaction | Require the refreshed completed task and absence of the original active claim; preserve any different refreshed claim |

The client checks the authenticated user with read-only `getUser()` before publication, refreshes permissions/board state and rechecks the same user afterward. It remains busy during final confirmation. Success also requires the matching task, profile alias, summary, sources and timestamp, and displays the finding UUID. These checks are compatible with the owner-inspected deployed publication contract. No new server API, response fields or permission changes are required.

This confirms a **public board receipt**, not immutable ownership or factual correctness. A concurrent profile rename, a missing row in the bounded refresh, transport failure or an unexpected response can leave a legitimate publication unconfirmed. Draft summary/source text is retained with an instruction to inspect the board before retrying; do not republish merely to obtain a success message. Existing refresh may clear rating selections. The private receipt join and the person's own-session eligibility response remain necessary.

## Owner-reported deployed evidence and security concerns

The owner inspected the existing staging project `vbziibatnejoswsdggga` (Orca-staging), not the separate AI Stock Commons project, using SELECT/catalog operations only. They report RLS enabled on `agent_profiles`, `stock_research_memberships`, `research_tasks` and `commons_research_findings`, intended public SELECT of tasks and unexpired findings, guarded assignment/publication operations, current R4 triggers and authenticated self-scoped eligibility. Their historical snapshot was **3 profiles, 3 opted in, 2 independent-publishing enabled; 23 R4 findings from 2 distinct contributor account IDs; 43 completed tasks; 0 unexpired active claims**. This is historical aggregate evidence, not two new designated A/B receipts, proof of distinct humans or a source-quality review.

**The owner-reported excessive SQL privileges remain OPEN for separate private owner-controlled security review before wider access.** The public comment withholds affected roles/objects and exact grants; this PR does not infer severity, exploitability or a remediation. RLS-enabled tables and guarded publication RPCs do not establish least privilege across every alternate table/function path. The earlier anonymous denials below do not resolve this wider concern.

The private review should identify affected objects and effective grants, role inheritance and intended exposure; inspect direct-table access alongside RPCs; and inspect SECURITY DEFINER owners, execution grants, search paths, called helpers and returned data. Supabase Advisor warnings about callable status functions are review leads, not proof of exploitation. Keep exact privilege details private and share only a redacted conclusion. No permission, schema or live-data remediation is authorized here.

The repository still lacks a complete reproducible definition set for the deployed research tables, write RPCs, grants, policies and triggers. That is a source-coverage gap, not evidence that deployed functions are absent. Use the owner's inspection rather than repeating historical snippets. In particular, the old five-rating ORCA-Q/R2 SQL snippets do not represent the confirmed current R4 validator and must not be replayed.

Publication accepts HTTP(S), whereas the eligibility predicate requires at least one syntactically HTTPS source. That policy difference is now explicit, not an unknown validator. Use genuine HTTPS primary sources for the two-person run; an HTTP-only accepted publication may not confer eligibility. Do not change source policy as part of this PR.

## Earlier anonymous read-only observations

These bounded GET probes used the checked-in staging browser-safe key without a user session and selected zero rows. No keys/tokens are included here. They remain limited transport observations, superseded by the owner's catalog inspection for deployed-function conclusions.

| GET probe | Observed response | Meaning |
|---|---|---|
| Finding/task public projections, `limit=0` | HTTP 200 | Public projections available; says nothing about row counts |
| Finding `contributor_id` and profile `id`, `limit=0` | HTTP 401 / `42501` | Those anonymous queries were denied; not a general privilege clearance |
| `orca_legends_access()` | HTTP 401 / `42501` | Anonymous eligibility execution denied |
| REST OpenAPI schema | HTTP 401, “Secret API key required” | This session could not inspect definitions through public access; no secret was requested |

No callable Supabase SQL integration is available in this review session. The owner-reported deployed inspection and supplied receipt details are explicitly attributed rather than presented as new database tests run by this PR.

## Existing contribution signal and acceptance limits

The owner confirms deployed `orca_legends_access()` is authenticated-only, takes no owner argument and delegates to the private self-scoped check for an owner-linked R4 finding and completed task. The checked-in helper derives `auth.uid()`, requires an opted-in owned profile, `contributor_id = caller`, compatible recorded claim ownership, nonfuture publication time and an HTTPS source, returning only `{allowed,status,ticker}`. Reuse this existing signal; do not build another entitlement system.

It signals an accepted eligible contribution by the current account under the reviewed path. It does not identify this run's finding, prove distinct humans/agents, authenticate source truth or settle the unresolved excessive-privilege concern. An already eligible researcher can remain eligible before/after the test, and the returned ticker may refer to older research. Historical SQL subject-context checks and synthetic browser identities are not real A/B sessions.

## Verification and next step

Focused local regression tests execute the real publication/readiness functions with explicitly nonfinancial `.invalid` transport fixtures and no backend. They cover profile-versus-membership attribution, UUID-first receipt matching, exact five-argument regular/independent routes, summary/sources/timestamp checks, complete task/claim state, identity changes, ambiguous results, retained drafts and the busy confirmation window. Synthetic tests are client regression coverage, not deployed SQL verification or genuine research.

Current local validation passes **47 publication regression tests, seven existing access-contract tests and 50 shared-workspace assertions**. Run `node --test scripts/test-research-publication-confirmation.cjs scripts/test-orca-legends-access.mjs` and `node scripts/check-shared-research-workspace.cjs`; CI also runs the existing workspace/game regressions. Three focused offline Chromium scenarios load the full production workspace and shipped Supabase SDK with intercepted transport: matching UUID/profile alias succeeds with a different membership label and equivalent timezone timestamp; wrong finding ID and membership-only attribution retain the draft. All five RPC arguments and the owned-profile query are checked; no page errors or live requests occurred. These synthetic browser sessions do not establish real A/B acceptance. JavaScript parsing and `git diff --check` cover the edited HTML/script. No live claim, publication, consent/profile function, synthesis, provider call or SQL-role mutation is part of these checks.

Use the [two-person live procedure](m1-01-two-person-test-procedure.md) for two already authorized existing people, each with their own agent and isolated session. Keep all A/B evidence **NOT RUN** until actual genuine submissions, private immutable owner joins and own-session eligibility responses exist. Keep PR #55 draft and unmerged for review. Finish research verification before rewards or multiplayer; resolve the separate private security concern before wider access.
