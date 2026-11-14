-- ORCA Stage 11 — SERVER-SIDE OAUTH BROWSER SESSIONS.
-- REVIEW ONLY. DO NOT RUN ON LIVE SUPABASE WITHOUT OWNER APPROVAL,
-- SECURITY REVIEW, A DEDICATED DB ROLE AND A ROLLBACK/BACKUP PLAN.
-- Does not create a user, modify existing research, or enable OAuth.
--
-- Execute only AFTER private-schema-review-only.sql, not as a migration yet.
-- This table must NOT be exposed via PostgREST, GraphQL or Realtime.
begin;
create table orca_owned_oauth_private.browser_sessions (
  session_hash bytea primary key
    check (octet_length(session_hash)=32),
  owner_id uuid not null,
  key_id text not null
    check (length(key_id) between 8 and 48
      and key_id ~ '^[A-Za-z0-9_-]+$'),
  iv bytea not null check (octet_length(iv)=12),
  ciphertext bytea not null check (octet_length(ciphertext)>0),
  tag bytea not null check (octet_length(tag)=16),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint orca_private_browser_session_ttl check (
    expires_at>issued_at and expires_at<=issued_at+interval '15 minutes'
  ),
  constraint orca_private_browser_session_revoke check (
    revoked_at is null or revoked_at>=issued_at
  )
);
create index orca_private_browser_session_expiry_idx
  on orca_owned_oauth_private.browser_sessions(expires_at);
create index orca_private_browser_session_owner_idx
  on orca_owned_oauth_private.browser_sessions(owner_id,expires_at desc);

alter table orca_owned_oauth_private.browser_sessions enable row level security;
revoke all on orca_owned_oauth_private.browser_sessions
  from public, anon, authenticated, service_role, authenticator;
-- Nothing grants API roles SELECT/INSERT/UPDATE/DELETE. A separate vetted
-- issuer-only DB role/connection must be configured and independently tested.
commit;

-- Before launch: rotate server-only AES-256-GCM keys, run expiry cleanup with
-- private role, prevent DB snapshots from leaking outside authorized backups,
-- verify real Supabase Auth revocation behavior and owner-only logout, and
-- move the browser session from Stage 6 to this private opaque model.
