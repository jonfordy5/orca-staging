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
    AND (lower(title) ~ '(found(ed|ing)?|incorporat(e(d|s)?|ing|ion)|establish(ed|ment)|began as|begins as|first (store|operation|business|restaurant|location)|open(s|ed)?[[:space:]]+(the[[:space:]]+)?first|launch(es|ed)[[:space:]]+at[[:space:]]+(harvard|a university|university|college))'
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

-- Allocate only this stage's share of the single click estimate. Preserve
-- the existing consent check, company lock, cache and interrupted-run recovery.
CREATE OR REPLACE FUNCTION public.orca_timeline_reserve_generation(p_ticker text, p_user uuid, p_budget_usd numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_result jsonb;
BEGIN
 IF p_budget_usd IS NULL OR p_budget_usd<=0 OR p_budget_usd>0.15 THEN
  RAISE EXCEPTION 'Invalid timeline stage budget' USING ERRCODE='22023';
 END IF;
 v_result:=public.orca_timeline_reserve_generation(p_ticker,p_user);
 IF v_result->>'state'='reserved' THEN
  UPDATE public.orca_timeline_generation_runs SET reserved_usd=p_budget_usd
  WHERE id=(v_result->>'run_id')::uuid;
  v_result:=v_result||jsonb_build_object('reserve_usd',p_budget_usd);
 END IF;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.orca_timeline_reserve_generation(text,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orca_timeline_reserve_generation(text,uuid,numeric) TO service_role;

-- Allocate only this stage's share of the single click estimate. Preserve
-- the existing consent check, company lock, cache and interrupted-run recovery.
CREATE OR REPLACE FUNCTION public.orca_timeline_reserve_scoped_generation(p_ticker text, p_user uuid, p_scope text, p_budget_usd numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_result jsonb;
BEGIN
 IF p_budget_usd IS NULL OR p_budget_usd<=0 OR p_budget_usd>0.15 THEN
  RAISE EXCEPTION 'Invalid timeline stage budget' USING ERRCODE='22023';
 END IF;
 v_result:=public.orca_timeline_reserve_scoped_generation(p_ticker,p_user,p_scope);
 IF v_result->>'state'='reserved' THEN
  UPDATE public.orca_timeline_generation_runs SET reserved_usd=p_budget_usd
  WHERE id=(v_result->>'run_id')::uuid;
  v_result:=v_result||jsonb_build_object('reserve_usd',p_budget_usd);
 END IF;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.orca_timeline_reserve_scoped_generation(text,uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orca_timeline_reserve_scoped_generation(text,uuid,text,numeric) TO service_role;

-- Publishing must respect the allocated stage budget as well as the click cap.
CREATE OR REPLACE FUNCTION public.orca_timeline_finish_generation(p_run_id uuid, p_events jsonb, p_cost_usd numeric, p_search_calls integer, p_input_tokens integer, p_output_tokens integer, p_error_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_run public.orca_timeline_generation_runs%ROWTYPE;
 v_event jsonb;
 v_added int:=0;
 v_event_at timestamptz;
 v_title text;
 v_summary text;
 v_url text;
 v_cat text;
 v_img text;
 v_credit text;
BEGIN
 SELECT * INTO v_run FROM public.orca_timeline_generation_runs
 WHERE id=p_run_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown timeline run'; END IF;
 IF v_run.state<>'running' THEN
  RETURN jsonb_build_object('state',v_run.state);
 END IF;
 IF p_error_code IS NOT NULL THEN
  UPDATE public.orca_timeline_generation_runs SET
   state='failed',finished_at=now(),error_code=left(p_error_code,100),
   estimated_actual_usd=coalesce(p_cost_usd,0),
   web_search_calls=p_search_calls,input_tokens=p_input_tokens,output_tokens=p_output_tokens
  WHERE id=p_run_id;
  RETURN jsonb_build_object('state','failed');
 END IF;
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array'
    OR jsonb_array_length(p_events)<1
    OR jsonb_array_length(p_events)>12
    OR p_cost_usd IS NULL OR p_cost_usd<0 OR p_cost_usd>least(0.15,v_run.reserved_usd) THEN
   RAISE EXCEPTION 'Invalid timeline batch' USING ERRCODE='22023';
 END IF;
 -- Insert all validated sourced events as one transaction; never replace archived events.
 FOR v_event IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  v_title:=btrim(v_event->>'title');
  v_summary:=btrim(v_event->>'summary');
  v_url:=v_event->>'source_url';
  v_cat:=v_event->>'category';
  v_img:=nullif(btrim(v_event->>'image_url'),'');
  v_credit:=nullif(btrim(v_event->>'image_credit'),'');
  IF v_cat NOT IN ('earnings','product','macro','legal') OR
    char_length(v_title) NOT BETWEEN 4 AND 100 OR
    char_length(v_summary) NOT BETWEEN 20 AND 500 OR
    char_length(v_url)>500 OR v_url !~* '^https://[^[:space:]]+$' OR
    (v_img IS NOT NULL AND (char_length(v_img)>1000 OR v_img !~* '^https://[^[:space:]]+$')) OR
    (v_credit IS NOT NULL AND char_length(v_credit)>160) THEN
   RAISE EXCEPTION 'Unacceptable milestone content' USING ERRCODE='22023';
  END IF;
  BEGIN
   v_event_at:=(v_event->>'date')::date::timestamptz + interval '12 hours';
  EXCEPTION WHEN OTHERS THEN
   RAISE EXCEPTION 'Invalid milestone date' USING ERRCODE='22023';
  END;
  IF v_event_at>now()+interval '5 minutes'
    OR v_event_at<timestamp with time zone '1800-01-01' THEN
   RAISE EXCEPTION 'Milestone date out of range' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(
   SELECT 1 FROM public.orca_timeline_annotations a
   WHERE a.ticker=v_run.ticker
    AND (lower(btrim(a.title))=lower(v_title) OR (a.source_url=v_url AND a.event_at::date=v_event_at::date))
  ) THEN
   INSERT INTO public.orca_timeline_annotations(
    ticker,event_at,category,title,ai_summary,source_url,created_by,image_url,image_credit,quick_brief)
   VALUES(v_run.ticker,v_event_at,v_cat,v_title,v_summary,v_url,NULL,v_img,v_credit,
    CASE WHEN jsonb_typeof(v_event->'points')='array'
      AND jsonb_typeof(v_event->'why')='string'
      THEN jsonb_build_object('points',v_event->'points','why',v_event->'why')
      ELSE NULL END);
   v_added:=v_added+1;
  END IF;
 END LOOP;
 UPDATE public.orca_timeline_generation_runs SET
  state='ready',events_added=v_added,finished_at=now(),estimated_actual_usd=p_cost_usd,
  web_search_calls=p_search_calls,input_tokens=p_input_tokens,output_tokens=p_output_tokens
 WHERE id=p_run_id;
 RETURN jsonb_build_object('state','ready','added',v_added);
END;
$function$
;
