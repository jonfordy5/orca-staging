-- ORCA Stage 10 MCP reader. REVIEW ONLY; not a live Supabase migration.
-- Not in supabase/migrations. Run only on isolated CI PostgreSQL until
-- explicitly audited and approved for staging. Production remains unchanged.
--
-- Backend pool must use SET ROLE orca_owned_mcp_reader from a dedicated,
-- narrowly authorized login. NEVER set this role in a browser or Data API.
-- The application must first cryptographically validate an ORCA OAuth JWT
-- and check its CURRENT owner/client/resource grant. The custom GUC itself
-- is not cryptographic authentication; it is additional DB row isolation.
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='orca_owned_mcp_reader') then
    create role orca_owned_mcp_reader nologin nobypassrls;
  end if;
end $$;
alter role orca_owned_mcp_reader
  nologin nobypassrls nosuperuser nocreatedb nocreaterole noreplication;

revoke all on all tables in schema public from orca_owned_mcp_reader;
grant usage on schema public to orca_owned_mcp_reader;

-- Column-level privileges, NEVER SELECT * / service_role.
grant select(owner_id,display_name,opted_in)
  on public.agent_profiles to orca_owned_mcp_reader;
grant select(user_id,ticker)
  on public.stock_research_memberships to orca_owned_mcp_reader;
grant select(id,ticker,research_area,research_question,claimed_until,
             claimed_owner_id,status,created_at)
  on public.research_tasks to orca_owned_mcp_reader;
grant select(task_id,ticker,board_key,category_key,metric_key)
  on public.orca_research_board_assignments to orca_owned_mcp_reader;

-- Every RLS filter denies rows if the transaction-local verified owner
-- is absent or invalid. Invalid UUID fails the query closed.
create policy "ORCA owned MCP reader only own opted-in profile"
  on public.agent_profiles for select to orca_owned_mcp_reader
  using (
    owner_id = nullif(current_setting('orca.verified_owner_id',true),'')::uuid
    and opted_in is true
  );
create policy "ORCA owned MCP reader only own memberships"
  on public.stock_research_memberships for select to orca_owned_mcp_reader
  using (
    user_id = nullif(current_setting('orca.verified_owner_id',true),'')::uuid
  );
create policy "ORCA owned MCP reader only active owner claims"
  on public.research_tasks for select to orca_owned_mcp_reader
  using (
    claimed_owner_id = nullif(current_setting('orca.verified_owner_id',true),'')::uuid
    and status = 'claimed'
    and claimed_until > clock_timestamp()
  );
create policy "ORCA owned MCP reader board for own active task"
  on public.orca_research_board_assignments for select to orca_owned_mcp_reader
  using (
    exists (
      select 1 from public.research_tasks t
      where t.id = task_id and t.ticker = orca_research_board_assignments.ticker
    )
  );

commit;

-- BEFORE DEPLOYMENT: check catalog role membership/inherited PUBLIC grants,
-- pool role current_user, read-only transaction, two-user isolation,
-- no INSERT/UPDATE/DELETE, no direct Data API or public execute privilege.
-- No actual issuer login role or credentials created by this file.
