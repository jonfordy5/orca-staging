-- ORCA OWNED OAUTH (PLAN B) - REVIEW ONLY, NOT A DEPLOYED MIGRATION.
-- Do not execute on staging or production without a dedicated least-privilege
-- issuer DB owner/connection, independent approval and rollback plan.
-- This file is not in supabase/migrations and must remain unexposed via
-- PostgREST, GraphQL, Realtime and Storage. No authorization secrets here.
begin;

create schema if not exists orca_owned_oauth_private;
revoke all on schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;

-- Explicitly consented, owner/client/resource-bound ORCA grants.
-- The provider's opaque grant reference is stored only as a SHA-256 digest.
create table orca_owned_oauth_private.grants (
  id uuid primary key,
  owner_id uuid not null,
  client_id text not null
    check (length(client_id) between 1 and 512
           and client_id !~ '[[:cntrl:]]'),
  provider_grant_hash bytea unique
    check (provider_grant_hash is null or octet_length(provider_grant_hash)=32),
  resource text not null
    check (resource like 'https://%'),
  scope text not null
    check (scope='orca:research.read'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint owned_grant_valid_lifetime check (
    expires_at > created_at and expires_at <= created_at + interval '31 days'
  ),
  constraint owned_grant_valid_revoke check (
    revoked_at is null or revoked_at >= created_at
  )
);
create index owned_grants_owner_idx
  on orca_owned_oauth_private.grants(owner_id,created_at desc);
create index owned_grants_client_idx
  on orca_owned_oauth_private.grants(client_id);

-- OIDC state: hashed opaque model IDs, encrypted payloads, AES-256-GCM
-- tag and IV. Encryption keys never enter this database.
create table orca_owned_oauth_private.provider_models (
  model_type text not null,
  model_id_hash bytea not null
    check (octet_length(model_id_hash)=32),
  grant_id_hash bytea
    check (grant_id_hash is null or octet_length(grant_id_hash)=32),
  uid_hash bytea
    check (uid_hash is null or octet_length(uid_hash)=32),
  user_code_hash bytea
    check (user_code_hash is null or octet_length(user_code_hash)=32),
  key_id text not null,
  iv bytea not null check (octet_length(iv)=12),
  ciphertext bytea not null,
  tag bytea not null check (octet_length(tag)=16),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  primary key(model_type,model_id_hash),
  constraint owned_model_valid_lifetime check (expires_at > created_at),
  constraint owned_model_valid_consume check (
    consumed_at is null or consumed_at >= created_at
  )
);
create index owned_models_grant_idx
  on orca_owned_oauth_private.provider_models(model_type,grant_id_hash);
create index owned_models_uid_idx
  on orca_owned_oauth_private.provider_models(model_type,uid_hash);

-- CSRF nonce / OAuth interaction / signed browser-session bindings.
-- All opaque values are hashed and redeemed exactly once.
create table orca_owned_oauth_private.consent_challenges (
  id uuid primary key,
  owner_id uuid not null,
  client_id text not null
    check (length(client_id) between 1 and 512
           and client_id !~ '[[:cntrl:]]'),
  resource text not null
    check (resource like 'https://%'),
  interaction_hash bytea not null
    check (octet_length(interaction_hash)=32),
  session_hash bytea not null
    check (octet_length(session_hash)=32),
  csrf_hash bytea not null
    check (octet_length(csrf_hash)=32),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint owned_challenge_valid_lifetime check (
    expires_at > created_at and expires_at <= created_at + interval '6 minutes'
  ),
  constraint owned_challenge_valid_consume check (
    consumed_at is null or consumed_at >= created_at
  )
);
create index owned_challenges_owner_idx
  on orca_owned_oauth_private.consent_challenges(owner_id,created_at desc);
create index owned_challenges_expiry_idx
  on orca_owned_oauth_private.consent_challenges(expires_at);

-- No API role or PUBLIC grant. Dedicated issuer-only DB role must be
-- provisioned separately, reviewed with BYPASSRLS disabled.
alter table orca_owned_oauth_private.grants enable row level security;
alter table orca_owned_oauth_private.provider_models enable row level security;
alter table orca_owned_oauth_private.consent_challenges enable row level security;

revoke all on all tables in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;
revoke all on all sequences in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;

commit;
