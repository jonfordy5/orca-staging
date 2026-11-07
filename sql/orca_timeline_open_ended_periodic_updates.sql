-- Open-ended company timelines: scoped, source-backed, opt-in historical origin
-- and semiannual current-year bulletins. No fixed number of saved events or cards.
BEGIN;
ALTER TABLE public.orca_timeline_generation_runs
 ADD COLUMN IF NOT EXISTS research_scope text NOT NULL DEFAULT 'history';
ALTER TABLE public.orca_timeline_generation_runs
 ADD CONSTRAINT orca_timeline_generation_scope_check
 CHECK (research_scope IN ('history','origin','current'));
REVOKE ALL ON FUNCTION public.orca_timeline_reserve_generation(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.orca_timeline_reserve_scoped_generation(
 p_ticker text,p_user uuid,p_scope text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
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
  pg_catalog.hashtextextended('orca-majority-month:'||v_month::text,0));
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
 SELECT max(attempted_at) INTO v_last_scope
 FROM public.orca_timeline_generation_runs
 WHERE ticker=v_ticker AND research_scope=v_scope AND
  (CASE WHEN v_scope='current' THEN attempted_at>=v_half_start
   ELSE attempted_at>now()-interval '24 hours' END);
 -- At most one current-event generation per ticker/half-year; one origin
 -- research request per 24h to prevent loops and duplicate paid searches.
 IF v_last_scope IS NOT NULL THEN
  RETURN jsonb_build_object('state','cached','reason','scope_retry_limit',
   'refresh_eligible_after',CASE WHEN v_scope='current'
    THEN v_half_start+interval '6 months'
    ELSE v_last_scope+interval '24 hours' END);
 END IF;
 IF EXISTS(SELECT 1 FROM public.orca_timeline_generation_runs
   WHERE ticker=v_ticker AND state='failed'
   AND attempted_at>now()-interval '24 hours') THEN
  RETURN jsonb_build_object('state','cooldown');
 END IF;
 SELECT count(*) INTO v_recent_user FROM public.orca_timeline_generation_runs
  WHERE requested_by=p_user AND attempted_at>now()-interval '24 hours';
 IF v_recent_user>=10 THEN RETURN jsonb_build_object('state','daily_limit'); END IF;
 SELECT (SELECT coalesce(sum(reserved_usd),0)
   FROM public.orca_majority_synthesis_runs WHERE month_utc=v_month)
   +(SELECT coalesce(sum(reserved_usd),0)
   FROM public.orca_timeline_generation_runs WHERE month_utc=v_month)
 INTO v_used;
 IF v_used+0.15>15 THEN
  RETURN jsonb_build_object('state','budget_exhausted',
   'monthly_reservation_limit_usd',15,'reserved_so_far_usd',v_used);
 END IF;
 INSERT INTO public.orca_timeline_generation_runs(
  ticker,requested_by,month_utc,reserved_usd,is_targeted_completion,research_scope
 ) VALUES(v_ticker,p_user,v_month,0.15,false,v_scope)
 RETURNING id INTO v_run;
 RETURN jsonb_build_object('state','reserved','run_id',v_run,'scope',v_scope,'reserve_usd',0.15);
END;
$function$;
REVOKE ALL ON FUNCTION public.orca_timeline_reserve_scoped_generation(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orca_timeline_reserve_scoped_generation(text,uuid,text) TO service_role;
COMMIT;
