-- Self-contained temporary PostgreSQL integration fixture. NEVER run on a real
-- Supabase project: it creates stand-in roles and two fake team rows.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE supabase_auth_admin NOLOGIN;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt()->>'sub','')::uuid
$$;

CREATE TABLE public.stock_research_memberships (
  ticker text NOT NULL,
  user_id uuid NOT NULL
);
ALTER TABLE public.stock_research_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.stock_research_memberships TO authenticated;
CREATE POLICY "Participants may see research team"
ON public.stock_research_memberships FOR SELECT TO authenticated USING (true);

INSERT INTO public.stock_research_memberships(ticker,user_id) VALUES
 ('RKLB','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('RKLB','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- Mock the two directly writable ORCA tables with permissive browser policies.
GRANT INSERT, DELETE ON public.stock_research_memberships TO authenticated;
CREATE POLICY "Participants may join listed team"
ON public.stock_research_memberships FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid());
CREATE POLICY "Participants may leave own team"
ON public.stock_research_memberships FOR DELETE TO authenticated
USING (user_id=auth.uid());

CREATE TABLE public.agent_profiles (
  owner_id uuid PRIMARY KEY,
  display_name text NOT NULL,
  opted_in boolean NOT NULL DEFAULT false
);
ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_profiles TO authenticated;
CREATE POLICY "Owners manage profiles" ON public.agent_profiles
FOR ALL TO authenticated
USING (owner_id=auth.uid())
WITH CHECK (owner_id=auth.uid());
INSERT INTO public.agent_profiles(owner_id,display_name,opted_in)
VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Researcher A',true);
