-- M1-01 / ORCA Stock Commons: private read-only staging readiness.
-- Do not publish account UUIDs, passwords, session material, or raw identities.
-- Execute ONLY on Orca-staging. This never claims, publishes, or updates tasks.
-- Historical data is context; it cannot satisfy the new two-person A/B mission.
--
-- Result set 1: Aggregate activity and independent account coverage.
SELECT
  (SELECT count(*) FROM public.agent_profiles) AS researcher_profiles,
  (SELECT count(*) FROM public.agent_profiles WHERE opted_in IS TRUE) AS opted_in_profiles,
  (SELECT count(*) FROM public.agent_profiles WHERE independent_publish_enabled IS TRUE) AS independent_publish_enabled,
  (SELECT count(*) FROM public.stock_research_memberships) AS ticker_memberships,
  (SELECT count(*) FROM public.research_tasks) AS total_tasks,
  (SELECT count(*) FROM public.research_tasks WHERE status = 'completed') AS completed_tasks,
  (SELECT count(*) FROM public.research_tasks WHERE status = 'claimed' AND claimed_until > now()) AS active_claims,
  (SELECT count(*) FROM public.commons_research_findings) AS existing_findings,
  (SELECT count(DISTINCT contributor_id) FROM public.commons_research_findings) AS previous_distinct_contributor_accounts;

-- Result set 2: Existing stock memberships suitable for an independent two-user test.
-- No identity, alias, or individual membership rows leave this query.
SELECT m.ticker,
       count(DISTINCT m.user_id) AS joined_account_count,
       count(DISTINCT m.user_id) FILTER (
         WHERE EXISTS (
           SELECT 1 FROM public.agent_profiles p
           WHERE p.owner_id = m.user_id AND p.opted_in IS TRUE
         )
       ) AS opted_in_joined_account_count
FROM public.stock_research_memberships m
GROUP BY m.ticker
HAVING count(DISTINCT m.user_id) >= 2
ORDER BY joined_account_count DESC, m.ticker;

-- Result set 3: Current research receipt integrity and legacy caveats.
-- The optional board assignment was introduced during the October 31 changes.
-- Missing historical assignments must be reviewed, not silently fabricated.
-- Missing assignments on *new* publications are a blocker for the A/B test.
WITH receipt AS (
  SELECT
    f.id,
    f.ticker AS finding_ticker,
    f.contributor_id,
    f.summary,
    f.source_urls,
    f.observed_at,
    f.published_at,
    t.id AS joined_task,
    t.ticker AS task_ticker,
    t.status AS task_status,
    t.claimed_owner_id,
    a.task_id AS board_task,
    a.ticker AS board_ticker,
    a.board_key,
    EXISTS (
      SELECT 1 FROM public.agent_profiles p
      WHERE p.owner_id = f.contributor_id
    ) AS has_owned_profile,
    CASE WHEN jsonb_typeof(f.source_urls) = 'array'
      THEN jsonb_array_length(f.source_urls) ELSE 0 END AS source_count
  FROM public.commons_research_findings f
  LEFT JOIN public.research_tasks t ON t.id = f.task_id
  LEFT JOIN public.orca_research_board_assignments a ON a.task_id = f.task_id
)
SELECT
  count(*) AS findings_checked,
  count(DISTINCT id) AS distinct_findings,
  count(*) FILTER (WHERE joined_task IS NULL) AS missing_task,
  count(*) FILTER (WHERE task_status IS DISTINCT FROM 'completed') AS unfinished_task,
  count(*) FILTER (WHERE finding_ticker IS DISTINCT FROM task_ticker) AS stock_mismatch,
  count(*) FILTER (WHERE claimed_owner_id IS NOT NULL AND claimed_owner_id IS DISTINCT FROM contributor_id) AS recorded_owner_mismatch,
  count(*) FILTER (WHERE NOT has_owned_profile) AS missing_owned_profile,
  count(*) FILTER (WHERE source_count NOT BETWEEN 1 AND 5) AS source_count_failure,
  count(*) FILTER (WHERE summary NOT LIKE '[ORCA-R4;%') AS unexpected_finding_format,
  count(*) FILTER (WHERE published_at > now() OR observed_at > now()) AS future_dated,
  count(*) FILTER (WHERE board_task IS NOT NULL AND board_key NOT IN ('execution','pricing','positioning')) AS invalid_board_key,
  count(*) FILTER (WHERE board_task IS NOT NULL AND board_ticker IS DISTINCT FROM finding_ticker) AS board_stock_mismatch,
  count(*) FILTER (WHERE board_task IS NULL AND published_at < '2026-11-01'::timestamptz) AS historical_missing_board,
  count(*) FILTER (WHERE board_task IS NULL AND published_at >= '2026-11-01'::timestamptz) AS newer_missing_board
FROM receipt;

-- IMPORTANT: no aggregate here validates real human distinctness, agent
-- independence, source truth, owner-session isolation, or a NEW A/B publication.
-- Those require the existing docs/m1-01-two-person-test-procedure.md.
