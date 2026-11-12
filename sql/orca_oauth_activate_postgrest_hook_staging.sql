-- OPERATIONS ONLY: global PostgREST API filter activation for Orca-staging.
-- DO NOT RUN unless the owner separately authorizes activation.
-- DO NOT RUN against production project hsgfwsghxdcgpjlekfqf.
-- Intended project: vbziibatnejoswsdggga (Orca-staging).
-- Before executing, capture pg_db_role_setting and current task/findings counts.
-- After executing, run signed-out + both real browser account API checks.
-- On any mismatch execute sql/orca_oauth_deactivate_postgrest_hook_staging.sql.
--
-- This script does NOT enable Supabase OAuth, register any client,
-- install an Auth access-token hook, or deploy an MCP function.
DO $preflight$
DECLARE
  existing text;
  policy_count integer;
  client_count bigint;
BEGIN
  IF to_regprocedure('orca_mcp_private.enforce_readonly_oauth_data_api()') IS NULL THEN
    RAISE EXCEPTION 'Missing reviewed ORCA read-only API function';
  END IF;
  IF to_regclass('orca_mcp_private.approved_readonly_clients') IS NULL THEN
    RAISE EXCEPTION 'Missing private OAuth approved-client registry';
  END IF;
  SELECT count(*) INTO client_count FROM orca_mcp_private.approved_readonly_clients;
  IF client_count <> 0 THEN
    RAISE EXCEPTION 'Refusing to activate while any OAuth clients are approved';
  END IF;
  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE schemaname='public' AND policyname LIKE 'ORCA OAuth%'
    AND permissive='RESTRICTIVE';
  IF policy_count <> 7 THEN
    RAISE EXCEPTION 'Expected exactly seven OAuth restrictive RLS policies; got %',policy_count;
  END IF;
  IF NOT has_function_privilege('authenticated','orca_mcp_private.enforce_readonly_oauth_data_api()','EXECUTE')
     OR NOT has_function_privilege('anon','orca_mcp_private.enforce_readonly_oauth_data_api()','EXECUTE') THEN
    RAISE EXCEPTION 'PostgREST roles lack required pre-request function EXECUTE privilege';
  END IF;
  SELECT string_agg(setting,',') INTO existing
  FROM pg_db_role_setting role_settings
  CROSS JOIN LATERAL unnest(role_settings.setconfig) setting
  WHERE role_settings.setrole='authenticator'::regrole
    AND setting LIKE 'pgrst.db_pre_request=%';
  IF existing IS NOT NULL THEN
    RAISE EXCEPTION 'Another pre-request hook is configured. Review it; do not overwrite';
  END IF;
END;
$preflight$;

-- Set only for the PostgREST database connection role. This is a global
-- change to staging REST/RPC behavior, NOT a local/temporary transaction.
ALTER ROLE authenticator SET pgrst.db_pre_request =
  'orca_mcp_private.enforce_readonly_oauth_data_api';
NOTIFY pgrst, 'reload config';
