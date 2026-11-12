-- ORCA staged OAuth read-only Data API gate.
-- CODE ONLY. DO NOT APPLY TO LIVE STAGING OR PRODUCTION WITHOUT EXPLICIT APPROVAL.
-- The global PostgREST pre-request hook is in a SEPARATE activation script.
-- This migration installs an inert access-check function + a restrictive
-- OAuth SELECT policy for team memberships. No OAuth client is approved by default.
--
-- Assumptions verified on Orca-staging November 12, 2026:
-- * public.agent_profiles has owner-scoped SELECT RLS.
-- * public.stock_research_memberships SELECT is currently team-wide.
-- * public.commons_my_claim and public.orca_my_assigned_board are owner-bound
--   and strictly read-only despite both having VOLATILE declarations.
-- * No pre-existing pgrst.db_pre_request was configured for authenticator.
--
-- IMPORTANT: Other Supabase products (Storage, Realtime, GraphQL) do not run
-- this PostgREST hook. Those require separate auditing and controls.

CREATE SCHEMA IF NOT EXISTS orca_mcp_private;
REVOKE ALL ON SCHEMA orca_mcp_private FROM PUBLIC;
GRANT USAGE ON SCHEMA orca_mcp_private TO anon, authenticated;

CREATE TABLE IF NOT EXISTS orca_mcp_private.approved_readonly_clients (
  client_id text PRIMARY KEY CHECK (char_length(client_id) BETWEEN 10 AND 256),
  resource text NOT NULL CHECK (
    resource = 'https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp'
  ),
  enabled boolean NOT NULL DEFAULT false,
  approved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE orca_mcp_private.approved_readonly_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON orca_mcp_private.approved_readonly_clients FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION orca_mcp_private.enforce_readonly_oauth_data_api()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $guard$
DECLARE
  jwt_raw text := current_setting('request.jwt.claims', true);
  claims jsonb;
  oauth_client text;
  request_method text := upper(coalesce(current_setting('request.method', true), ''));
  request_path text := coalesce(current_setting('request.path', true), '');
  request_headers jsonb;
  aud jsonb;
  expected_resource constant text :=
    'https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp';
  expected_issuer constant text :=
    'https://vbziibatnejoswsdggga.supabase.co/auth/v1';
  permitted boolean := false;
BEGIN
  -- Ordinary ORCA browser sessions are unchanged. They carry no top-level
  -- OAuth client_id. Do not inspect user_metadata: users can edit it.
  IF jwt_raw IS NULL OR btrim(jwt_raw) = '' THEN
    RETURN;
  END IF;

  BEGIN
    claims := jwt_raw::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid request identity'
      USING ERRCODE = '42501';
  END;

  oauth_client := nullif(btrim(claims ->> 'client_id'), '');
  IF oauth_client IS NULL THEN
    RETURN;
  END IF;

  -- Fail closed on a bearer from an unknown, unrelated, or mis-scoped OAuth
  -- client, including one using a valid Supabase "authenticated" audience.
  aud := claims -> 'aud';
  IF claims ->> 'iss' IS DISTINCT FROM expected_issuer
     OR NOT (
       (jsonb_typeof(aud) = 'string' AND aud #>> '{}' = expected_resource)
       OR
       (jsonb_typeof(aud) = 'array' AND aud ? expected_resource)
     )
     OR NOT EXISTS (
       SELECT 1 FROM orca_mcp_private.approved_readonly_clients approved
       WHERE approved.client_id = oauth_client
         AND approved.resource = expected_resource
         AND approved.enabled = true
     )
  THEN
    RAISE EXCEPTION 'ORCA OAuth client not approved for this resource'
      USING ERRCODE = '42501';
  END IF;

  BEGIN
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb
    );
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid request headers'
      USING ERRCODE = '42501';
  END;

  -- An alternate method or schema must never turn an allowed-looking path
  -- into a write or access to another exposed schema.
  IF request_headers ? 'x-http-method-override'
    OR (request_headers ? 'accept-profile'
         AND request_headers ->> 'accept-profile' <> 'public')
    OR (request_headers ? 'content-profile'
         AND request_headers ->> 'content-profile' <> 'public')
  THEN
    RAISE EXCEPTION 'ORCA OAuth request not permitted'
      USING ERRCODE = '42501';
  END IF;

  -- Explicit allowance for the existing strictly owner-scoped reads used
  -- by readAgentState(). Everything else, including all direct writes
  -- and all other public SECURITY DEFINER RPCs, is rejected.
  permitted := (
    request_method IN ('GET','HEAD')
    AND request_path IN ('/agent_profiles', '/stock_research_memberships')
  ) OR (
    request_method = 'POST'
    AND request_path IN (
      '/rpc/commons_my_claim',
      '/rpc/orca_my_assigned_board'
    )
  );

  IF NOT permitted THEN
    RAISE EXCEPTION 'OAuth agent may only access approved read-only ORCA endpoints'
      USING ERRCODE = '42501';
  END IF;
END;
$guard$;

-- Not an exposed public RPC: PostgREST resolves this qualified function
-- as the pre-request hook after JWT impersonation. No user parameters.
REVOKE ALL ON FUNCTION orca_mcp_private.enforce_readonly_oauth_data_api()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orca_mcp_private.enforce_readonly_oauth_data_api()
  TO anon, authenticated;

-- Team listings are public to signed-in website users today, but
-- an OAuth-connected assistant should see only its own memberships.
-- Existing browser JWTs (no client_id) retain the original team view.
DROP POLICY IF EXISTS "ORCA OAuth may view only own memberships"
  ON public.stock_research_memberships;
CREATE POLICY "ORCA OAuth may view only own memberships"
ON public.stock_research_memberships
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (
  (auth.jwt() ->> 'client_id') IS NULL
  OR user_id = (SELECT auth.uid())
);
