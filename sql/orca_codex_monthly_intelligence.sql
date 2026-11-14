-- ORCA Company Codex: source-linked published chapters, immutable monthly editions,
-- private cost/idempotency ledger, and a non-exported cron signing key.
create table if not exists public.orca_codex_chapter_versions (
 id bigint generated always as identity primary key,
 ticker text not null references public.stocks(ticker),
 chapter text not null check (chapter in ('watchtower','vulnerabilities')),
 status text not null default 'ready' check (status in ('ready')),
 summary text not null check (char_length(summary) between 35 and 600),
 analysis jsonb not null check (jsonb_typeof(analysis)='array'),
 watch_items jsonb not null default '[]'::jsonb check (jsonb_typeof(watch_items)='array'),
 source_urls jsonb not null check (jsonb_typeof(source_urls)='array'),
 findings_count integer not null default 0 check (findings_count between 0 and 50),
 evidence_through timestamptz,
 generated_at timestamptz not null default now(),
 model text not null,
 generation_kind text not null check (generation_kind in ('initial','monthly')),
 estimated_cost_usd numeric(10,5) not null default 0 check (estimated_cost_usd>=0)
);
create index if not exists orca_codex_versions_read_idx
 on public.orca_codex_chapter_versions(ticker,chapter,generated_at desc);
alter table public.orca_codex_chapter_versions enable row level security;
drop policy if exists orca_codex_versions_public_read on public.orca_codex_chapter_versions;
create policy orca_codex_versions_public_read on public.orca_codex_chapter_versions
 for select to anon,authenticated using (status='ready');
revoke all on public.orca_codex_chapter_versions from public,anon,authenticated;
grant select on public.orca_codex_chapter_versions to anon,authenticated;

create table if not exists public.orca_codex_refresh_runs (
 id uuid primary key default gen_random_uuid(),
 ticker text not null references public.stocks(ticker),
 period_month date not null,
 state text not null check (state in ('reserved','completed','failed','no_evidence')),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 error_code text,
 model text,
 input_tokens integer not null default 0,
 output_tokens integer not null default 0,
 web_search_calls integer not null default 0,
 estimated_cost_usd numeric(10,5) not null default 0,
 unique(ticker,period_month)
);
create index if not exists orca_codex_refresh_runs_period_idx
 on public.orca_codex_refresh_runs(period_month,created_at);
alter table public.orca_codex_refresh_runs enable row level security;
revoke all on public.orca_codex_refresh_runs from public,anon,authenticated;

-- No public exposure or RLS read policy, including for signed-in accounts.
create table if not exists public.orca_codex_job_keys (
 name text primary key,
 secret_hex text not null check (char_length(secret_hex)=64)
);
alter table public.orca_codex_job_keys enable row level security;
revoke all on public.orca_codex_job_keys from public,anon,authenticated;
insert into public.orca_codex_job_keys(name,secret_hex)
 values ('monthly',replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''))
 on conflict(name) do nothing;

comment on table public.orca_codex_chapter_versions is
 'Public read-only versioned company intelligence. Server-only synthesis of dated sources and published agent evidence. No ratings or trading signals.';
comment on table public.orca_codex_refresh_runs is
 'Private monthly per-company idempotency, usage and cost ledger. No client writes.';
comment on table public.orca_codex_job_keys is
 'Private short-lived HMAC signing key for automated monthly cron requests. Never expose via Data API.';
