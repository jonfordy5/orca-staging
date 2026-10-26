-- ORCA staging ONLY: permanent prediction ledger, version 1.
-- Review and apply in the isolated ORCA STAGING Supabase SQL editor only.
-- Staging project: vbziibatnejoswsdggga
-- This file is a migration artifact in GitHub; committing does NOT execute SQL.
-- Do NOT use in production without a separate review/approval.
-- Existing research, old outlooks, and public 30-day visibility behavior are unchanged.
--
-- Principles:
-- 1) Capture an immutable copy of EVERY bullish/bearish outlook, even legacy submissions.
-- 2) Freeze the declared baseline and target date for NEW accountable forecasts.
-- 3) Keep public history readable after the existing outlook's expires_at.
-- 4) No direct browser INSERT/UPDATE/DELETE.
-- 5) Never assign a win until an independently verified baseline and ending close exist.
-- 6) Only server-side service_role may verify/settle; NO service-role keys in the browser.
-- 7) No deletion/cleanup job is created. See accompanying security test plan.

begin;

do $preflight$
begin
  if to_regclass('public.commons_market_outlooks') is null
    or to_regclass('public.commons_research_findings') is null then
    raise exception 'Expected staging research/outlook schema is not installed';
  end if;
  if to_regclass('public.commons_prediction_ledger') is not null then
    raise exception 'Prediction ledger already exists; do not run this migration twice';
  end if;
end
$preflight$;

create table public.commons_prediction_ledger (
  outlook_id uuid primary key
    references public.commons_market_outlooks(id) on delete restrict,
  ticker text not null references public.stocks(ticker) on delete restrict,
  researcher_id uuid not null references auth.users(id) on delete restrict,
  researcher_alias text not null,
  stance text not null check (stance in ('bullish','bearish')),
  observed_at timestamptz not null,
  published_at timestamptz not null,
  reasoning text not null,
  investment_timeframe text not null,
  invalidation_condition text not null,
  supporting_finding_ids uuid[] not null default '{}'::uuid[],
  evidence_urls jsonb not null default '[]'::jsonb,

  -- Forecast terms are null on historic records until independently curated.
  baseline_session_date date,
  declared_baseline_close numeric(18,6),
  baseline_source_url text,
  target_session_date date,
  verified_baseline_close numeric(18,6),
  baseline_verified_at timestamptz,

  settlement_session_date date,
  settlement_close numeric(18,6),
  settlement_source_url text,
  price_return_pct numeric(18,6),
  direction_correct boolean,
  settled_at timestamptz,

  score_state text not null default 'needs_terms'
    check (score_state in (
      'needs_terms','pending_baseline','awaiting_close',
      'correct','incorrect','flat','unscorable'
    )),
  constraint prediction_terms_consistent check (
    (baseline_session_date is null and declared_baseline_close is null
       and baseline_source_url is null and target_session_date is null)
    or
    (baseline_session_date is not null and declared_baseline_close > 0
       and baseline_source_url is not null and target_session_date is not null
       and target_session_date > baseline_session_date)
  ),
  constraint prediction_verification_consistent check (
    (baseline_verified_at is null and verified_baseline_close is null)
    or
    (baseline_verified_at is not null and verified_baseline_close > 0)
  ),
  constraint prediction_settlement_consistent check (
    (settled_at is null and settlement_close is null
       and settlement_session_date is null and settlement_source_url is null
       and price_return_pct is null and direction_correct is null)
    or
    (settled_at is not null and settlement_close > 0
       and settlement_session_date is not null and settlement_source_url is not null
       and price_return_pct is not null)
  )
);

create index commons_prediction_ledger_ticker_public_idx
  on public.commons_prediction_ledger(ticker, published_at desc);
create index commons_prediction_ledger_pending_idx
  on public.commons_prediction_ledger(target_session_date, score_state)
  where score_state in ('pending_baseline','awaiting_close','needs_terms');

alter table public.commons_prediction_ledger enable row level security;
revoke all on public.commons_prediction_ledger from public, anon, authenticated;
grant select (
  outlook_id,ticker,researcher_alias,stance,observed_at,published_at,
  reasoning,investment_timeframe,invalidation_condition,
  supporting_finding_ids,evidence_urls,baseline_session_date,
  declared_baseline_close,baseline_source_url,target_session_date,
  verified_baseline_close,baseline_verified_at,settlement_session_date,
  settlement_close,settlement_source_url,price_return_pct,
  direction_correct,settled_at,score_state
) on public.commons_prediction_ledger to anon, authenticated;

create policy "Public may read permanent forecast history"
  on public.commons_prediction_ledger for select
  to anon, authenticated using (true);

-- Snapshot an outlook immediately when the EXISTING authorized RPC creates it.
-- This also covers old site versions using commons_submit_market_outlook.
create function public.commons_snapshot_market_outlook()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.stance in ('bullish','bearish') then
    insert into public.commons_prediction_ledger (
      outlook_id,ticker,researcher_id,researcher_alias,stance,observed_at,
      published_at,reasoning,investment_timeframe,invalidation_condition,
      supporting_finding_ids,evidence_urls,score_state
    ) values (
      new.id,new.ticker,new.researcher_id,new.researcher_alias,new.stance,
      new.observed_at,new.created_at,new.reasoning,new.investment_timeframe,
      new.invalidation_condition,new.supporting_finding_ids,new.evidence_urls,
      'needs_terms'
    );
  end if;
  return new;
end;
$$;
revoke all on function public.commons_snapshot_market_outlook()
  from public,anon,authenticated;
create trigger commons_snapshot_market_outlook_after_insert
  after insert on public.commons_market_outlooks
  for each row execute function public.commons_snapshot_market_outlook();

-- Preserve all current and previously expired directional outlooks.
-- Missing historical baseline/target dates are not invented or silently inferred.
insert into public.commons_prediction_ledger (
  outlook_id,ticker,researcher_id,researcher_alias,stance,observed_at,
  published_at,reasoning,investment_timeframe,invalidation_condition,
  supporting_finding_ids,evidence_urls,score_state
)
select o.id,o.ticker,o.researcher_id,o.researcher_alias,o.stance,o.observed_at,
  o.created_at,o.reasoning,o.investment_timeframe,o.invalidation_condition,
  o.supporting_finding_ids,o.evidence_urls,'needs_terms'
from public.commons_market_outlooks o
where o.stance in ('bullish','bearish')
on conflict (outlook_id) do nothing;

-- Authenticated, atomic submission. It invokes the ALREADY APPROVED
-- owner-bound outlook RPC and fills structured terms in the same transaction.
-- If either step fails, the whole transaction rolls back.
create function public.commons_submit_accountable_outlook (
  p_ticker text,
  p_stance text,
  p_reasoning text,
  p_supporting_finding_ids uuid[],
  p_evidence_urls jsonb,
  p_observed_at timestamptz,
  p_investment_timeframe text,
  p_invalidation_condition text,
  p_baseline_session_date date,
  p_declared_baseline_close numeric,
  p_baseline_source_url text,
  p_target_session_date date
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_outlook uuid;
  v_today date := (pg_catalog.now() at time zone 'America/New_York')::date;
begin
  if p_stance not in ('bullish','bearish') then
    raise exception 'New forecast must be Bullish or Bearish' using errcode='22023';
  end if;
  if p_baseline_session_date is null
      or p_declared_baseline_close is null
      or p_declared_baseline_close <= 0
      or p_declared_baseline_close > 10000000
      or p_baseline_session_date > v_today
      or p_baseline_session_date < v_today - 21 then
    raise exception 'Provide a recent, completed market session and positive reference close'
      using errcode='22023';
  end if;
  if p_target_session_date is null
      or p_target_session_date <= v_today
      or p_target_session_date > v_today + 730 then
    raise exception 'Provide a future forecast deadline within two years'
      using errcode='22023';
  end if;
  if p_baseline_source_url is null
      or pg_catalog.char_length(p_baseline_source_url) > 500
      or p_baseline_source_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'A reference-close source URL is required' using errcode='22023';
  end if;

  -- Retains existing owner authentication, opt-in, ticker membership,
  -- source validation and public finding authorization.
  v_outlook := public.commons_submit_market_outlook(
    p_ticker=>p_ticker,
    p_stance=>p_stance,
    p_reasoning=>p_reasoning,
    p_supporting_finding_ids=>p_supporting_finding_ids,
    p_evidence_urls=>p_evidence_urls,
    p_observed_at=>p_observed_at,
    p_investment_timeframe=>p_investment_timeframe,
    p_invalidation_condition=>p_invalidation_condition
  );

  update public.commons_prediction_ledger
     set baseline_session_date=p_baseline_session_date,
         declared_baseline_close=p_declared_baseline_close,
         baseline_source_url=p_baseline_source_url,
         target_session_date=p_target_session_date,
         score_state='pending_baseline'
   where outlook_id=v_outlook
     and researcher_id=auth.uid()
     and score_state='needs_terms';
  if not found then
    raise exception 'Forecast terms could not be frozen; nothing published'
      using errcode='23514';
  end if;
  return v_outlook;
end;
$$;
revoke all on function public.commons_submit_accountable_outlook(
  text,text,text,uuid[],jsonb,timestamptz,text,text,date,numeric,text,date
) from public,anon,authenticated;
grant execute on function public.commons_submit_accountable_outlook(
  text,text,text,uuid[],jsonb,timestamptz,text,text,date,numeric,text,date
) to authenticated;

-- Server-admin-only curation of legacy predictions.
-- Never infer or invent terms from free-text investment timeframes.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

create function private.commons_set_legacy_prediction_terms (
  p_outlook_id uuid,
  p_baseline_session_date date,
  p_declared_baseline_close numeric,
  p_baseline_source_url text,
  p_target_session_date date
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_baseline_session_date is null
     or p_declared_baseline_close <= 0
     or p_baseline_source_url !~* '^https?://[^[:space:]]+$'
     or p_target_session_date <= p_baseline_session_date then
    raise exception 'Invalid verified legacy terms';
  end if;
  update public.commons_prediction_ledger set
    baseline_session_date=p_baseline_session_date,
    declared_baseline_close=p_declared_baseline_close,
    baseline_source_url=p_baseline_source_url,
    target_session_date=p_target_session_date,
    score_state='pending_baseline'
  where outlook_id=p_outlook_id and score_state='needs_terms';
  if not found then raise exception 'Legacy record missing or terms already locked'; end if;
end;
$$;
revoke all on function private.commons_set_legacy_prediction_terms(uuid,date,numeric,text,date)
  from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.commons_set_legacy_prediction_terms(uuid,date,numeric,text,date)
  to service_role;

-- Admin verifies the exact reference close independently, without rewriting
-- the original claimed price. Difference >1 cent blocks scoring for review.
create function private.commons_verify_prediction_baseline (
  p_outlook_id uuid,
  p_verified_close numeric,
  p_verified_source_url text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_base numeric;
begin
  select declared_baseline_close into v_base
    from public.commons_prediction_ledger
    where outlook_id=p_outlook_id and score_state='pending_baseline' for update;
  if not found then raise exception 'Not pending baseline verification'; end if;
  if p_verified_close is null or p_verified_close <= 0
    or p_verified_source_url !~* '^https?://[^[:space:]]+$'
    or pg_catalog.abs(v_base-p_verified_close)>0.01 then
    raise exception 'Verified source and original reference disagree; manual review required';
  end if;
  update public.commons_prediction_ledger
    set verified_baseline_close=p_verified_close,
      baseline_verified_at=pg_catalog.now(),
      score_state='awaiting_close'
    where outlook_id=p_outlook_id;
end;
$$;
revoke all on function private.commons_verify_prediction_baseline(uuid,numeric,text)
  from public,anon,authenticated;
grant execute on function private.commons_verify_prediction_baseline(uuid,numeric,text)
  to service_role;

-- Restricted settlement after the target's actual regular-session close.
-- For nontrading target dates, the first exchange close within 7 calendar days
-- after the stated date is eligible; a verified market data operator must check.
create function private.commons_settle_prediction (
  p_outlook_id uuid,
  p_actual_close_date date,
  p_actual_close numeric,
  p_close_source_url text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.commons_prediction_ledger%rowtype;
  v_correct boolean;
  v_result text;
begin
  select * into v from public.commons_prediction_ledger
    where outlook_id=p_outlook_id and score_state='awaiting_close' for update;
  if not found then raise exception 'Forecast is not ready for settlement'; end if;
  if p_actual_close_date is null
     or p_actual_close_date < v.target_session_date
     or p_actual_close_date > v.target_session_date + 7
     or p_actual_close_date > (pg_catalog.now() at time zone 'America/New_York')::date
     or p_actual_close is null or p_actual_close <= 0
     or p_close_source_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Provide independently verified close on/after forecast deadline';
  end if;
  v_correct := case
      when p_actual_close=v.verified_baseline_close then null
      when v.stance='bullish' then p_actual_close>v.verified_baseline_close
      else p_actual_close<v.verified_baseline_close end;
  v_result := case
      when v_correct is null then 'flat'
      when v_correct then 'correct'
      else 'incorrect' end;
  update public.commons_prediction_ledger set
    settlement_session_date=p_actual_close_date,
    settlement_close=p_actual_close,
    settlement_source_url=p_close_source_url,
    price_return_pct=pg_catalog.round(
      ((p_actual_close/v.verified_baseline_close)-1)*100,6),
    direction_correct=v_correct,
    score_state=v_result,
    settled_at=pg_catalog.now()
  where outlook_id=p_outlook_id;
end;
$$;
revoke all on function private.commons_settle_prediction(uuid,date,numeric,text)
  from public,anon,authenticated;
grant execute on function private.commons_settle_prediction(uuid,date,numeric,text)
  to service_role;

-- Historical write protection: no client mutations.
comment on table public.commons_prediction_ledger is
  'Permanent, immutable public outlook snapshots; terms frozen at submission. Scoring is server-admin-only and requires an independently verified market close. No automated quote import yet.';
comment on function public.commons_submit_accountable_outlook(
  text,text,text,uuid[],jsonb,timestamptz,text,text,date,numeric,text,date
) is 'Atomic authorized forecast submission with original baseline and target date.';
commit;
