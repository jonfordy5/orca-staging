/* ORCA staging — one simple, as-of-price research scorecard.
 * Reads existing public findings and verified stored closing prices.
 * Never re-writes a prediction or claims a live quote.
 */
import { parseOrcaFinding } from './orca-research-brief.js';

const MARKET_ZONE = 'America/New_York';
const DAY_MS = 86400000;
function nyParts(value) {
 const date = new Date(value);
 if (!Number.isFinite(date.getTime())) return null;
 const parts = new Intl.DateTimeFormat('en-US',{
  timeZone:MARKET_ZONE,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(date);
 const p = key => parts.find(x => x.type === key)?.value;
 return {day:p('year')+'-'+p('month')+'-'+p('day'),hour:Number(p('hour')),minute:Number(p('minute'))};
}
const utcDay = day => Date.parse(day+'T12:00:00Z');
function normalizedPrices(rows) {
 const byDate = new Map();
 for (const row of Array.isArray(rows)?rows:[]) {
  const date=String(row?.session_date||'');
  const price=Number(row?.close_price);
  const source=String(row?.source_name||'').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(utcDay(date))||!Number.isFinite(price)||price<=0||!source) continue;
  // If conflicting data for the same date is returned, do not guess a winner.
  if (byDate.has(date)) {byDate.set(date,null);continue;}
  byDate.set(date,{date,price,source});
 }
 return [...byDate.values()].filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
}
export function compareResearchToLatest(findings,priceRows,now=Date.now()) {
 const prices=normalizedPrices(priceRows),currentTime=nyParts(now);
 const latest=prices.at(-1)||null;
 const priceAgeDays=latest&&currentTime?Math.round((utcDay(currentTime.day)-utcDay(latest.date))/DAY_MS):null;
 const currentPriceReady=Boolean(latest&&priceAgeDays>=0&&priceAgeDays<=4);
 const results=[];
 for(const f of Array.isArray(findings)?findings:[]) {
  const tag=parseOrcaFinding(f);
  if(!tag.isFourRating||!f.published_at)continue;
  const pub=nyParts(f.published_at);if(!pub)continue;
  // No look-ahead: if published before 4 pm NY, use the preceding completed session.
  const afterClose=pub.hour>=16;
  const eligible=prices.filter(p=>p.date<pub.day||(p.date===pub.day&&afterClose));
  const baseline=eligible.at(-1)||null;
  const lag=baseline?Math.round((utcDay(pub.day)-utcDay(baseline.date))/DAY_MS):null;
  const baselineOk=Boolean(baseline&&lag>=0&&lag<=7);
  let status='Pending price data',changePct=null;
  if(!baselineOk)status='Original reference price unavailable';
  else if(!currentPriceReady)status='Latest price unavailable or stale';
  else if(latest.date<=baseline.date)status='Awaiting next market close';
  else {
   changePct=100*(latest.price/baseline.price-1);
   status=Math.abs(changePct)<1e-9?'Unchanged':(changePct>0?'BULLISH':'BEARISH')===tag.direction?'Direction matched':'Direction missed';
  }
  results.push({
   id:String(f.id||''),metric:String(f.research_area||'Research'),alias:String(f.contributor_alias||'Researcher'),
   publishedAt:f.published_at,originalRating:tag.rating,conviction:tag.conviction,
   direction:tag.direction,baseline:baselineOk?baseline:null,latest:currentPriceReady?latest:null,
   changePct,status
  });
 }
 results.sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 const scored=results.filter(r=>r.status==='Direction matched'||r.status==='Direction missed');
 const wins=scored.filter(r=>r.status==='Direction matched').length;
 return {results,scored:scored.length,matches:wins,latest:currentPriceReady?latest:null,
  latestDateAvailable:latest?.date||null,priceStatus:currentPriceReady?'ready':latest?'stale':'not connected'};
}
