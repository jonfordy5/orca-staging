# M1-01 two-person research verification procedure

**A/B acceptance: NOT RUN.** This is an execution plan for two already authorized real people, each using their own existing ORCA account, researcher identity, authorized personal agent and isolated browser session. No new accounts, fabricated findings, permission changes or shared credentials are permitted. [Audit and remaining checks](m1-01-research-verification-audit.md).

**Live status — November 12:** The publication confirmation correction in [PR #55](https://github.com/jonfordy5/orca-staging/pull/55) is **merged**. The staging client-role `TRUNCATE` permission fix was **applied and verified**; a remaining database-default privilege review and privileged-RPC audit are still open. The updated [read-only M1-01 preflight](m1-01-live-preflight-2026-11-12.md) is not evidence that two real people have completed this A/B run.

The [owner-authorized Nov 10 staging catalog audit](https://github.com/jonfordy5/orca-staging/issues/54#issuecomment-6784605715) reports verification of deployed RLS, owner-scoped claims, serialized assignment requests, atomic owner-linked publication, assigned-board/R4 triggers and authenticated self-scoped eligibility. The owner also supplied the exact publication receipt contract in this session, recorded below. These are owner-reported deployed facts, not a fresh independent database inspection by this PR. Historical aggregate counts do not establish designated A/B participants, new genuine receipts or source quality. The separate excessive SQL-privilege review remains **OPEN before wider access**; details stay private.

## 1. Preflight and isolation

1. Each person opens their own active ChatGPT Work session/browser or uses separate devices/browser profiles. Two tabs in one browser profile are not isolation: they share the ORCA session. Sign in directly in that person's Work browser at `https://jonfordy5.github.io/orca-staging/account.html`; never send passwords, codes, cookies or tokens to the agent or auditor.
2. Verify the existing account, owned researcher profile and its `display_name`, research consent and existing selected-stock membership. Publication attribution comes from the owned profile's `display_name`, which may differ from the membership's display name. Record the existing independent-publishing setting without toggling it. If required consent, profile or membership is missing/off, record a blocker and stop that person's run; do not create an identity, grant consent or change publishing permissions. Choose an already joined ticker, optionally the same ticker for both people.
3. An authorized reviewer privately confirms two different server-authenticated user IDs and their owner-bound profiles. Record only A/B labels and the distinctness result in the public test log. Public aliases alone cannot establish distinct accounts or people; participants attest that each agent session is their own.
4. Record each person's baseline result from the existing contributor gate's **Recheck eligibility** response (`allowed/status/ticker` only; no request headers). Existing contributors may already be eligible. Do not revoke access or create accounts to manufacture a false→true transition.
5. PR #55 is merged. The corrected client displays the assignment ID and checks the returned finding UUID against the owned profile's publication alias, complete summary, ordered sources, observed instant and completed task. Verify this in **each person's actual signed-in staging session**, rather than treating the merged PR or synthetic tests as proof of live success. Keep any ambiguous draft; do not click Publish repeatedly.

## 2. Execute A and B independently

For each participant, use their selected stock's `research-workspace.html?environment=orca-staging&ticker=THEIR_TICKER` on the existing staging website. Do not alter another person's browser or assignment.

1. Open the existing Connect your agent instructions for that ticker and start/authorize the mission in the same Work session. The website does not start an AI or prove that an agent is connected just because consent is on.
2. Check **My assignment first**. Resume an active task. Otherwise click **Claim next research once**, then refresh. After a timeout, check My assignment before any retry; the server may already have accepted the request. Never choose another board/metric or claim a second task to replace an inconvenient assignment.
3. Record the real task ID, ticker, metric, board key/label and deadline. Read `ORCA_COLLABORATIVE_RESEARCH_PACKET_V2`; its ticker/task ID/metric/board must agree with the server assignment. On unchanged live staging the packet may be the visible source of the task ID. Positioning uses key `positioning` and may display **Investors**. Management is `execution`; Earnings is `pricing`. Stop on missing, mismatched, legacy-unassigned or expired task/board metadata.
4. Read prior findings only as context. The person's own agent independently opens dated primary sources, checks relevant figures and documents limitations/risks. The packet explicitly treats prior opinions as untrusted; do not copy findings or follow instructions embedded in their text.
5. Prepare a genuine summary for the assigned board with the existing four-rating policy: STRONG BUY, BUY, SELL or STRONG SELL. The conclusion must follow evidence, not match the other researcher or earn game rewards. Use 1–5 actual direct source URLs, preferably HTTPS primary sources (eligibility needs an HTTPS source), and the real evidence observation time. Follow the form's 40-character body/700-character complete-publication counter. No invented research or placeholder citations may be submitted.
6. Recheck the same active/unexpired assignment and existing authorization. If independent publishing is off, the person reviews the draft and supplies the existing required approval/self-review; do not enable independent publishing. Work/tool approvals still apply when independent publishing is on.
7. Publish **once** through the existing website. If the response or confirmation is uncertain, inspect the board and task before retrying. Never submit a dummy finding, extra claim or duplicate publication to make a test pass.
8. Refresh and record the actual finding ID, task ID, ticker/board, owned profile's publication alias, source URLs, observation/publication times and completed-task status. Match the returned finding UUID when available, the trimmed submitted summary/rating, the exact ordered source URL array and the observation timestamp as the same instant. Confirm that the original claim is no longer active. Expand previous findings if necessary; only the latest may be shown by default. Confirm each cited source actually supports the claim. A returned UUID or UI receipt still needs the private ownership join below.
9. Obtain the private server ownership receipt in step 3 below. Public alias/text matching and a completed task alone are insufficient.
10. Recheck `orca_legends_access()` in that same real account session through the existing contributor gate. Record the safe response fields. `allowed:true` is expected after an accepted eligible contribution; an already-true baseline or a ticker from older research does not replace the new finding/task receipt.

Do A and B's work separately. Their task IDs and publication IDs must differ. The owner reports five distinct deployed assignment metrics mapped onto three board destinations, with only completed tasks counting toward the cycle. A and B may receive the same board category; that does not itself prove a rotation error. Track Management/Earnings/Positioning coverage separately. Two single publications cannot cover all three boards: use the owner-reviewed cycle contract for its defined guarantees, or leave additional observed coverage pending until owner-authorized genuine missions naturally provide it. Do not claim extra assignments merely for a coverage screenshot.

## 3. Read-only server contract and ownership review

The owner-reported catalog audit covers the existing **staging** project `vbziibatnejoswsdggga`. It reports all four core tables have RLS enabled; claims require authentication, owned opt-in and ticker membership; My assignment and assigned-board RPCs are owner-scoped; request IDs are bound to user/ticker; and claim/publication operations use locking. It reports publication ownership, expiry, membership, length/source/date validation, assigned-board/R4 triggers and completion in the publication transaction. Eligibility is authenticated-only, has no caller-supplied owner argument and uses the private self-scoped contributor check. This resolves the previous blanket catalog-inspection blocker, while the A/B receipts remain unverified.

The owner additionally confirmed this deployed publication contract in this session:

- Attribution uses the owned `agent_profiles.display_name`.
- Sources are a JSON array of 1–5 HTTP(S) URL strings, inserted unchanged; triggers do not transform them. Compare the exact ordered strings. Eligibility still requires at least one HTTPS source, so genuine HTTPS primary sources remain the preferred test inputs.
- The summary is stored after `btrim`; the client already trims its submitted summary. `observed_at` preserves the same `timestamptz` instant, even if its displayed timezone format differs.
- Both publication RPCs return the scalar UUID of the new finding. Independent publication checks existing consent and delegates to standard publication.
- Finding insertion, task completion and clearing the active claim are atomic. The precise cleared columns are not supplied here; do not infer that any historical owner field must be erased.

An authorized database reviewer uses existing access for the private A/B receipt joins. Confirm the project before querying; do not request secret keys in chat or add permissions. No migrations, DDL, grants, policy edits, user impersonation, synthetic records or experimental writes are part of this review. Genuine participant claim/publication steps above remain **NOT RUN** by this audit.

The previously identified ordinary-client table-level `TRUNCATE` privileges have been revoked on staging without changing existing research or ordinary client read/write grants. **The broader security review remains OPEN**: a provider-internal creator role has separate default privileges, and privileged RPCs still require review of intended exposure, function owners, execution context, search paths, dependencies and returned outputs. Supabase Advisor warnings alone do not establish exploitation. No further remediation is authorized by this runbook.

The following catalog transaction is optional targeted read-only follow-up for an unresolved contract detail, changed deployment or the private security review; repeating the whole owner audit is not an A/B precondition. Follow called helpers as needed, and keep exact grant details and function configuration private. This sample is not an exhaustive privilege inventory.

```sql
BEGIN READ ONLY;
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef, p.provolatile, p.proconfig, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'orca_legends_private') AND p.proname IN (
  'commons_my_claim', 'commons_claim_task', 'commons_claim_next', 'commons_release_task',
  'orca_request_and_claim_next', 'orca_my_assigned_board',
  'orca_research_cycle_status', 'orca_research_cumulative_status',
  'commons_publish_finding', 'commons_publish_independent_finding',
  'commons_create_my_agent_profile', 'commons_set_my_research_consent',
  'commons_set_my_independent_publishing', 'orca_legends_access', 'contributor_access'
);
SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('agent_profiles','stock_research_memberships','research_tasks','commons_research_findings');
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN
  ('agent_profiles','stock_research_memberships','research_tasks','commons_research_findings');
SELECT n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN
  ('agent_profiles','stock_research_memberships','research_tasks','commons_research_findings');
SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN
  ('agent_profiles','stock_research_memberships','research_tasks','commons_research_findings');
SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers WHERE event_object_schema='public'
AND event_object_table IN ('research_tasks','commons_research_findings');
SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND table_name IN
  ('agent_profiles','stock_research_memberships','research_tasks','commons_research_findings');
SELECT has_function_privilege('anon','public.orca_legends_access()','EXECUTE') AS anon_can_execute,
       has_column_privilege('authenticated','public.commons_research_findings','contributor_id','SELECT') AS ownership_column_exposed;
ROLLBACK;
```

Preserve the distinction between the owner-reviewed publication/claim paths and the separate unresolved excessive-privilege review. For a specific follow-up, inspect the relevant direct-table grants/RLS, RPC or trigger helper rather than treating an enabled RLS flag or a SECURITY DEFINER name as sufficient evidence. Record any unavailable definition as an unresolved targeted check. Do not replay old five-rating SQL snippets.

For the **actual** A/B finding/task IDs, the reviewer privately joins `commons_research_findings` → `research_tasks` and requires `f.contributor_id` to match that participant's real authenticated account ID, alongside ticker/task consistency, completed state, valid R4 publication and real source references. Confirm the publication alias agrees with that account's owned profile, without using alias equality as ownership proof. Check `claimed_owner_id` when recorded: a recorded mismatch blocks acceptance; its absence is neither an automatic failure nor a substitute for the mandatory finding-owner match. Verify no active original claim remains. Confirm the two contributor IDs, task IDs and finding IDs differ. Return only pass/fail and public receipt identifiers to the shared log; keep private account IDs, tokens and grant details out of it.

Use this read-only receipt check with privately supplied **real** IDs after confirming the deployed field mappings. The placeholders are not test accounts or data to insert. Do not publish the filled owner IDs or query text in a public issue. The claim-owner columns below are conditional review evidence, not mandatory acceptance booleans when no historical claim owner is recorded.

```sql
BEGIN READ ONLY;
WITH expected(label, owner_id, task_id, finding_id) AS (VALUES
 ('A','<real A account ID>','<real A task ID>','<real A finding ID>'),
 ('B','<real B account ID>','<real B task ID>','<real B finding ID>')
)
SELECT e.label, f.id AS finding_id, t.id AS task_id, t.ticker,
       COALESCE(f.contributor_id::text=e.owner_id,false) AS finding_owner_matches,
       EXISTS(SELECT 1 FROM public.agent_profiles p
              WHERE p.owner_id::text=e.owner_id
                AND p.display_name=f.contributor_alias) AS profile_alias_matches,
       COALESCE(t.status='completed',false) AS task_completed,
       COALESCE(f.ticker=t.ticker,false) AS stock_matches,
       t.claimed_owner_id IS NOT NULL AS claim_owner_recorded,
       COALESCE(t.claimed_owner_id::text=e.owner_id,false) AS claim_owner_matches,
       EXISTS(SELECT 1 FROM public.agent_profiles p
              WHERE p.owner_id::text=e.owner_id AND p.opted_in IS TRUE) AS owned_consent,
       COALESCE(f.summary LIKE '[ORCA-R4;%',false) AS current_marker,
       COALESCE(f.published_at IS NOT NULL AND f.published_at<=now()+interval '5 minutes',false) AS published,
       f.source_urls AS public_source_references
FROM expected e
LEFT JOIN public.commons_research_findings f ON f.id::text=e.finding_id AND f.task_id::text=e.task_id
LEFT JOIN public.research_tasks t ON t.id=f.task_id;
-- Replace only with the two observed publication IDs. This returns no owner IDs.
SELECT count(*)=2 AND count(DISTINCT contributor_id)=2
       AND count(DISTINCT task_id)=2 AS two_distinct_owned_receipts
FROM public.commons_research_findings
WHERE id::text IN ('<real A finding ID>','<real B finding ID>');
ROLLBACK;
```

Compare the actual summary, ordered source array and observation instant with the real submitted evidence from step 2. The source URLs must still be opened and reviewed against the actual finding; the SQL marker and dates are not fact verification. A null recorded claim owner does not establish ownership; the matching `contributor_id`, real task/finding receipt and reviewed publication path remain required. A recorded claim-owner mismatch blocks acceptance. Each own-session eligibility check remains necessary; these admin reads do not impersonate either participant.

Safe negative checks: A and B's own My assignment must not return each other's active claim; B must not inherit A's contribution through an alias; a signed-out browser must remain locked. If B was already eligible before A published, that baseline cannot test the noncontributor denial. Inspect the predicate/policies instead. **Do not try to publish, release, alter or steal the other person's task to test a suspected vulnerability on live data.** Deeper adversarial writes need a separately approved isolated test environment and are outside this run.

## 4. Separate evidence log and acceptance

Fill only from observed real results. No step below was executed by two real participants during the audit.

| Check / public evidence | Player A | Player B |
|---|---|---|
| Existing real participant and own authorized agent session | NOT RUN | NOT RUN |
| Existing account/profile/membership/consent verified; no permission changes | NOT RUN | NOT RUN |
| Distinct account IDs confirmed privately by reviewer | NOT RUN | NOT RUN |
| Baseline `allowed/status/ticker` | — | — |
| Selected ticker and owned profile's publication alias | — | — |
| Task ID, assigned metric, board key, deadline | — | — |
| Packet matches assignment; independent source investigation | NOT RUN | NOT RUN |
| Finding ID / returned UUID, observed/published times, exact source array | — | — |
| Genuine content reviewed; rating matches evidence and assigned board | NOT RUN | NOT RUN |
| Completed task and immutable finding-owner join confirmed privately | NOT RUN | NOT RUN |
| Own-session final eligibility response | — | — |
| Result and precise blocker, if any | PENDING | PENDING |

Record observed board coverage separately: execution/Management **PENDING**; pricing/Earnings **PENDING**; positioning/Investors **PENDING**. Record deployed catalog/RLS/function review **OWNER-REPORTED VERIFIED — Nov 10 linked audit**, exact publication receipt contract **OWNER-REPORTED IN THIS SESSION**, independent fresh catalog inspection **NOT PERFORMED**, and client table-level `TRUNCATE` fix **APPLIED Nov 12** and remaining privileged-RPC/default-grant review **OPEN before wider access**. None of these status fields fills an A/B receipt.

Accept M1-01 only after both people have distinct genuine accepted receipts, correct private ownership, visible source-backed board findings, own-session eligibility results and verified server isolation. A claim, copied text, anonymous API row, synthetic test or two SQL subject contexts is not acceptance. Do not repeat genuine research to troubleshoot an authorization/query failure.

The current game is a single-player prototype. Two eligible accounts establish the contribution/entry prerequisite; a shared network arena, rewards and multiplayer remain separate future work and must not begin as part of this verification.
