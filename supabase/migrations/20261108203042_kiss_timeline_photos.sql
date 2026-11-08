-- Server-only cache of business queries and a short concurrent-request lease.
CREATE TABLE public.orca_timeline_photo_jobs (
 ticker text PRIMARY KEY REFERENCES public.stocks(ticker),
 queries text[], lock_token uuid, locked_until timestamptz
);
ALTER TABLE public.orca_timeline_photo_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orca_timeline_photo_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.orca_timeline_photo_jobs TO service_role;
CREATE OR REPLACE FUNCTION public.orca_timeline_lock_photos(p_ticker text,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 INSERT INTO public.orca_timeline_photo_jobs(ticker,lock_token,locked_until)
 VALUES(p_ticker,p_token,now()+interval '3 minutes')
 ON CONFLICT(ticker) DO UPDATE SET lock_token=excluded.lock_token,locked_until=excluded.locked_until
 WHERE public.orca_timeline_photo_jobs.locked_until IS NULL OR public.orca_timeline_photo_jobs.locked_until<now();
 RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.orca_timeline_lock_photos(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orca_timeline_lock_photos(text,uuid) TO service_role;
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
    OR p_cost_usd IS NULL OR p_cost_usd<0 OR p_cost_usd>0.15 THEN
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
$function$;
