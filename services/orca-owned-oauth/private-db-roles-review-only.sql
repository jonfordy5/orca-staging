-- ORCA Stage 19 — isolated private OAuth database role boundary.
-- REVIEW ONLY. NOT a Supabase migration, NEVER run against live accounts
-- without catalog audit, rollback, owner approval and secret provisioning.
-- Apply ONLY after private-schema-review-only.sql AND browser-sessions-review-only.sql.
-- No user-facing API role or browser may assume either role.
-- A dedicated authenticated operator-managed DB login role must be created
-- separately with the minimum SET ROLE/CONNECT rights; this file creates
-- NO login credentials and NO client-facing grants.
begin;
do $$
begin
  if not exists (select 1 from pg_roles where rolname='orca_owned_issuer_writer') then
    create role orca_owned_issuer_writer nologin nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='orca_owned_mcp_grant_reader') then
    create role orca_owned_mcp_grant_reader nologin nobypassrls;
  end if;
end $$;

alter role orca_owned_issuer_writer
  nologin nobypassrls nosuperuser nocreatedb nocreaterole noreplication;
alter role orca_owned_mcp_grant_reader
  nologin nobypassrls nosuperuser nocreatedb nocreaterole noreplication;

grant usage on schema orca_owned_oauth_private
  to orca_owned_issuer_writer,orca_owned_mcp_grant_reader;

-- The issuer alone creates one-time consent and provider state. Browser
-- sessions are encrypted inside the issuer before PostgreSQL storage.
-- Grant records are revoked by UPDATE, never physically deleted here.
grant select,insert,update on orca_owned_oauth_private.grants
  to orca_owned_issuer_writer;
grant select,insert,update,delete
  on orca_owned_oauth_private.provider_models
  to orca_owned_issuer_writer;
grant select,insert,update
  on orca_owned_oauth_private.consent_challenges
  to orca_owned_issuer_writer;
grant select,insert,update
  on orca_owned_oauth_private.browser_sessions
  to orca_owned_issuer_writer;

-- MCP may check ONLY the exact current OAuth grant after independently
-- verifying ORCA ES256 issuer, audience, owner, client and signature.
-- It cannot select consent nonce hashes, sessions, or encrypted OIDC state.
grant select(id,owner_id,client_id,resource,scope,revoked_at,expires_at)
  on orca_owned_oauth_private.grants
  to orca_owned_mcp_grant_reader;

-- Issuer private roles are server-side privileged identities, never
-- accessible through PostgREST or sent to the browser. Its application
-- verifies Supabase getUser + existing opted-in profile and one-time CSRF
-- BEFORE writing consent. Do not issue the issuer role to public clients.
create policy "ORCA verified issuer owns internal grant transactions"
  on orca_owned_oauth_private.grants
  for all to orca_owned_issuer_writer
  using (true) with check (true);
create policy "ORCA verified issuer owns encrypted provider state"
  on orca_owned_oauth_private.provider_models
  for all to orca_owned_issuer_writer
  using (true) with check (true);
create policy "ORCA verified issuer owns one-time CSRF state"
  on orca_owned_oauth_private.consent_challenges
  for all to orca_owned_issuer_writer
  using (true) with check (true);
create policy "ORCA verified issuer owns encrypted browser sessions"
  on orca_owned_oauth_private.browser_sessions
  for all to orca_owned_issuer_writer
  using (true) with check (true);

-- Defense-in-depth. The mcp.verified_* custom settings are transaction
-- scoped and set ONLY after successful signature and current-client checks.
-- A custom PostgreSQL GUC is NOT authentication by itself: only an audited
-- allowlisted server-side connection may set it. No arbitrary SQL or
-- per-agent connection string may ever be exposed.
create policy "ORCA MCP may inspect only one verified current read grant"
  on orca_owned_oauth_private.grants
  for select to orca_owned_mcp_grant_reader
  using (
    owner_id = nullif(current_setting('orca.verified_owner_id',true),'')::uuid
    and id = nullif(current_setting('orca.verified_grant_id',true),'')::uuid
    and client_id = nullif(current_setting('orca.verified_client_id',true),'')
    and resource = nullif(current_setting('orca.verified_resource',true),'')
    and scope = 'orca:research.read'
    and revoked_at is null
    and expires_at > clock_timestamp()
  );
commit;

-- This SQL does NOT grant either role to a login, postgres pooler, API role
-- or provider. Connection trust, TLS verify-full, role membership and
-- session pool mode require independent review before first real test.
