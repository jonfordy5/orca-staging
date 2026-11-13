-- ORCA-OWNED OAUTH — REVIEW-ONLY PRIVATE POSTGRES SCHEMA.
-- DO NOT EXECUTE on live staging or production without a separately reviewed
-- migration, dedicated narrowly privileged issuer DB role, encrypted backups,
-- key custody, and a documented rollback.
--
-- This script is NOT in supabase/migrations/ and is NOT auto-deployed.
-- Never expose this schema in PostgREST/Supabase Data API, GraphQL, Storage
-- or Realtime; never GRANT its objects to anon, authenticated, service_role,
-- or authenticator. Restrict CONNECT and default inherited PUBLIC privileges
-- of the eventual dedicated issuer DB role after inspecting the project.
--
-- For a real rollout: first generate the migration with the pinned CLI,
-- review advisor results, create a dedicated non-BYPASSRLS owner role, and
-- grant that role ONLY access to its own objects over a private DB connection.

begin;

create schema if not exists orca_owned_oauth_private;
revoke all on schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;

-- Separate consent registry. Never store Supabase login credentials here.
create table if not exists orca_owned_oauth_private.grants (
  id uuid primary key,
  owner_id uuid not null,
  -- OAuth client IDs are opaque strings; MCP client IDs may be HTTPS URLs.
  -- Client registration still requires exact vetted callback matching.
  client_id text not null check (client_id ~ '^[!-~]{1,512}
  resource text not null check (resource like 'https://%'),
  scope text not null check (scope='orca:research.read'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint valid_owned_grant_duration check (
    expires_at > created_at and expires_at <= created_at + interval '31 days'
  ),
  constraint valid_owned_grant_revocation check (
    revoked_at is null or revoked_at >= created_at
  )
);
create index if not exists owned_grants_by_owner
  on orca_owned_oauth_private.grants(owner_id,created_at desc);
create index if not exists owned_grants_by_client
  on orca_owned_oauth_private.grants(client_id);

-- Persistent opaque oidc-provider adapter data. The issuer encrypts the
-- JSON payload with AES-256-GCM before SQL, and hashes opaque reference IDs
-- before database storage. Key material never enters PostgreSQL.
create table if not exists orca_owned_oauth_private.provider_models (
  model_type text not null,
  model_id_hash bytea not null check (octet_length(model_id_hash)=32),
  grant_id_hash bytea check (grant_id_hash is null or octet_length(grant_id_hash)=32),
  uid_hash bytea check (uid_hash is null or octet_length(uid_hash)=32),
  user_code_hash bytea check (user_code_hash is null or octet_length(user_code_hash)=32),
  key_id text not null,
  iv bytea not null check (octet_length(iv)=12),
  ciphertext bytea not null,
  tag bytea not null check (octet_length(tag)=16),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  primary key(model_type,model_id_hash),
  constraint valid_owned_model_duration check (expires_at > created_at),
  constraint valid_owned_model_consumption check (
    consumed_at is null or consumed_at >= created_at
  )
);
create index if not exists owned_model_grant_lookup
  on orca_owned_oauth_private.provider_models(model_type,grant_id_hash);
create index if not exists owned_model_uid_lookup
  on orca_owned_oauth_private.provider_models(model_type,uid_hash);

-- One-time browser consent CSRF challenges. All identifying opaque tokens
-- are SHA-256 digests, never raw session/CSRF/interaction secrets.
create table if not exists orca_owned_oauth_private.consent_challenges (
  id uuid primary key,
  owner_id uuid not null,
  client_id text not null check (client_id ~ '^[!-~]{1,512}
-- ordinary API roles. The eventual server-owner role must be provisioned
-- separately and must not be a general database superuser/service_role.
alter table orca_owned_oauth_private.grants enable row level security;
alter table orca_owned_oauth_private.provider_models enable row level security;
alter table orca_owned_oauth_private.consent_challenges enable row level security;
revoke all on all tables in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;
revoke all on all sequences in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;

commit;
),
  resource text not null check (resource like 'https://%'),
  scope text not null check (scope='orca:research.read'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint valid_owned_grant_duration check (
    expires_at > created_at and expires_at <= created_at + interval '31 days'
  ),
  constraint valid_owned_grant_revocation check (
    revoked_at is null or revoked_at >= created_at
  )
);
create index if not exists owned_grants_by_owner
  on orca_owned_oauth_private.grants(owner_id,created_at desc);
create index if not exists owned_grants_by_client
  on orca_owned_oauth_private.grants(client_id);

-- Persistent opaque oidc-provider adapter data. The issuer encrypts the
-- JSON payload with AES-256-GCM before SQL, and hashes opaque reference IDs
-- before database storage. Key material never enters PostgreSQL.
create table if not exists orca_owned_oauth_private.provider_models (
  model_type text not null,
  model_id_hash bytea not null check (octet_length(model_id_hash)=32),
  grant_id_hash bytea check (grant_id_hash is null or octet_length(grant_id_hash)=32),
  uid_hash bytea check (uid_hash is null or octet_length(uid_hash)=32),
  user_code_hash bytea check (user_code_hash is null or octet_length(user_code_hash)=32),
  key_id text not null,
  iv bytea not null check (octet_length(iv)=12),
  ciphertext bytea not null,
  tag bytea not null check (octet_length(tag)=16),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  primary key(model_type,model_id_hash),
  constraint valid_owned_model_duration check (expires_at > created_at),
  constraint valid_owned_model_consumption check (
    consumed_at is null or consumed_at >= created_at
  )
);
create index if not exists owned_model_grant_lookup
  on orca_owned_oauth_private.provider_models(model_type,grant_id_hash);
create index if not exists owned_model_uid_lookup
  on orca_owned_oauth_private.provider_models(model_type,uid_hash);

-- PRIVATE-only. RLS enabled but, intentionally, no policies are granted to
-- ordinary API roles. The eventual server-owner role must be provisioned
-- separately and must not be a general database superuser/service_role.
alter table orca_owned_oauth_private.grants enable row level security;
alter table orca_owned_oauth_private.provider_models enable row level security;
revoke all on all tables in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;
revoke all on all sequences in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;

commit;
),
  resource text not null check (resource like 'https://%'),
  interaction_hash bytea not null check (octet_length(interaction_hash)=32),
  session_hash bytea not null check (octet_length(session_hash)=32),
  csrf_hash bytea not null check (octet_length(csrf_hash)=32),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint valid_owned_consent_lifetime check (
    expires_at > created_at and expires_at <= created_at + interval '6 minutes'
  ),
  constraint valid_owned_consent_redeem check (
    consumed_at is null or consumed_at >= created_at
  )
);
create index if not exists owned_consent_by_owner
  on orca_owned_oauth_private.consent_challenges(owner_id,created_at desc);
create index if not exists owned_consent_by_expiry
  on orca_owned_oauth_private.consent_challenges(expires_at);

-- PRIVATE-only. RLS enabled but, intentionally, no policies are granted to
-- ordinary API roles. The eventual server-owner role must be provisioned
-- separately and must not be a general database superuser/service_role.
alter table orca_owned_oauth_private.grants enable row level security;
alter table orca_owned_oauth_private.provider_models enable row level security;
revoke all on all tables in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;
revoke all on all sequences in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;

commit;
),
  resource text not null check (resource like 'https://%'),
  scope text not null check (scope='orca:research.read'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint valid_owned_grant_duration check (
    expires_at > created_at and expires_at <= created_at + interval '31 days'
  ),
  constraint valid_owned_grant_revocation check (
    revoked_at is null or revoked_at >= created_at
  )
);
create index if not exists owned_grants_by_owner
  on orca_owned_oauth_private.grants(owner_id,created_at desc);
create index if not exists owned_grants_by_client
  on orca_owned_oauth_private.grants(client_id);

-- Persistent opaque oidc-provider adapter data. The issuer encrypts the
-- JSON payload with AES-256-GCM before SQL, and hashes opaque reference IDs
-- before database storage. Key material never enters PostgreSQL.
create table if not exists orca_owned_oauth_private.provider_models (
  model_type text not null,
  model_id_hash bytea not null check (octet_length(model_id_hash)=32),
  grant_id_hash bytea check (grant_id_hash is null or octet_length(grant_id_hash)=32),
  uid_hash bytea check (uid_hash is null or octet_length(uid_hash)=32),
  user_code_hash bytea check (user_code_hash is null or octet_length(user_code_hash)=32),
  key_id text not null,
  iv bytea not null check (octet_length(iv)=12),
  ciphertext bytea not null,
  tag bytea not null check (octet_length(tag)=16),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  primary key(model_type,model_id_hash),
  constraint valid_owned_model_duration check (expires_at > created_at),
  constraint valid_owned_model_consumption check (
    consumed_at is null or consumed_at >= created_at
  )
);
create index if not exists owned_model_grant_lookup
  on orca_owned_oauth_private.provider_models(model_type,grant_id_hash);
create index if not exists owned_model_uid_lookup
  on orca_owned_oauth_private.provider_models(model_type,uid_hash);

-- PRIVATE-only. RLS enabled but, intentionally, no policies are granted to
-- ordinary API roles. The eventual server-owner role must be provisioned
-- separately and must not be a general database superuser/service_role.
alter table orca_owned_oauth_private.grants enable row level security;
alter table orca_owned_oauth_private.provider_models enable row level security;
revoke all on all tables in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;
revoke all on all sequences in schema orca_owned_oauth_private
  from public, anon, authenticated, service_role, authenticator;

commit;
