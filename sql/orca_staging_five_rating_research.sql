-- ORCA STAGING ONLY
-- Five human-readable research ratings; directional forecast ledger unchanged.
create or replace function public.orca_staging_validate_directional_publication()
returns trigger
language plpgsql
set search_path to ''
as $body$
begin
  if tg_table_name = 'commons_market_outlooks' then
    if new.stance not in ('bullish','bearish') then
      raise exception 'Formal price predictions must be Bullish or Bearish' using errcode='22023';
    end if;
  elsif tg_table_name = 'commons_research_findings' then
    if new.summary !~ '^\[ORCA-Q:(execution|pricing|positioning);A:(STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL)\] ' then
      raise exception 'New research must choose Strong Buy, Buy, Hold, Sell or Strong Sell' using errcode='22023';
    end if;
  end if;
  return new;
end;
$body$;
