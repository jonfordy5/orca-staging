-- Staging-only pre-OAuth direct-API exposure assessment.
-- Read-only catalog query; no accounts, JWTs, table contents or identifiers returned.
-- This is a CANDIDATE count: names and source-text scans are NOT a full code audit.
-- Do not enable OAuth until all direct write paths are protected by verified policy.

WITH functions AS (
  SELECT p.oid,p.proname,p.prosecdef,p.prosrc
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'EXECUTE')
), public_tables AS (
  SELECT c.oid,c.relrowsecurity FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
)
SELECT
  (SELECT count(*) FROM functions) AS user_callable_public_functions,
  (SELECT count(*) FROM functions WHERE prosecdef) AS security_definer_functions,
  (SELECT count(*) FROM functions WHERE proname ~* 'claim|publish|consent|profile|team|join|leave|assign|request') AS possible_write_rpcs,
  (SELECT count(*) FROM functions WHERE prosrc ~* 'client_id') AS functions_with_client_identifier_text,
  (SELECT count(*) FROM public_tables WHERE has_table_privilege('authenticated',oid,'INSERT')
     OR has_table_privilege('authenticated',oid,'UPDATE')
     OR has_table_privilege('authenticated',oid,'DELETE')) AS directly_writable_tables,
  (SELECT count(*) FROM public_tables WHERE relrowsecurity) AS rls_enabled_tables;
