\set ON_ERROR_STOP on
-- Security tests executed only against isolated local Postgres CI service.

CREATE SCHEMA gateway_test;
CREATE OR REPLACE FUNCTION gateway_test.exercise(
  p_label text,
  p_claims jsonb,
  p_method text,
  p_path text,
  p_should_allow boolean,
  p_headers jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',p_claims::text,true);
  PERFORM set_config('request.method',p_method,true);
  PERFORM set_config('request.path',p_path,true);
  PERFORM set_config('request.headers',p_headers::text,true);

  BEGIN
    PERFORM orca_mcp_private.enforce_readonly_oauth_data_api();
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;

  IF denied = p_should_allow THEN
    RAISE EXCEPTION 'Case %: expected allow=% but got deny=%',
      p_label,p_should_allow,denied;
  END IF;
  RAISE NOTICE 'PASS: %',p_label;
END;
$$;

-- No normal browser ORCA request can be changed by this OAuth gate.
SELECT gateway_test.exercise('browser can still claim',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","aud":"authenticated"}',
 'POST','/rpc/orca_request_and_claim_next',true);

-- No approved client exists by default: all OAuth Data API access denied.
SELECT gateway_test.exercise('client denied before allowlist',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'POST','/rpc/commons_my_claim',false);

INSERT INTO orca_mcp_private.approved_readonly_clients(client_id,resource,enabled)
VALUES (
 'approved-client-alpha',
 'https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp',
 true
);

-- Real owner-scoped read patterns used by readAgentState().
SELECT gateway_test.exercise('profile read',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/agent_profiles',true);
SELECT gateway_test.exercise('membership read',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/stock_research_memberships',true);
SELECT gateway_test.exercise('claim read RPC',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'POST','/rpc/commons_my_claim',true);
SELECT gateway_test.exercise('board read RPC',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":["https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"]}',
 'POST','/rpc/orca_my_assigned_board',true);

-- Crucial: deny real database mutation routes, no matter whether they are
-- SECURITY DEFINER, owner scoped or allowed for regular browser sessions.
SELECT gateway_test.exercise('no OAuth claim-next RPC',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'POST','/rpc/orca_request_and_claim_next',false);
SELECT gateway_test.exercise('no OAuth publish RPC',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'POST','/rpc/commons_publish_independent_finding',false);
SELECT gateway_test.exercise('no OAuth join team POST',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'POST','/stock_research_memberships',false);
SELECT gateway_test.exercise('no OAuth delete team',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'DELETE','/stock_research_memberships',false);
SELECT gateway_test.exercise('no OAuth profile deletion',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'DELETE','/agent_profiles',false);
SELECT gateway_test.exercise('no OAuth unrelated GET tables',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/research_tasks',false);
SELECT gateway_test.exercise('no OAuth other read RPC',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'POST','/rpc/orca_legends_access',false);
SELECT gateway_test.exercise('no method override',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/agent_profiles',false,
 '{"x-http-method-override":"DELETE"}');
SELECT gateway_test.exercise('no nonpublic API schema',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/agent_profiles',false,
 '{"accept-profile":"graphql_public"}');

SELECT gateway_test.exercise('no unregistered client',
 '{"client_id":"unknown-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/agent_profiles',false);
SELECT gateway_test.exercise('no wrong resource audience',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"authenticated"}',
 'GET','/agent_profiles',false);
SELECT gateway_test.exercise('no missing audience',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1"}',
 'GET','/agent_profiles',false);
SELECT gateway_test.exercise('no wrong issuer',
 '{"client_id":"approved-client-alpha","iss":"https://another-app.example.com","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/agent_profiles',false);
SELECT gateway_test.exercise('no malformed headers',
 '{"client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',
 'GET','/agent_profiles',false,
 '[]');
-- Explicit rollback of any request context before RLS policy tests.
RESET request.jwt.claims;
RESET request.method;
RESET request.path;
RESET request.headers;

-- Existing member browser can see the team, but OAuth sees only the owner.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.stock_research_memberships)<>2 THEN
    RAISE EXCEPTION 'Ordinary browser team visibility changed unexpectedly';
  END IF;
  RAISE NOTICE 'PASS: browser membership visibility preserved';
END $$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","client_id":"approved-client-alpha"}',true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.stock_research_memberships)<>1
    OR EXISTS(SELECT 1 FROM public.stock_research_memberships
       WHERE user_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid)
  THEN
    RAISE EXCEPTION 'OAuth account can view another team member';
  END IF;
  RAISE NOTICE 'PASS: OAuth sees only own membership';
END $$;
ROLLBACK;

-- Data API method checks alone do not defend GraphQL/Storage. Confirm the
-- restrictive RLS rules prevent direct OAuth writes on real table SQL paths.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","client_id":"approved-client-alpha","iss":"https://vbziibatnejoswsdggga.supabase.co/auth/v1","aud":"https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp"}',true);
DO $$
DECLARE affected integer;
DECLARE denied boolean := false;
BEGIN
  DELETE FROM public.agent_profiles
    WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'OAuth token could delete an agent profile'; END IF;

  UPDATE public.agent_profiles SET display_name='tampered'
    WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'OAuth token could change an agent profile'; END IF;

  BEGIN
    INSERT INTO public.stock_research_memberships(ticker,user_id)
      VALUES ('NVDA','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'OAuth token could join a stock team'; END IF;

  DELETE FROM public.stock_research_memberships WHERE ticker='RKLB'
    AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'OAuth token could leave a stock team'; END IF;

  IF (SELECT count(*) FROM public.agent_profiles
      WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid) <> 1 THEN
    RAISE EXCEPTION 'OAuth read-only token lost permitted self-profile SELECT';
  END IF;
  RAISE NOTICE 'PASS: OAuth profile and team DML denied across APIs by RLS';
END $$;
ROLLBACK;

-- The exact same owner can still use the original website permissions.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
 '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
DO $$
DECLARE affected integer;
BEGIN
  UPDATE public.agent_profiles SET display_name='Authorized browser edit'
    WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Browser profile update blocked'; END IF;

  INSERT INTO public.stock_research_memberships(ticker,user_id)
    VALUES ('NVDA','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

  DELETE FROM public.stock_research_memberships
   WHERE ticker='NVDA' AND user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Browser cannot leave its own team'; END IF;

  RAISE NOTICE 'PASS: original browser update/join/leave rights preserved';
END $$;
ROLLBACK;
