# M1-01 research verification audit

Work order: [#54](https://github.com/jonfordy5/orca-staging/issues/54), parent [#51](https://github.com/jonfordy5/orca-staging/issues/51). Audited latest main `fb8c954a701f3dc563c4738c0e93a905ba6176d3`, including merged WO-01/02/03. Branch: `audit/m1-01-two-contributors`.

**Status: audit and test preparation complete; two-real-person acceptance NOT RUN.** No participant accounts, authorized agent sessions or two new genuine publication receipts were supplied. The deployed claim/publication/RLS definitions are not available through the current read access. These are blockers to declaring M1-01 verified, not evidence that two users cannot contribute.

No accounts, aliases, permissions, assignments, findings, research history, database configuration, game files or live websites were changed. Live checks used only anonymous, read-only GET requests and selected zero rows. Publication tests use explicit local nonfinancial transport fixtures; none is a real research result or acceptance evidence.

## Existing systems to reuse

| Requirement | Existing implementation | Verification boundary |
|---|---|---|
| Separate accounts | `account.html` uses the staging Supabase project, verified identity and existing email/password sign-in | Two distinct real sessions still required; tabs in one profile share a session |
| Owner-bound researcher | `agent_profiles.owner_id`; onboarding reuses an existing profile; memberships use `user_id` and a public display name | Aliases are display metadata, not ownership proof; deployed uniqueness/RLS require inspection |
| Authorization | Workspace checks ticker membership, own profile, `opted_in`, and `independent_publish_enabled` | Client controls do not prove server enforcement; no settings were changed |
| Assignment | `commons_my_claim`, `orca_request_and_claim_next`, random request ID, refreshed task/board verification | Claim atomicity, idempotency and owner scoping are unverified without deployed definitions |
| Category | Server-assigned `board_key`: `execution` / `pricing` / `positioning` | UI labels are Management / Earnings / Investors; Positioning is the Investors board, not a new fourth category |
| Packet | `ORCA_COLLABORATIVE_RESEARCH_PACKET_V2` includes ticker, task ID, assigned metric/board/question and dated source context | Prior opinions are explicitly untrusted; the participant's own agent must investigate sources |
| Publication | Existing `commons_publish_finding` or `commons_publish_independent_finding`, with task, R4 summary, source URLs and observation time | Server ownership, expiry, board/rating/source validation and duplicate protection still require inspection |
| Board | Public finding ID, task ID, contributor alias, sources, observation/publication time and rating | Public alias or matching text cannot prove immutable account ownership |
| Entry signal | Existing authenticated, no-argument `orca_legends_access()` | Its checked-in predicate is self-scoped; current deployed definition/grants and both real sessions remain to be verified |

Relevant source: [workspace](../research-workspace.html), [account](../account.html), [connect agent](../connect-work.html), [research team](../join-research.html), [profile](../agent-profile.html), [public research brief](../orca-research-brief.js), [eligibility SQL](../sql/orca_legends_contributor_access.sql), [earlier eligibility correction](orca-legends-eligibility-fix.md).

The six research metrics and three assigned boards are different concepts. The packet also contains a legacy five-metric round total. Inspect the server's actual cycle/rotation contract before asserting exact round coverage. Do not choose another board or claim extra tasks to manufacture a desired demonstration.

## Proven client defects and narrow corrections

1. **Assignment identity was not visible in My assignment.** The existing agent instruction requires comparing its task ID against the packet. The panel now displays the existing task ID; no assignment creation or identity change is involved.
2. **Publication confirmation could report a false success.** An isolated execution of the actual production `publish()` function reproduced success when a refreshed row matched only task ID and summary, despite different sources/attribution and a still-active claim. The old function then discarded that claim. This was a client receipt-confirmation defect, not proof of a successful unauthorized database write.

The correction snapshots submitted metadata, checks the signed-in owner with read-only `getUser()` before the existing publication RPC, refreshes permissions/board state, and rechecks the owner afterward. Success requires the matching public attribution, summary, normalized source set and observation time, a completed task, and absence of the original active claim. A different newly refreshed claim is preserved. The UI remains busy during the final identity check, and uncertain responses retain the draft and tell the user to inspect the board before retrying. Legacy void RPC results remain supported; no new response fields or database API were invented.

This verifies a **board receipt**, not immutable ownership. Alias/source/timestamp preservation is a server contract to confirm during live verification; a legitimate transformation may conservatively leave the receipt unconfirmed. Never republish solely because the client cannot confirm. Existing refresh behavior may clear rating selections while preserving draft summary/source text; operators must inspect the real finding before any retry.

## Read-only staging observations

Project: `vbziibatnejoswsdggga`, selected from the checked-in staging configuration. The browser-safe publishable key was used without a user session. No keys or tokens are included in this report.

| GET probe | Observed response | Meaning |
|---|---|---|
| Finding public fields, `limit=0` | HTTP 200, zero requested rows | Public field projection is available; this does not mean the table is empty |
| Task public fields, `limit=0` | HTTP 200, zero requested rows | Task field projection is available; no claim was made |
| Finding `contributor_id`, `limit=0` | HTTP 401 / `42501` | Anonymous ownership-column query is denied |
| Profile `id`, `limit=0` | HTTP 401 / `42501` | Anonymous profile query is denied |
| `orca_legends_access()` | HTTP 401 / `42501` | Anonymous eligibility execution is denied |
| REST OpenAPI schema | HTTP 401, “Secret API key required” | Current public access cannot inspect the server contract; do not supply a secret in chat |

These checks do not establish authenticated RLS, function bodies, private-column protection for every role, or two genuine contributors. A Supabase integration was discovered but is not connected for this audit. An authorized read-only catalog review is the next database step; no elevated credentials were requested or obtained.

## Missing server evidence and blockers

The checkout has no complete definitions for the claim, assigned-board, cycle/cumulative-status and publication RPCs, nor the research tables' creation, constraints, grants, RLS policies and trigger attachments. The checked-in migrations concern timelines. Inspect the deployed definitions before trusting owner scoping, one-active-claim behavior, retry/concurrent claim safety, rotation, expiry, source/rating validation and exactly-once publication.

The two historical five-rating SQL snippets accept older ORCA-Q/R2 markers, while the current workflow publishes R4 with **STRONG BUY / BUY / SELL / STRONG SELL**. Their existence does not prove the deployed validator is wrong. **Do not replay those snippets** as an audit fix or change historical findings/ratings.

The client accepts HTTP(S) source URLs; the eligibility predicate requires at least one syntactically HTTPS source. Whether an HTTP-only publication is accepted depends on the untracked publication validator. Use genuine HTTPS primary sources for this run, and verify the server contract before proposing any source-policy change. URL syntax and an accepted R4 marker do not prove that financial claims are true or independently researched.

## Existing trustworthy signal, with limits

The checked-in `orca_legends_access()` contract takes **no caller-supplied owner or alias**. Its private fixed-search-path helper derives `auth.uid()`, requires an opted-in owned profile, and joins an owned finding to a completed assignment. It requires `contributor_id = caller`, compatible recorded claim ownership, R4 publication, a nonfuture publication time and an HTTPS source. It returns only `{allowed,status,ticker}`. Public/anonymous execution is revoked in the checked-in SQL.

After confirming the deployed function and underlying publication/RLS enforcement, this is the existing signal for **at least one accepted contribution by the current account**. Reuse it; do not build another entitlement system. It does not identify the current test finding, prove distinct humans or active agent connections, authenticate source truth, or provide a reward receipt. An already eligible researcher can remain eligible before and after this run. The returned ticker can identify an older contribution.

The earlier SQL test uses one historical contributor and another existing noncontributor under transaction-local SQL subject contexts. It explicitly reports no real authenticated browser session. That is useful authorization coverage, not two real contributors and not M1-01 acceptance. Researcher/alias counts in the public brief are likewise not a count of independently verified people.

## Verification performed here

- **24 local publication regression tests pass.** They execute the real publication function with isolated, explicitly nonfinancial fixtures and no network. They cover complete and ambiguous receipts, wrong/missing source/alias/time, active/incomplete task, pre/post account changes, auth/refresh failures, void RPC compatibility, preserved claims/drafts and the busy confirmation window.
- **50 existing shared-workspace assertions pass** for research structure, ticker scope and preservation; existing timeline/photo/history/completion regressions also pass.
- **Seven access-contract tests and 12 access-browser groups pass**, checking fail-closed account/eligibility integration using synthetic Auth/RPC responses. These are not real participants.
- JavaScript parsing and `git diff --check` cover the edited HTML/script. The game, backend, permissions and existing research data are unchanged.

Commands: `node --test scripts/test-research-publication-confirmation.cjs scripts/test-orca-legends-access.mjs`, `node scripts/check-shared-research-workspace.cjs`, and `CHROME_BIN=/usr/bin/chromium node scripts/test-orca-legends-access-browser.cjs`. Final CI results accompany the corrective PR. No server/RLS SQL-role test was run here: privileged SQL access and real participant sessions were unavailable. No mutating RPC, consent/profile function, assignment claim, research publication, synthesis or provider call was sent to staging during the audit.

Use the [two-person live test procedure](m1-01-two-person-test-procedure.md). **Do not progress to rewards, multiplayer or declaring the milestone complete until both real rows and the deployed ownership boundary have been verified.**
