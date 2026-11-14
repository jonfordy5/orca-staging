-- Evaluate exactly one stale company per invocation.
-- Run every day; per-company 30-day freshness and unique monthly reservations
-- enforce the user's monthly update cadence without a burst of paid calls.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
 'orca-codex-staggered-monthly-intelligence',
 '10 5 * * *',
 $job$
 select net.http_post(
  url:='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-codex-monthly-refresh',
  headers:=jsonb_build_object(
   'Content-Type','application/json',
   'x-orca-codex-job-key',
   (select secret_hex from public.orca_codex_job_keys where name='monthly')
  ),
  body:='{}'::jsonb,
  timeout_milliseconds:=120000
 );
 $job$
);
