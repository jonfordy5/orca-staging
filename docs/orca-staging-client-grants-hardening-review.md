# ORCA Commons — staging client-role grant hardening review

**Status:** Proposed migration only. **Not applied to Supabase.** PR review and owner approval required before database changes. No production actions.

## Why this is necessary

An owner-authorized, read-only staging catalog review on November 12, 2026 found that ordinary `anon` and `authenticated` database roles possess unnecessary whole-table `TRUNCATE` privileges on multiple ordinary `public` tables. This operation bypasses row-level security by design; it is *not* a standard Supabase REST endpoint, and this catalog evidence does not establish a browser-accessible exploit. Avoid publishing detailed grants or table targets. Privileges still violate least privilege and should be removed.

Separately, Supabase advisors warn about `SECURITY DEFINER` RPC exposure and disabled leaked-password detection. Warnings are review leads, not automatically vulnerabilities. Do not change working research RPC grants or auth settings in this PR.

## Proposed change

- `sql/orca_staging_client_role_truncate_hardening.sql` revokes **only** `TRUNCATE` on existing `public` tables from `anon` and `authenticated`, and revokes that default grant for future `postgres`-created `public` tables.
- The SQL runs in a transaction and fails atomically if either covered class of excessive grants remains.
- Admin/service access, client `SELECT/INSERT/UPDATE/DELETE` privileges, existing claims/publication routines, RLS policies, data, and research histories remain unchanged.
- The owner/operator must separately review defaults owned by other creator roles. The ordinary project SQL connection is not necessarily allowed to change those owners' default privileges.
- `sql/orca_staging_client_role_grant_audit.sql` reports aggregated results without exposing affected table names or records.
- `scripts/test-orca-client-role-grants.mjs` tests the intended static migration contract, executed in the pull-request CI. It **does not** validate a deployed database.

## Before applying to staging

1. Confirm the intended Supabase project is **Orca-staging** (not the separate AI Stock Commons project).
2. Export/retain an authorized snapshot of existing effective grants and default privileges in a private owner-controlled record.
3. Review whether any **nonstandard direct PostgreSQL clients** intentionally need client-role whole-table access; none are expected for ORCA's current browser workflow.
4. Obtain owner approval for the specific database operation.
5. Apply the reviewed file **once** through authorized migration tooling to the staging project only, never through GitHub Pages or browser code.
6. Run the companion read-only audit afterward. Expect zero client `TRUNCATE` grants on existing `public` tables and zero `postgres`-owned future-table `TRUNCATE` defaults. Investigate any remaining alternate-role defaults separately.
7. Run the existing workspace, account, publish-receipt, and research regression checks; the actual two-person A/B research mission test remains separately pending.
8. Recheck Supabase security advisors, specifically reviewing privileged RPC implementation and intended role exposure. Do not reflexively revoke required authorized function execution or loosen RLS to make warnings disappear.

## Explicit limits

This hardening removes an unnecessary privilege; it does **not** certify source quality, secure every RPC, prove the absence of other privileged paths, or complete real research acceptance. Do not recruit external beta users until the outstanding security review and two-person research validation have passed.

Supabase guidance: https://supabase.com/docs/guides/api/securing-your-api

Related owner-tracked research audit: https://github.com/jonfordy5/orca-staging/issues/54
