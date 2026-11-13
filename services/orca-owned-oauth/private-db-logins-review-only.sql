-- ORCA Stage 20: separate password-login roles for two private backends.
-- REVIEW ONLY: NOT A MIGRATION. Do not execute on hosted Supabase until
-- security audit, owner approval, backup/rollback and DB connection method.
-- This file intentionally creates NO usable password login or credential.
-- Execute after private-db-roles-review-only.sql, in isolated PG17 CI only.
begin;

do $$
begin
  if not exists(select 1 from pg_roles
                where rolname='orca_owned_issuer_login') then
    create role orca_owned_issuer_login
      nologin noinherit nobypassrls nosuperuser nocreatedb
      nocreaterole noreplication;
  end if;
  if not exists(select 1 from pg_roles
                where rolname='orca_owned_mcp_grant_login') then
    create role orca_owned_mcp_grant_login
      nologin noinherit nobypassrls nosuperuser nocreatedb
      nocreaterole noreplication;
  end if;
end $$;
alter role orca_owned_issuer_login
  nologin noinherit nobypassrls nosuperuser nocreatedb
  nocreaterole noreplication;
alter role orca_owned_mcp_grant_login
  nologin noinherit nobypassrls nosuperuser nocreatedb
  nocreaterole noreplication;

-- PostgreSQL 17 role membership options: these logins gain NO inherited
-- table privileges until their backend explicitly assumes its OWN role.
-- They cannot become each other's role.
grant orca_owned_issuer_writer to orca_owned_issuer_login
  with inherit false, set true;
grant orca_owned_mcp_grant_reader to orca_owned_mcp_grant_login
  with inherit false, set true;
commit;

-- Hosted operator checklist, NOT SQL to run automatically:
-- 1. Audit full role membership/CONNECT/catalog privileges first.
-- 2. Create unique strong credentials in a server-only secrets manager.
-- 3. Only then turn these individual roles to LOGIN and set passwords
--    by a protected operator process. Never paste passwords into SQL
--    committed to GitHub, the frontend, ChatGPT, or CI artifacts.
-- 4. Prefer dedicated direct database connection or verified *session*
--    pooler (5432); never transaction pooler (6543) for SET ROLE sessions.
-- 5. Confirm end-to-end TLS CA plus hostname check (verify-full equivalent).
-- 6. Recheck both roles' membership and absence of PUBLIC/REST grants.
-- 7. Store separate passwords for issuer and MCP grants; rotate independently.
-- 8. Keep all OAuth/MCP issuer release flags OFF until two real-user tests.
