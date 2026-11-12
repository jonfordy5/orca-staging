-- ORCA staging: aggregate, read-only database-role security check.
-- Run using the private owner-controlled SQL connection, never from a browser.
-- No table contents, account IDs, or table names are returned.

WITH client_roles(role_name) AS (VALUES ('anon'), ('authenticated')),
tables AS (
  SELECT c.oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
)
SELECT 'existing_table_grants' AS check_scope,
       role_name AS checked_role,
       COUNT(*) FILTER (WHERE has_table_privilege(role_name, oid, 'TRUNCATE')) AS truncate_grants,
       COUNT(*) AS table_count
FROM client_roles CROSS JOIN tables
GROUP BY role_name
ORDER BY role_name;

-- Includes defaults owned by alternative database object-creator roles,
-- which cannot always be changed by the usual project SQL connection.
SELECT 'new_table_default_grants' AS check_scope,
       pg_get_userbyid(d.defaclrole) AS creator_role,
       pg_get_userbyid(grant_entry.grantee) AS checked_role,
       COUNT(*) AS truncate_grants
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) grant_entry
WHERE n.nspname = 'public'
  AND d.defaclobjtype = 'r'
  AND grant_entry.privilege_type = 'TRUNCATE'
  AND pg_get_userbyid(grant_entry.grantee) IN ('anon', 'authenticated')
GROUP BY d.defaclrole, grant_entry.grantee
ORDER BY creator_role, checked_role;
