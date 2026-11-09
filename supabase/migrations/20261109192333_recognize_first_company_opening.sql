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
 v_year_start timestamptz;
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
 v_year_start:=pg_catalog.make_timestamptz(v_year,
  1,
  1,0,0,0,'UTC');
 -- Per-company concurrency; development has no shared monthly pool.
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
   WHERE ticker=v_ticker AND created_by IS NULL AND category<>'custom_note'
    AND (lower(title) ~ '\m(found(ed|ing)?|incorporat(e(d|s)?|ing|ion)|establish(ed|ment)|began as|begins as|first (store|operation|business|restaurant|location)|first[[:space:]]+.{1,50}[[:space:]]+(opens?|opened)|open(s|ed)?[[:space:]]+(the[[:space:]]+)?first|launch(es|ed)[[:space:]]+at[[:space:]]+(harvard|a university|university|college))\M'
      OR quick_brief->>'era'='founding')) THEN
   RETURN jsonb_build_object('state','cached','reason','founding_already_present');
  END IF;
 ELSE
  -- Completion needs a dated event in the current calendar year.
  IF EXISTS(SELECT 1 FROM public.orca_timeline_annotations
   WHERE ticker=v_ticker AND created_by IS NULL AND category<>'custom_note' AND event_at>=v_year_start
    AND event_at<=now()) THEN
   RETURN jsonb_build_object('state','cached','reason','current_year_covered');
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
