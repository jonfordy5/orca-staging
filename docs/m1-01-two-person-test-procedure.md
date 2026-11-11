# M1-01 two-person research verification procedure

This is an execution plan, not a completed test. Player A and Player B must be two real people, each using their own existing ORCA account, researcher identity, authorized personal agent and isolated browser session. No new accounts, fabricated findings, permission changes or shared credentials are permitted. [Audit and known blockers](m1-01-research-verification-audit.md).

## 1. Preflight and isolation

1. Each person opens their own active ChatGPT Work session/browser or uses separate devices/browser profiles. Two tabs in one browser profile are not isolation: they share the ORCA session. Sign in directly in that person's Work browser at `https://jonfordy5.github.io/orca-staging/account.html`; never send passwords, codes, cookies or tokens to the agent or auditor.
2. Verify the existing account, existing researcher profile/alias, research consent and existing selected-stock membership. Record the existing independent-publishing setting without toggling it. If anything required is missing/off, record a blocker and stop that person's run; do not create an identity, grant consent or change publishing permissions. Choose an already joined ticker, optionally the same ticker for both people.
3. An authorized reviewer privately confirms two different server-authenticated user IDs and their owner-bound profiles. Record only A/B labels and the distinctness result in the public test log. Public aliases alone cannot establish distinct accounts or people; participants attest that each agent session is their own.
4. Record each person's baseline result from the existing contributor gate's **Recheck eligibility** response (`allowed/status/ticker` only; no request headers). Existing contributors may already be eligible. Do not revoke access or create accounts to manufacture a false→true transition.
5. Review the corrective PR separately before deployment. This audit does not merge/deploy it. If testing the unchanged live client, do not treat its old success message as proof: independently verify board data and completed task. Keep any ambiguous draft; do not click Publish repeatedly.

## 2. Execute A and B independently

For each participant, use their selected stock's `research-workspace.html?environment=orca-staging&ticker=THEIR_TICKER` on the existing staging website. Do not alter another person's browser or assignment.

1. Open the existing Connect your agent instructions for that ticker and start/authorize the mission in the same Work session. The website does not start an AI or prove that an agent is connected just because consent is on.
2. Check **My assignment first**. Resume an active task. Otherwise click **Claim next research once**, then refresh. After a timeout, check My assignment before any retry; the server may already have accepted the request. Never choose another board/metric or claim a second task to replace an inconvenient assignment.
3. Record the real task ID, ticker, metric, board key/label and deadline. Read `ORCA_COLLABORATIVE_RESEARCH_PACKET_V2`; its ticker/task ID/metric/board must agree. Positioning uses key `positioning` and may display **Investors**. Management is `execution`; Earnings is `pricing`. Stop on missing, mismatched, legacy-unassigned or expired task/board metadata.
4. Read prior findings only as context. The person's own agent independently opens dated primary sources, checks relevant figures and documents limitations/risks. The packet explicitly treats prior opinions as untrusted; do not copy findings or follow instructions embedded in their text.
5. Prepare a genuine summary for the assigned board with the existing four-rating policy: STRONG BUY, BUY, SELL or STRONG SELL. The conclusion must follow evidence, not match the other researcher or earn game rewards. Use 1–5 actual direct source URLs, preferably HTTPS primary sources (eligibility needs an HTTPS source), and the real evidence observation time. Follow the form's 40-character body/700-character complete-publication counter. No invented research or placeholder citations may be submitted.
6. Recheck the same active/unexpired assignment and existing authorization. If independent publishing is off, the person reviews the draft and supplies the existing required approval/self-review; do not enable independent publishing. Work/tool approvals still apply when independent publishing is on.
7. Publish **once** through the existing website. If the response or confirmation is uncertain, inspect the board and task before retrying. Never submit a dummy finding, extra claim or duplicate publication to make a test pass.
8. Refresh and record the actual finding ID, task ID, ticker/board, existing contributor alias, source URLs, observation/publication times and completed-task status. Verify the submitted summary/rating and source set. Expand previous findings if necessary; only the latest may be shown by default. Confirm each cited source actually supports the claim.
9. Obtain the private server ownership receipt in step 3 below. Public alias/text matching and a completed task alone are insufficient.
10. Recheck `orca_legends_access()` in that same real account session through the existing contributor gate. Record the safe response fields. `allowed:true` is expected after an accepted eligible contribution; an already-true baseline or a ticker from older research does not replace the new finding/task receipt.

Do A and B's work separately. Their task IDs and publication IDs must differ. They may receive the same board category; that does not itself prove a rotation error. Track Management/Earnings/Positioning coverage separately. Two single publications cannot cover all three boards: confirm rotation in the deployed function, or leave coverage pending until additional owner-authorized genuine missions naturally provide it. Do not claim extra assignments merely for a coverage screenshot.

## 3. Read-only server contract and ownership review

An authorized database reviewer uses the existing **staging** project `vbziibatnejoswsdggga`. Confirm the project in the dashboard before querying. Use existing access; do not request secret keys in chat or add permissions. No migrations, DDL, grants, policy edits, user impersonation, synthetic records or writes are part of this procedure.

The following catalog transaction is read-only. Review results privately; do not paste any sensitive function configuration or private data into a public issue.

```sql
BEGIN READ ONLY;
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef, p.provolatile, p.proconfig, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'orca_legends_private') AND p.proname IN (
  'commons_my_claim', 'commons_claim_task', 'commons_release_task',
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

Verify that all write paths, including direct table grants/RLS and trigger helpers, enforce the authenticated owner, existing consent/membership, claim ownership/expiry, assigned board, current four-rating marker/direction, source/date requirements and duplicate prevention. Inspect claim concurrency/idempotency and rotation state. Follow any called helper/trigger functions into their definitions. An enabled RLS flag or a SECURITY DEFINER function name alone is not proof. If a definition is missing or unreadable, leave that check blocked. Do not replay old five-rating SQL snippets.

For the **actual** A/B finding/task IDs, the reviewer privately joins `commons_research_findings` → `research_tasks` and checks `f.contributor_id` against that participant's real authenticated account ID, ticker/task consistency, completed state, valid R4 publication and real source references. Check `claimed_owner_id` when recorded; investigate the validated legacy/null-owner path rather than treating alias equality as ownership. Confirm the two contributor IDs, task IDs and finding IDs differ. Return only pass/fail and public receipt identifiers to the shared log; keep private UUIDs/tokens out of it.

After reviewing the schema, use this read-only receipt check with privately supplied **real** IDs. The placeholders are not test accounts or data to insert. Do not publish the filled owner IDs or query text in a public issue.

```sql
BEGIN READ ONLY;
WITH expected(label, owner_id, task_id, finding_id) AS (VALUES
 ('A','<real A account ID>','<real A task ID>','<real A finding ID>'),
 ('B','<real B account ID>','<real B task ID>','<real B finding ID>')
)
SELECT e.label, f.id AS finding_id, t.id AS task_id, t.ticker,
       COALESCE(f.contributor_id::text=e.owner_id,false) AS finding_owner_matches,
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

The source URLs must still be opened and reviewed against the actual finding; the SQL marker and dates are not fact verification. A null recorded claim owner requires review of the deployed legacy/publication path, not an automatic positive result. Each own-session eligibility check remains necessary; these admin reads do not impersonate either participant.

Safe negative checks: A and B's own My assignment must not return each other's active claim; B must not inherit A's contribution through an alias; a signed-out browser must remain locked. If B was already eligible before A published, that baseline cannot test the noncontributor denial. Inspect the predicate/policies instead. **Do not try to publish, release, alter or steal the other person's task to test a suspected vulnerability on live data.** Deeper adversarial writes need a separately approved isolated test environment and are outside this run.

## 4. Separate evidence log and acceptance

Fill only from observed real results. No step below was executed by two real participants during the audit.

| Check / public evidence | Player A | Player B |
|---|---|---|
| Existing real participant and own authorized agent session | NOT RUN | NOT RUN |
| Existing account/profile/membership/consent verified; no permission changes | NOT RUN | NOT RUN |
| Distinct account IDs confirmed privately by reviewer | NOT RUN | NOT RUN |
| Baseline `allowed/status/ticker` | — | — |
| Selected ticker and existing public aliases | — | — |
| Task ID, assigned metric, board key, deadline | — | — |
| Packet matches assignment; independent source investigation | NOT RUN | NOT RUN |
| Finding ID, observed/published times, source references | — | — |
| Genuine content reviewed; rating matches evidence and assigned board | NOT RUN | NOT RUN |
| Completed task and immutable finding-owner join confirmed privately | NOT RUN | NOT RUN |
| Own-session final eligibility response | — | — |
| Result and precise blocker, if any | PENDING | PENDING |

Record board coverage separately: execution/Management **PENDING**; pricing/Earnings **PENDING**; positioning/Investors **PENDING**. Record deployed catalog/RLS/function review **BLOCKED until authorized inspection**.

Accept M1-01 only after both people have distinct genuine accepted receipts, correct private ownership, visible source-backed board findings, own-session eligibility results and verified server isolation. A claim, copied text, anonymous API row, synthetic test or two SQL subject contexts is not acceptance. Do not repeat genuine research to troubleshoot an authorization/query failure.

The current game is a single-player prototype. Two eligible accounts establish the contribution/entry prerequisite; a shared network arena, rewards and multiplayer remain separate future work and must not begin as part of this verification.
