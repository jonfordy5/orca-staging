BEGIN READ ONLY;
-- Verify the real RKLB owner's data using an authenticated SQL role context.
-- This is not an end-user browser session or a minted JWT.
DO $$
DECLARE target uuid;
BEGIN
  SELECT f.contributor_id INTO target FROM public.commons_research_findings f
  JOIN public.agent_profiles p ON p.owner_id=f.contributor_id
  WHERE f.ticker='RKLB' AND p.display_name='ORCA Test Researcher 1'
    AND f.published_at >= '2026-11-10T05:53:00Z'::timestamptz AND f.published_at < '2026-11-10T05:54:00Z'::timestamptz;
  IF target IS NULL THEN RAISE EXCEPTION 'Required real RKLB fixture is missing'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commons_research_findings f JOIN public.research_tasks t ON t.id=f.task_id
    JOIN public.agent_profiles p ON p.owner_id=f.contributor_id
    WHERE f.ticker='RKLB' AND f.published_at >= '2026-11-10T05:53:00Z'::timestamptz AND f.published_at < '2026-11-10T05:54:00Z'::timestamptz AND f.contributor_id=target
      AND t.status='completed' AND p.opted_in IS TRUE AND f.summary LIKE '[ORCA-R4;%'
      AND f.published_at IS NOT NULL AND f.published_at <= now()+interval '5 minutes'
      AND (t.claimed_owner_id IS NULL OR t.claimed_owner_id=target)
      AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(f.source_urls) src(url) WHERE src.url LIKE 'https://%')
  ) THEN RAISE EXCEPTION 'Actual RKLB record does not meet eligibility predicate'; END IF;
  PERFORM set_config('request.jwt.claim.sub',target::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',target::text,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
  IF current_user <> 'authenticated' THEN RAISE EXCEPTION 'Wrong SQL role'; END IF;
  result:=public.orca_legends_access();
  IF result->>'allowed' IS DISTINCT FROM 'true' OR result->>'status' IS DISTINCT FROM 'eligible'  THEN
    RAISE EXCEPTION 'Real RKLB owner was not eligible: %',result;
  END IF;
END $$;
RESET ROLE;
-- A genuine different opted-in profile with no completed accepted contribution
-- must not inherit the first owner's public finding or display alias.
DO $$
DECLARE target uuid;
BEGIN
  SELECT p.owner_id INTO target FROM public.agent_profiles p
  WHERE p.opted_in IS TRUE AND NOT EXISTS(
    SELECT 1 FROM public.commons_research_findings f
    JOIN public.research_tasks t ON t.id=f.task_id
    WHERE f.contributor_id=p.owner_id AND t.status='completed' AND f.summary LIKE '[ORCA-R4;%'
  ) LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'Required existing noncontributor fixture missing'; END IF;
  PERFORM set_config('request.jwt.claim.sub',target::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',target::text,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
  result:=public.orca_legends_access();
  IF result->>'allowed' IS DISTINCT FROM 'false' OR result->>'status' IS DISTINCT FROM 'contribution_required' THEN
    RAISE EXCEPTION 'Different noncontributing owner was not denied: %',result;
  END IF;
END $$;
RESET ROLE;
-- Even an authenticated SQL role fails closed if the JWT subject is absent.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE result jsonb;
BEGIN
  result:=public.orca_legends_access();
  IF result->>'allowed' IS DISTINCT FROM 'false' OR result->>'status' IS DISTINCT FROM 'signed_out' THEN
    RAISE EXCEPTION 'Missing JWT subject was not denied: %',result;
  END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
  IF has_function_privilege('anon','public.orca_legends_access()','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous RPC execute must stay revoked';
  END IF;
  IF has_column_privilege('authenticated','public.commons_research_findings','contributor_id','SELECT') THEN
    RAISE EXCEPTION 'Protected contributor ownership column was exposed';
  END IF;
END $$;
ROLLBACK;
SELECT jsonb_build_object(
 'realRklbOwnerSqlRoleEligible',true,
 'differentExistingOwnerDenied',true,
 'missingJwtSubjectDenied',true,
 'anonymousExecuteDenied',true,
 'protectedColumnGrantPreserved',true,
 'rolledBack',true,
 'realAuthenticatedBrowserSession',false
) AS role_context_test_results;
