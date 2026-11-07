-- ORCA: allow ONE immediate targeted completion after a broad partial history.
-- Preserves authenticated researcher/opt-in check, ticker & monthly advisory locks,
-- per-user daily limit, failed-request cooldown, and the shared $15 budget ceiling.
-- Existing generation rows default to broad history (false).
BEGIN;
ALTER TABLE public.orca_timeline_generation_runs
 ADD COLUMN IF NOT EXISTS is_targeted_completion boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.orca_timeline_generation_runs.is_targeted_completion IS
 'One targeted completion attempt (8 or 9 verified milestones); capped to one per ticker in 24 hours.';
CREATE OR REPLACE FUNCTION public.orca_timeline_reserve_generation(p_ticker text, p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_ticker text:=upper(btrim(p_ticker));
 v_month date:=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 v_used numeric;
 v_run uuid;
 v_recent timestamptz;
 v_recent_count int;
 v_targeted_attempt_at timestamptz;
 v_user_recent int;
BEGIN
 IF p_user IS NULL OR v_ticker !~ '^[A-Z][A-Z0-9.]{0,9}$'
    OR NOT EXISTS(SELECT 1 FROM public.stocks WHERE ticker=v_ticker) THEN
  RAISE EXCEPTION 'Unknown ticker or requester' USING ERRCODE='22023';
 END IF;
 -- Public history research is shared per company, not an agent task.
 -- Only an opted-in, signed-in researcher may reserve a generation.
 -- Stock-specific membership is still required by the independent-research flows.
 IF NOT EXISTS(
   SELECT 1 FROM public.agent_profiles p
   WHERE p.owner_id=p_user AND p.opted_in IS TRUE
 ) THEN
  RAISE EXCEPTION 'Opted-in ORCA researcher required' USING ERRCODE='42501';
 END IF;
 -- Match the existing synthesis lock: both features share ONE $15 monthly reservation pool.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('orca-majority-month:'||v_month::text,0)
 );
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('orca-timeline-ticker:'||v_ticker,0)
 );
 -- Recover calls that vanished without a completion response.
 UPDATE public.orca_timeline_generation_runs SET state='failed',
   finished_at=now(),error_code='interrupted'
 WHERE ticker=v_ticker AND state='running' AND attempted_at<now()-interval '5 minutes';
 IF EXISTS(SELECT 1 FROM public.orca_timeline_generation_runs
   WHERE ticker=v_ticker AND state='running') THEN
   RETURN jsonb_build_object('state','building');
 END IF;
 -- Always read the current verified count before deciding whether a retry
 -- is a narrowly scoped, one-off completion of an 8/9-milestone history.
 SELECT count(*) INTO v_recent_count
 FROM public.orca_timeline_annotations
 WHERE ticker=v_ticker AND category<>'custom_note' AND created_by IS NULL;
 SELECT max(attempted_at) INTO v_recent
 FROM public.orca_timeline_generation_runs WHERE ticker=v_ticker AND state='ready';
 SELECT max(attempted_at) INTO v_targeted_attempt_at
 FROM public.orca_timeline_generation_runs
 WHERE ticker=v_ticker AND is_targeted_completion IS TRUE
   AND attempted_at>now()-interval '24 hours';
 -- A complete timeline still uses the original 90-day cache rule.
 IF v_recent_count>=10 AND v_recent>now()-interval '90 days' THEN
  RETURN jsonb_build_object('state','cached','cached_milestones',v_recent_count,
   'refresh_eligible_after',v_recent+interval '90 days');
 END IF;
 -- Prevent repeated near-completion searches: only ONE targeted attempt may
 -- run per stock in any rolling 24-hour window, even across different users.
 IF v_recent_count IN (8,9) AND v_targeted_attempt_at IS NOT NULL THEN
  RETURN jsonb_build_object('state','cached','cached_milestones',v_recent_count,
   'reason','targeted_retry_already_used',
   'refresh_eligible_after',v_targeted_attempt_at+interval '24 hours');
 END IF;
 -- Normal underfilled histories retain the original 24-hour cooldown.
 -- The single exception is the FIRST targeted 8/9 completion attempt.
 IF v_recent>now()-interval '24 hours' AND v_recent_count NOT IN (8,9) THEN
  RETURN jsonb_build_object('state','cached','cached_milestones',v_recent_count,
   'refresh_eligible_after',v_recent+interval '24 hours');
 END IF;
 IF EXISTS(SELECT 1 FROM public.orca_timeline_generation_runs
   WHERE ticker=v_ticker AND state='failed' AND attempted_at>now()-interval '24 hours') THEN
   RETURN jsonb_build_object('state','cooldown');
 END IF;
 SELECT count(*) INTO v_user_recent FROM public.orca_timeline_generation_runs
 WHERE requested_by=p_user AND attempted_at>now()-interval '24 hours';
 IF v_user_recent>=10 THEN
  RETURN jsonb_build_object('state','daily_limit');
 END IF;
 SELECT
  (SELECT coalesce(sum(reserved_usd),0) FROM public.orca_majority_synthesis_runs WHERE month_utc=v_month)+
  (SELECT coalesce(sum(reserved_usd),0) FROM public.orca_timeline_generation_runs WHERE month_utc=v_month)
 INTO v_used;
 IF v_used+0.15>15 THEN
  RETURN jsonb_build_object('state','budget_exhausted',
   'monthly_reservation_limit_usd',15,'reserved_so_far_usd',v_used);
 END IF;
 INSERT INTO public.orca_timeline_generation_runs(ticker,requested_by,month_utc,reserved_usd,is_targeted_completion)
 VALUES(v_ticker,p_user,v_month,0.15,v_recent_count IN (8,9)) RETURNING id INTO v_run;
 RETURN jsonb_build_object('state','reserved','run_id',v_run,'reserve_usd',0.15);
END;
$function$;

COMMIT;
