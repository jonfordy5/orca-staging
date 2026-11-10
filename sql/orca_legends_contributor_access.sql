-- Staging-only, read-only eligibility endpoint. No research rows, existing table
-- grants, or RLS policies are changed. Ownership stays inside the database.
CREATE SCHEMA IF NOT EXISTS orca_legends_private;
REVOKE ALL ON SCHEMA orca_legends_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA orca_legends_private TO authenticated;

CREATE OR REPLACE FUNCTION orca_legends_private.contributor_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller uuid := auth.uid();
  expedition text;
BEGIN
  IF caller IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'status', 'signed_out');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_profiles p WHERE p.owner_id = caller) THEN
    RETURN jsonb_build_object('allowed', false, 'status', 'profile_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_profiles p WHERE p.owner_id = caller AND p.opted_in IS TRUE) THEN
    RETURN jsonb_build_object('allowed', false, 'status', 'permission_required');
  END IF;

  -- contributor_id is an auth.users FK protected from client SELECT. An owned
  -- accepted publication is durable proof; a mutable/shared alias is not.
  SELECT t.ticker INTO expedition
  FROM public.commons_research_findings f
  JOIN public.research_tasks t ON t.id = f.task_id
  WHERE f.contributor_id = caller
    AND t.status = 'completed'
    AND (t.claimed_owner_id IS NULL OR t.claimed_owner_id = caller)
    AND f.summary LIKE '[ORCA-R4;%'
    AND f.published_at IS NOT NULL
    AND f.published_at <= now() + interval '5 minutes'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(f.source_urls) = 'array' THEN f.source_urls ELSE '[]'::jsonb END
      ) AS source(url)
      WHERE source.url ~* '^https://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'
    )
  ORDER BY f.published_at ASC
  LIMIT 1;

  -- Publication freshness affects research reuse, not a contributor's earned
  -- participation. No private ownership IDs or finding content leave this RPC.
  IF FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'status', 'eligible', 'ticker', expedition);
  END IF;
  RETURN jsonb_build_object('allowed', false, 'status', 'contribution_required');
END;
$$;
REVOKE ALL ON FUNCTION orca_legends_private.contributor_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION orca_legends_private.contributor_access() TO authenticated;

CREATE OR REPLACE FUNCTION public.orca_legends_access()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$ SELECT orca_legends_private.contributor_access(); $$;
REVOKE ALL ON FUNCTION public.orca_legends_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orca_legends_access() TO authenticated;
COMMENT ON FUNCTION public.orca_legends_access() IS
  'Read-only current-user contributor eligibility. No arguments, alias entitlement, research work, or account writes.';
