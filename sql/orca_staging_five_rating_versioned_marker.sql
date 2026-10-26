-- ORCA staging: explicit v2 five-rating marker separates current ratings
-- from legacy binary metric opinions, without altering historical findings.
-- Old in-flight binary findings remain accepted for compatibility; formal
-- price forecasts and their scoring remain explicitly bullish/bearish.
create or replace function public.orca_staging_validate_directional_publication()
returns trigger language plpgsql
set search_path to ''
as $body$
begin
 if tg_table_name='commons_market_outlooks' then
  if new.stance not in ('bullish','bearish') then
   raise exception 'Formal price predictions must be Bullish or Bearish' using errcode='22023';
  end if;
 elsif tg_table_name='commons_research_findings' then
  if new.summary !~ '^\[ORCA-R2;Q:(execution|pricing|positioning);A:(STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL)\] '
   and new.summary !~ '^\[ORCA-Q:(execution|pricing|positioning);A:(BULLISH|BEARISH)\] ' then
   raise exception 'Research rating must be Strong Buy, Buy, Hold, Sell or Strong Sell' using errcode='22023';
  end if;
 end if;
 return new;
end;
$body$;
