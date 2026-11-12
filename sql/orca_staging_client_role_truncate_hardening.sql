-- ORCA staging least-privilege hardening.
-- REVIEW-ONLY: this file is never run by GitHub Actions or the public website.
-- Run only against the independently verified staging project after owner approval.
-- Scope: ordinary public-schema tables and client database roles.
-- Preserves SELECT/INSERT/UPDATE/DELETE, auth policies, RPCs, service_role, and all data.

BEGIN;

-- Whole-table operations are not constrained by RLS. Client roles do not need them.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Avoid recreating this access on future tables created by the usual owner role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

-- Fail atomically rather than leaving a partially secured database.
DO $validate_client_truncate$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND (
        has_table_privilege('anon', c.oid, 'TRUNCATE')
        OR has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      )
  ) THEN
    RAISE EXCEPTION 'Client table-level TRUNCATE access remains; changes rolled back';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles owner_role ON owner_role.oid = d.defaclrole
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) granted
    JOIN pg_roles client_role ON client_role.oid = granted.grantee
    WHERE owner_role.rolname = 'postgres'
      AND n.nspname = 'public'
      AND d.defaclobjtype = 'r'
      AND client_role.rolname IN ('anon', 'authenticated')
      AND granted.privilege_type = 'TRUNCATE'
  ) THEN
    RAISE EXCEPTION 'Client default TRUNCATE access remains for postgres-owned tables; changes rolled back';
  END IF;
END;
$validate_client_truncate$;

COMMIT;

-- Note: other object-creator roles can have distinct default privileges.
-- Audit those separately with the companion read-only check; do not assume
-- a PostgreSQL role can change another owner's defaults.
