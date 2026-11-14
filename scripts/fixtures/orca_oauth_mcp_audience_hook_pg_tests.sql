\set ON_ERROR_STOP on
-- Runs only in isolated mock Postgres, after the gateway tests approved one
-- fake client ID. This does not enable a Supabase Auth Hook anywhere.
DO $$
DECLARE
  original jsonb :=
    '{"claims":{"aud":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","client_id":"approved-client-alpha","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},"authentication_method":"oauth_provider/authorization_code"}'::jsonb;
  resulting jsonb;
  direct_browser jsonb :=
    '{"claims":{"aud":"authenticated","sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","session_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},"authentication_method":"password"}'::jsonb;
  refused boolean := false;
BEGIN
  resulting := orca_mcp_private.issue_orca_mcp_audience(original);
  IF resulting->'claims'->>'aud' IS DISTINCT FROM
     'https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp'
    OR resulting->'claims'->>'sub' IS DISTINCT FROM original->'claims'->>'sub'
    OR resulting->'claims'->>'role' IS DISTINCT FROM 'authenticated'
    OR resulting->'claims'->>'session_id' IS DISTINCT FROM
       original->'claims'->>'session_id'
  THEN
    RAISE EXCEPTION 'Audience hook changed identity/role or failed resource binding';
  END IF;

  IF orca_mcp_private.issue_orca_mcp_audience(direct_browser) IS DISTINCT FROM direct_browser THEN
    RAISE EXCEPTION 'Direct browser sign-in claims were modified';
  END IF;

  BEGIN
    PERFORM orca_mcp_private.issue_orca_mcp_audience(
      jsonb_set(original,'{claims,client_id}','"unknown-client"')
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    refused := true;
  END;
  IF NOT refused THEN
    RAISE EXCEPTION 'Unapproved OAuth client unexpectedly received an access token';
  END IF;

  RAISE NOTICE 'PASS: hook preserves browser identity and binds approved OAuth token audience';
END $$;

-- Verify actual Supabase Auth hook executor can call this function, but
-- ordinary authenticated app clients cannot call a privileged Auth hook.
BEGIN;
SET LOCAL ROLE supabase_auth_admin;
DO $$
BEGIN
  IF (orca_mcp_private.issue_orca_mcp_audience(
    '{"claims":{"aud":"authenticated","role":"authenticated"},"authentication_method":"password"}'::jsonb
  ))->'claims'->>'aud' IS DISTINCT FROM 'authenticated'
  THEN
    RAISE EXCEPTION 'Auth hook role failed ordinary-browser pass-through';
  END IF;
  RAISE NOTICE 'PASS: Supabase Auth executor has required hook privilege';
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    PERFORM orca_mcp_private.issue_orca_mcp_audience('{"claims":{"role":"authenticated"}}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Ordinary OAuth client called privileged token hook'; END IF;
  RAISE NOTICE 'PASS: ordinary client has no hook EXECUTE privilege';
END $$;
ROLLBACK;
