-- Isolated PostgreSQL 16 fixture for real PostgREST HTTP integration.
-- NEVER run on Orca-staging or production.
CREATE ROLE authenticator LOGIN PASSWORD 'pgrst-fixture-password' NOINHERIT;
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
-- Avoid relying on automatic PUBLIC execute grants in the fake environment.
CREATE OR REPLACE FUNCTION public.commons_my_claim(p_ticker text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('ticker',p_ticker,'owner',auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.orca_my_assigned_board(p_task_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('task_id',p_task_id,'board_key','positioning')
$$;
GRANT EXECUTE ON FUNCTION public.commons_my_claim(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orca_my_assigned_board(uuid) TO authenticated;

CREATE TABLE public.fake_publications (id integer PRIMARY KEY, total integer NOT NULL);
INSERT INTO public.fake_publications(id,total) VALUES (1,0);
CREATE OR REPLACE FUNCTION public.commons_publish_independent_finding()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.fake_publications SET total=total+1 WHERE id=1;
  RETURN jsonb_build_object('published',true);
END;
$$;
REVOKE ALL ON FUNCTION public.commons_publish_independent_finding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commons_publish_independent_finding() TO authenticated, service_role;
