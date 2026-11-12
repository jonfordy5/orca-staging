-- STAGING CANDIDATE ONLY. DO NOT RUN/REGISTER THIS HOOK IN SUPABASE AUTH YET.
-- Depends on sql/orca_oauth_readonly_data_api_guard.sql registry.
-- Native Supabase Auth Custom Access Token Hook. This is NOT an OAuth server;
-- it only adjusts the resource audience for explicitly approved clients.
-- Supabase Auth requires a separate dashboard setting before this hook runs.
-- Audit existing hook configuration and ChatGPT RFC8707 flow before activation.

CREATE OR REPLACE FUNCTION orca_mcp_private.issue_orca_mcp_audience(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $hook$
DECLARE
  claims jsonb := event -> 'claims';
  client_id text;
  expected_resource constant text :=
    'https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp';
BEGIN
  IF jsonb_typeof(claims) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid token claims'
      USING ERRCODE = '42501';
  END IF;

  client_id := nullif(btrim(claims ->> 'client_id'), '');

  -- Normal ORCA browser sign-in/refresh tokens have no OAuth client_id
  -- and retain their full, unchanged default claims and permissions.
  IF client_id IS NULL THEN
    RETURN event;
  END IF;

  -- No access tokens for unexpected OAuth clients while the ORCA pilot is
  -- restricted to an explicit list approved by the operator.
  IF NOT EXISTS (
    SELECT 1 FROM orca_mcp_private.approved_readonly_clients approved
    WHERE approved.client_id = client_id
      AND approved.enabled = true
      AND approved.resource = expected_resource
  ) THEN
    RAISE EXCEPTION 'ORCA OAuth client is not approved'
      USING ERRCODE = '42501';
  END IF;

  -- Supabase's native hook docs allow audience customization. Do not treat
  -- this as tested RFC 8707 resource-indicator support until a real PKCE
  -- authorization AND token exchange proves compatibility with ChatGPT.
  -- The existing MCP server strictly verifies this audience.
  event := jsonb_set(
    event, '{claims,aud}', to_jsonb(expected_resource), true
  );
  RETURN event;
END;
$hook$;

REVOKE ALL ON FUNCTION orca_mcp_private.issue_orca_mcp_audience(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA orca_mcp_private TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION orca_mcp_private.issue_orca_mcp_audience(jsonb)
  TO supabase_auth_admin;

-- DO NOT configure Authentication > Hooks > Custom Access Token here.
-- Supabase supports one active hook configuration per project. A hook
-- must be consciously merged with any existing hook and then verified.
