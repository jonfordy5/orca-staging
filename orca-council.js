/*
 * ORCA R3 — The Council (read-only current evidence classification).
 *
 * The source list is a bounded public display query, NOT the permanent research
 * archive or a verification of the truth of any market claim. Server expiry and
 * dated observation both matter. All-time search totals belong to a separate
 * historical section, never the live outlook gauge.
 */
const HOUR=60*60*1000, DAY=24*HOUR;
export const COUNCIL_REVIEW_WINDOWS=Object.freeze({
 'news & market sentiment':3*DAY,
 'technical analysis':3*DAY,
 'volume':3*DAY,
 'volume & market positioning':3*DAY,
 'relative trading volume':3*DAY,
 'options':3*DAY,
 'options activity':3*DAY,
 'sec filings & catalysts':14*DAY,
 'fundamentals & valuation':30*DAY
});
const R4=/^\[ORCA-R4;Q:(execution|pricing|positioning);A:(STRONG_BUY|BUY|SELL|STRONG_SELL);D:(BULLISH|BEARISH)\]\s*/;
const when=(s)=>{const ms=Date.parse(typeof s==='string'?s:'');return Number.isFinite(ms)?ms:NaN};
function allowedSource(url){
 if(typeof url!=='string')return false;
 try{const u=new URL(url);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}
}
export function selectCouncilEvidence(raw,now=Date.now()){
 const currentByResearcherMetric=new Map(),archive=[],all=Array.isArray(raw)?raw:[];
 // Stable ordering chooses the newest published report for each
 // *display alias* and metric; alias grouping is not identity verification.
 const ordered=[...all].sort((a,b)=>(when(b?.published_at)||0)-(when(a?.published_at)||0));
 for(const f of ordered){
  if(!f||typeof f.summary!=='string'){continue;}
  const parsed=R4.exec(f.summary);
  const observation=when(f.observed_at),publication=when(f.published_at);
  const expiry=f.expires_at==null?Infinity:when(f.expires_at);
  const metric=String(f.research_area||'').trim().toLowerCase();
  const window=COUNCIL_REVIEW_WINDOWS[metric];
  const sourceURLs=(Array.isArray(f.source_urls)?f.source_urls:[]).filter(allowedSource);
  const validRating=parsed&&((parsed[2].endsWith('BUY')&&parsed[3]==='BULLISH')||
    (parsed[2].endsWith('SELL')&&parsed[3]==='BEARISH'));
  const fresh=Boolean(validRating&&window&&Number.isFinite(observation)&&
   Number.isFinite(publication)&&observation<=now&&publication<=now&&
   now-observation<=window&&expiry>now&&sourceURLs.length>0);
  if(!fresh){archive.push(f);continue;}
  const author=String(f.contributor_alias||'').trim().toLowerCase()||'unattributed';
  const key=author+'|'+metric;
  if(currentByResearcherMetric.has(key)){archive.push(f);continue;}
  currentByResearcherMetric.set(key,{...f,direction:parsed[3],rating:parsed[2],source_urls:sourceURLs});
 }
 const current=[...currentByResearcherMetric.values()];
 const bullish=current.filter(f=>f.direction==='BULLISH');
 const bearish=current.filter(f=>f.direction==='BEARISH');
 const lead=bullish.length>bearish.length?'bullish':bearish.length>bullish.length?'bearish':
  current.length?'split':'none';
 return {current,bullish,bearish,archive,lead,
  newestObservedAt:current.length?Math.max(...current.map(f=>when(f.observed_at))):null,
  // This is only a number of alias strings, NOT a verified distinct-owner count.
  authorLabels:new Set(current.map(f=>String(f.contributor_alias||'').trim().toLowerCase())).size,
  sourceLimit:all.length>=100
 };
}
export function councilLeadLabel(view){
 if(view.lead==='bullish')return 'Recent research leans bullish';
 if(view.lead==='bearish')return 'Recent research leans bearish';
 if(view.lead==='split')return 'Recent research is divided';
 return 'Fresh research needed';
}
