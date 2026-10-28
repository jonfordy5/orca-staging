import { parseOrcaFinding } from './orca-research-brief.js';
const WINDOWS=[7,30,90];
const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const plus=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
export function rateResearchHistory(findings,prices,now=Date.now()){
 const today=day(now),rows=(prices||[]).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.session_date)&&Number(x.close_price)>0&&x.source_name).map(x=>({date:x.session_date,close:Number(x.close_price),source:x.source_name})).sort((a,b)=>a.date.localeCompare(b.date));
 const first=(a,b)=>rows.find(x=>x.date>=a&&x.date<=b);
 const calls=[];
 for(const f of findings||[]){
  const tag=parseOrcaFinding(f);if(!tag.isFourRating||!f.published_at)continue;
  const published=day(f.published_at),baseline=first(plus(published,1),plus(published,6));
  const results=WINDOWS.map(n=>{
   if(!baseline)return {days:n,status:'No verified starting close'};
   const due=plus(baseline.date,n);
   if(due>today)return {days:n,status:'Awaiting deadline'};
   const close=first(due,plus(due,5));
   if(!close)return {days:n,status:'Awaiting verified closing price'};
   const pct=(close.close/baseline.close-1)*100;
   return {days:n,status:pct===0?'Flat — unscored':(pct>0?'BULLISH':'BEARISH')===tag.direction?'Matched':'Missed',returnPct:pct,closeDate:close.date,closeSource:close.source};
  });
  calls.push({id:f.id,alias:f.contributor_alias,metric:f.research_area,published:f.published_at,rating:tag.rating,direction:tag.direction,conviction:tag.conviction,baseline,results});
 }
 const aggregate=WINDOWS.map(n=>{const decided=calls.map(c=>c.results.find(r=>r.days===n)).filter(r=>['Matched','Missed'].includes(r.status));return {days:n,matched:decided.filter(r=>r.status==='Matched').length,count:decided.length};});
 return {calls,aggregate,priceDataAvailable:rows.length>0};
}