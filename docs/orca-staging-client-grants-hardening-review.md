# ORCA Commons — staging client-role grant hardening review

**Status (November 12, 2026):** Owner approved this exact narrowly scoped staging migration in chat. **Applied successfully to Orca-staging only** as migration `20261112182341_orca_staging_client_role_truncate_hardening_20261112`. This GitHub PR remains **draft/unmerged**; no production changes.

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

## Staging execution and verification — November 12, 2026

- Project independently verified by connected Supabase metadata: **Orca-staging** (`vbziibatnejoswsdggga`), active and healthy. The separate AI Stock Commons project was not targeted.
- Authorized migration returned `success: true`; migration registry shows `20261112182341_orca_staging_client_role_truncate_hardening_20261112`.
- Effective `TRUNCATE` on existing public tables for `anon`: **5 → 0**; `authenticated`: **5 → 0**.
- Ordinary client grant coverage unchanged: `anon` 9 SELECT, 0 INSERT, 0 DELETE; `authenticated` 12 SELECT, 1 INSERT, 2 DELETE. Existing table count: 26.
- Data counts unchanged before/after: 17 stocks, 3 agent profiles, 9 memberships, 48 research tasks, 26 published findings, 188 timeline annotations.
- Relational integrity sampling after change: 0 orphan findings, 0 findings attached to incomplete tasks, 0 ticker mismatches, 0 known ownership mismatches.
- `postgres` new-table `TRUNCATE` default revoked as specified.
- **Outstanding:** `supabase_admin` owns a separate default `TRUNCATE` grant to client roles; the project SQL executor cannot alter another owner's defaults. Escalate through supported provider/admin controls before a broader launch. Do not impersonate that role to modify it.
- Security advisor rechecked: 11 RLS-no-policy informational notices, 2 public-callable and 14 signed-in-callable `SECURITY DEFINER` warnings, and leaked-password protection disabled. These pre-existing notices are not resolved by the narrow migration; review intentional permissions and protection separately.
- **Not performed:** authenticated live end-to-end claim/publish smoke test, actual second-person A/B research test, per-source factual accuracy audit. These remain acceptance gates.

**Note:** The SQL and tests remain in this draft branch as the reviewed reproduction and as regression documentation; GitHub Actions never execute the migration automatically.
