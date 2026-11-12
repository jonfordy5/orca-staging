-- OPERATIONS ONLY: rollback the exact ORCA staging PostgREST hook.
-- DO NOT RUN on production. This script resets only the ORCA setting below.
-- Preflight from Nov 12 confirmed authenticator had no prior pre-request hook.
-- If that baseline changes, stop rather than overwriting another setting.
-- Does NOT delete the private registry, policies, functions, any accounts or
-- research data. Supabase OAuth Server remains separate and disabled.
DO $preflight$
DECLARE
  current_hook text;
BEGIN
  SELECT string_agg(setting,',') INTO current_hook
  FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) setting
  WHERE s.setrole='authenticator'::regrole
    AND setting LIKE 'pgrst.db_pre_request=%';

  IF current_hook IS DISTINCT FROM
    'pgrst.db_pre_request=orca_mcp_private.enforce_readonly_oauth_data_api'
  THEN
    RAISE EXCEPTION 'Refusing rollback: expected exact ORCA hook, found %',
      coalesce(current_hook,'(none)');
  END IF;
END;
$preflight$;

ALTER ROLE authenticator RESET pgrst.db_pre_request;
NOTIFY pgrst, 'reload config';
