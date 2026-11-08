-- Explicitly authorized development policy (November 2026).
-- Remove arbitrary history generation cooldown, ten-per-day, and shared
-- $15 monthly reservation pool. Keep consent, ticker-level concurrency lock,
-- no duplicate event records, and $0.15 reserve per requested execution.
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
 -- No time-based cooldowns or shared monthly reservation cap in development.
 -- Completed starter histories remain cached; current/era refresh is separate.
 SELECT count(*) INTO v_recent_count
 FROM public.orca_timeline_annotations
 WHERE ticker=v_ticker AND category<>'custom_note' AND created_by IS NULL;
 IF v_recent_count>=10 THEN
  RETURN jsonb_build_object('state','cached','cached_milestones',v_recent_count,
   'reason','starter_history_complete');
 END IF;
 INSERT INTO public.orca_timeline_generation_runs(ticker,requested_by,month_utc,reserved_usd,is_targeted_completion)
 VALUES(v_ticker,p_user,v_month,0.15,v_recent_count IN (8,9)) RETURNING id INTO v_run;
 RETURN jsonb_build_object('state','reserved','run_id',v_run,'reserve_usd',0.15);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.orca_timeline_reserve_scoped_generation(p_ticker text, p_user uuid, p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_ticker text:=upper(pg_catalog.btrim(p_ticker));
 v_scope text:=lower(pg_catalog.btrim(p_scope));
 v_month date:=date_trunc('month',now() AT TIME ZONE 'UTC')::date;
 v_year int:=extract(year from (now() AT TIME ZONE 'UTC'))::int;
 v_half_start timestamptz;
 v_last_scope timestamptz;
 v_recent_user int;
 v_used numeric;
 v_run uuid;
BEGIN
 IF p_user IS NULL OR v_ticker !~ '^[A-Z][A-Z0-9.]{0,9}$'
  OR v_scope NOT IN ('origin','current')
  OR NOT EXISTS(SELECT 1 FROM public.stocks WHERE ticker=v_ticker) THEN
  RAISE EXCEPTION 'Invalid stock, owner or research scope' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_profiles p
  WHERE p.owner_id=p_user AND p.opted_in IS TRUE) THEN
  RAISE EXCEPTION 'Opted-in ORCA researcher required' USING ERRCODE='42501';
 END IF;
 v_half_start:=pg_catalog.make_timestamptz(v_year,
  CASE WHEN extract(month from (now() AT TIME ZONE 'UTC'))<7 THEN 1 ELSE 7 END,
  1,0,0,0,'UTC');
 -- Shared synthesis/history reservation pool plus per-company concurrency.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('orca-timeline-ticker:'||v_ticker,0));
 UPDATE public.orca_timeline_generation_runs SET
  state='failed',finished_at=now(),error_code='interrupted'
 WHERE ticker=v_ticker AND state='running' AND attempted_at<now()-interval '5 minutes';
 IF EXISTS(SELECT 1 FROM public.orca_timeline_generation_runs
  WHERE ticker=v_ticker AND state='running') THEN
  RETURN jsonb_build_object('state','building');
 END IF;
 IF v_scope='origin' THEN
  IF EXISTS(SELECT 1 FROM public.orca_timeline_annotations
   WHERE ticker=v_ticker AND created_by IS NULL
    AND (lower(title) ~ '(found(ed|ing)?|incorporat(ed|ion)|establish(ed|ment)|began as|begins as)'
      OR quick_brief->>'era'='founding')) THEN
   RETURN jsonb_build_object('state','cached','reason','founding_already_present');
  END IF;
 ELSE
  -- New semester must contain a new dated event, not merely an old upload.
  IF EXISTS(SELECT 1 FROM public.orca_timeline_annotations
   WHERE ticker=v_ticker AND created_by IS NULL AND event_at>=v_half_start
    AND event_at<=now()) THEN
   RETURN jsonb_build_object('state','cached','reason','current_half_year_covered');
  END IF;
 END IF;
 -- Failed or unproductive research does not block subsequent authorized
 -- researcher-initiated attempts. Successful already-cached founding or
 -- current-period events are still reused rather than duplicated.
 INSERT INTO public.orca_timeline_generation_runs(
  ticker,requested_by,month_utc,reserved_usd,is_targeted_completion,research_scope
 ) VALUES(v_ticker,p_user,v_month,0.15,false,v_scope)
 RETURNING id INTO v_run;
 RETURN jsonb_build_object('state','reserved','run_id',v_run,'scope',v_scope,'reserve_usd',0.15);
END;
$function$
;
