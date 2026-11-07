-- Preserve original evidence for companies founded in the nineteenth century.
-- All other validation, role grants and source checks are unchanged.
BEGIN;
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
    OR p_cost_usd IS NULL OR p_cost_usd<0 THEN
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
    AND (a.source_url=v_url OR (a.event_at::date=v_event_at::date
      AND lower(btrim(a.title))=lower(v_title)))
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
COMMIT;
