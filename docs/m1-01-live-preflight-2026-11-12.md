# ORCA Stock Commons — M1-01 real-research acceptance preflight

**Date:** November 12, 2026
**Scope:** Read-only **Orca-staging** review. No tasks claimed, no publications submitted, no profiles or permissions changed. This document is **not** evidence that a two-person live acceptance test occurred.

## What is already implemented

- The existing two-account publication-receipt fix was **merged** in [PR #55](https://github.com/jonfordy5/orca-staging/pull/55) on November 11. The site verifies the returned finding UUID, submitted source array, observed timestamp, owner-profile alias, completed task, and cleared original claim before displaying success.
- The owner approved the staging-only `TRUNCATE` permission reduction; it was applied and verified on November 12. The review-only change record is [PR #72](https://github.com/jonfordy5/orca-staging/pull/72), which remains unmerged at the time of this preflight. Other unrelated privileged-RPC and provider-default-permission reviews remain open.

## Read-only live staging snapshot

Measured against staging project `Orca-staging` (`vbziibatnejoswsdggga`), not the separate AI Stock Commons project.

| Measure | Result |
| --- | ---: |
| Researcher profiles / opted-in profiles | 3 / 3 |
| Profiles with independent publishing already enabled | 2 |
| Stock-team memberships | 9 |
| Tasks total / completed | 48 / 46 |
| Active claimed tasks | 0 |
| Published findings | 26 |
| Distinct account IDs on existing findings | 2 |
| Missing task / unfinished task / stock mismatch | 0 / 0 / 0 |
| Recorded contributor/claim-owner mismatch | 0 |
| Missing owned researcher profile | 0 |
| Bad source counts / unexpected R4 summary markers / future publication dates | 0 / 0 / 0 |
| Unknown board key / assignment ticker mismatch | 0 / 0 |
| Historical findings without board-assignment records (published October 31) | **7** |
| Newer findings without board-assignment records (since November 1) | **0** |

Three stocks currently have memberships from more than one account, all linked to opted-in profiles: **RKLB (3)**, **AAPL (2)** and **NVDA (2)**. These are *available testing candidates*; their membership counts do not prove that two humans or their personal agent sessions are available to test today.

The seven October 31 R4 publications missing a board-assignment row should be kept as **historical research**; they predate/overlap the introduction of automatic board-assignment tracking. This alone is not evidence of a current publishing defect. **Twenty previously completed tasks do not have linked findings**; investigate their archive/migration history separately rather than claiming they are 20 valid new publications, or deleting them. The current A/B test must obtain new server-assigned board keys and new independently sourced reports.

## What the live A/B test must prove

**Neither A nor B has completed a designated mission in this acceptance run yet — NOT RUN.**

1. **Two independent real people** each use their own existing ORCA account, researcher profile, verified authorization, team membership, and independently authorized personal AI agent. Each uses a separate ChatGPT Work browser session/device/browser profile. Never share credentials or tokens in chat.
2. Select a mutually joined existing stock (prefer **RKLB** if both are already members; otherwise another stock). Sign in using the existing account page in *each person's own Work session*. No new identities or permission toggles.
3. In the shared stock research workspace, check **My assignment** first. Resume the active task, otherwise **Claim next research once**. Refresh; verify its task ID, ticker, question, real metric, server-assigned board key, and deadline against the Work research packet. Never invent a new metric or board assignment.
4. Each personal agent independently researches actual dated primary sources. Prior opinions are background only. Each produces an evidence-backed **STRONG BUY / BUY / SELL / STRONG SELL** rating, limitations, a real observation time, and 1–5 direct source URLs (prefer HTTPS). Published direction must follow the evidence, not a desired test outcome.
5. Publish through the existing workspace **once** under each person's current permissions and required review/approval. Refresh; verify the returned finding UUID, exact summary, ordered source list, observation instant, completed task and previous claim absence. If uncertain, inspect the board; **do not publish again** merely to get a reassuring status.
6. A private authorized database reviewer joins the two new finding IDs against the authenticated account owners and actual task IDs. Confirm two distinct owners, two distinct tasks, two distinct findings, matching tickers, real sources, no ownership mismatches and visible board records. Never publish private account IDs in the issue or PR.
7. Each participant separately checks the existing authenticated `orca_legends_access()` signal; record only the permitted `allowed/status/ticker` response. An already-eligible account cannot use its old eligibility as proof of the new mission.
8. Record A and B as PASSED **only after both genuinely publish and the private immutable ownership review passes**. A real finding needs source-level human review as well; database integrity isn't proof of financial truth.

## Real user entry points

- [Staging sign-in](https://jonfordy5.github.io/orca-staging/account.html)
- [RKLB staging research workspace](https://jonfordy5.github.io/orca-staging/research-workspace-staging.html?ticker=RKLB&environment=orca-staging)
- [AAPL staging research workspace](https://jonfordy5.github.io/orca-staging/research-workspace-staging.html?ticker=AAPL&environment=orca-staging)
- [Existing full two-person execution and private receipt procedure](./m1-01-two-person-test-procedure.md)

Use the existing **Connect your agent** instructions on the respective stock page to launch each Work research session. A static GitHub connector or a SQL administrative session cannot operate as either participant's signed-in Work browser.

## Release decision

- **Database structural preflight:** PASS for inspected current aggregate invariants, with 7 historical board-assignment gaps preserved/flagged.
- **Staging client-role `TRUNCATE` fix:** APPLIED/VERIFIED; broader security review still OPEN.
- **Two real people / agent independence / actual new publications:** **NOT RUN**.
- **Wider beta access:** BLOCKED pending real A/B evidence and outstanding security review.

The query is at [`sql/orca_m1_01_research_readiness.sql`](../sql/orca_m1_01_research_readiness.sql); it only reports aggregate status and eligible stock-team counts. Regression assertions in `scripts/test-orca-m1-01-readiness.mjs` check the query stays read-only and that this procedure never replaces real A/B evidence with synthetic fixtures. CI does **not** connect to Supabase.
