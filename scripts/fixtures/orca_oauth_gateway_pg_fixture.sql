-- Self-contained temporary PostgreSQL integration fixture. NEVER run on a real
-- Supabase project: it creates stand-in roles and two fake team rows.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
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
