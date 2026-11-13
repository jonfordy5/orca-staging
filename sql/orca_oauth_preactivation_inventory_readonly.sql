-- ORCA STAGING ONLY — read-only OAuth preactivation inventory.
-- Run only against vbziibatnejoswsdggga using the connected Supabase SQL reader.
-- This reads DB catalog metadata, NOT identities, tokens, research records, or secrets.
-- Export the gate_inventory JSON object to a local file if checking it with Node.
WITH public_writes AS (
 SELECT c.relname AS name,c.relrowsecurity AS rls,
   has_table_privilege('authenticated',c.oid,'INSERT') AS can_insert,
   has_table_privilege('authenticated',c.oid,'UPDATE') AS can_update,
   has_table_privilege('authenticated',c.oid,'DELETE') AS can_delete
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p')
 AND (has_table_privilege('authenticated',c.oid,'INSERT') OR
      has_table_privilege('authenticated',c.oid,'UPDATE') OR
      has_table_privilege('authenticated',c.oid,'DELETE'))
), other_writes AS (
 SELECT n.nspname AS schema_name,c.relname AS name,c.relrowsecurity AS rls,
   (SELECT count(*) FROM pg_policies pol WHERE pol.schemaname=n.nspname
    AND pol.tablename=c.relname AND pol.permissive='PERMISSIVE') AS permissive_policies
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('storage','realtime') AND c.relkind IN ('r','p')
 AND (has_table_privilege('authenticated',c.oid,'INSERT') OR
      has_table_privilege('authenticated',c.oid,'UPDATE') OR
      has_table_privilege('authenticated',c.oid,'DELETE'))
), rpcs AS (
 SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args,
        p.prosecdef AS definer
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND has_function_privilege('authenticated',p.oid,'EXECUTE')
), oauth_policies AS (
 SELECT tablename AS table_name,policyname AS name,cmd,permissive,roles::text AS roles,
        coalesce(qual,'') AS using_clause,coalesce(with_check,'') AS check_clause
 FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'ORCA OAuth%'
)
SELECT jsonb_build_object(
 'project_ref','vbziibatnejoswsdggga',
 'postgrest_guard_configured',EXISTS(
  SELECT 1 FROM pg_roles WHERE rolname='authenticator'
  AND array_to_string(rolconfig,',') LIKE
    '%pgrst.db_pre_request=orca_mcp_private.enforce_readonly_oauth_data_api%'),
 'approved_clients',(SELECT count(*) FROM orca_mcp_private.approved_readonly_clients),
 'public_writable',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM public_writes x),'[]'::jsonb),
 'other_writable',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.schema_name,x.name) FROM other_writes x),'[]'::jsonb),
 'oauth_policies',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.table_name,x.name) FROM oauth_policies x),'[]'::jsonb),
 'rpc_count',(SELECT count(*) FROM rpcs),
 'rpc_definers',(SELECT count(*) FROM rpcs WHERE definer),
 'rpc_digest',(SELECT md5(string_agg(name||'|'||args||'|'||definer::text,E'\n' ORDER BY name,args)) FROM rpcs),
 'pg_graphql_installed',(SELECT count(*)>0 FROM pg_extension WHERE extname='pg_graphql'),
 'graphql_executable',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='graphql' AND has_function_privilege('authenticated',p.oid,'EXECUTE'))
) AS gate_inventory;
