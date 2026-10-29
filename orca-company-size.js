// ORCA company-size facts: Wikipedia/Wikidata only, never a paid AI generation.
// Figures are historical and must carry source links and observation years.
const TTL=180*24*60*60*1000;
const memory=new Map();
const yr=(s)=>{
 const all=String(s||'').match(/(?:19|20)\d{2}/g)?.map(Number).filter(y=>y<=new Date().getFullYear()&&y>1980)||[];
 return all.length?Math.max(...all):null;
};
const last=(a,b)=>!a?b||null:!b?a:(b.year||0)>(a.year||0)?b:a;
const plain=(node)=>{
 if(!node)return '';
 const e=node.cloneNode(true);
 e.querySelectorAll('sup,.reference,.mw-editsection,script,style').forEach(n=>n.remove());
 return (e.textContent||'').replace(/\s+/g,' ').trim();
};
async function json(url){
 const controller=new AbortController(),id=setTimeout(()=>controller.abort(),8500);
 try{
  const response=await fetch(url,{credentials:'omit',signal:controller.signal});
  if(!response.ok)throw Error('Source temporarily unavailable');
  return await response.json();
 }finally{clearTimeout(id);}
}
function entityValue(entity,property){
 const claims=entity?.claims?.[property]||[];
 const found=claims.filter(c=>c.rank!=='deprecated'&&c.mainsnak?.datavalue?.value?.amount)
  .map(c=>({
   amount:Number(c.mainsnak.datavalue.value.amount),
   unit:String(c.mainsnak.datavalue.value.unit||''),
   year:yr(c.qualifiers?.P585?.[0]?.datavalue?.value?.time||'')
  }))
  .filter(x=>Number.isFinite(x.amount)&&x.amount>0);
 found.sort((a,b)=>(b.year||0)-(a.year||0));
 return found[0]||null;
}
function parseEntityFacts(entity,qid){
 const source='https://www.wikidata.org/wiki/'+qid;
 const emp=entityValue(entity,'P1128'),rev=entityValue(entity,'P2139');
 const unit=rev?.unit?.split('/').pop();
 const currency={Q4917:'USD',Q4916:'EUR',Q25224:'GBP',Q8146:'JPY',Q1104069:'CAD',Q80524:'INR',Q202040:'KRW',Q39099:'CNY'}[unit];
 return {
  employees:emp&&emp.amount<1e8?{value:Math.round(emp.amount),year:emp.year,source}:null,
  revenue:rev&&currency?{value:rev.amount,currency,year:rev.year,source}:null
 };
}
function parseInfobox(html,articleUrl){
 const dom=new DOMParser().parseFromString(html,'text/html');
 const result={};
 for(const row of dom.querySelectorAll('table.infobox tr')){
  const name=plain(row.querySelector(':scope > th')).toLowerCase();
  const value=plain(row.querySelector(':scope > td'));
  if(!value)continue;
  if(!result.employees&&/^(?:number of )?employees\b/.test(name)){
   const m=value.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,7})\b/);
   const count=m?Number(m[1].replace(/,/g,'')):0;
   if(count>0&&count<1e8)result.employees={value:count,year:yr(value),source:articleUrl};
  }
  if(!result.revenue&&/^revenue\b/.test(name)){
   const m=value.match(/(US\$|USD|CA\$|C\$|A\$|€|£|₹)\s*([\d,.]+)\s*(trillion|billion|million|thousand|tn|bn)\b/i);
   if(!m)continue;
   const curr={'US$':'USD',USD:'USD','CA$':'CAD','C$':'CAD','A$':'AUD','€':'EUR','£':'GBP','₹':'INR'};
   const mult={trillion:1e12,billion:1e9,million:1e6,thousand:1e3,tn:1e12,bn:1e9}[m[3].toLowerCase()];
   const n=Number(m[2].replace(/,/g,''))*mult;
   if(n>0&&Number.isFinite(n))result.revenue={value:n,currency:curr[m[1].toUpperCase()]||curr[m[1]],year:yr(value),source:articleUrl};
  }
 }
 return result;
}
function summaryTitle(name,source){
 try{
  const u=new URL(source);
  if(u.hostname==='en.wikipedia.org'&&u.pathname.startsWith('/wiki/'))
   return decodeURIComponent(u.pathname.slice(6)).replace(/_/g,' ');
 }catch{}
 return String(name||'').replace(/\s+(?:Class\s+[A-Z]+\s+)?Common Stock.*$/i,'').trim();
}
export function formatCompanyRevenue(r){
 if(!r||!Number.isFinite(r.value)||!r.currency)return null;
 const v=r.value,scale=v>=1e12?1e12:v>=1e9?1e9:v>=1e6?1e6:1;
 const suffix=scale===1e12?' trillion':scale===1e9?' billion':scale===1e6?' million':'';
 const prefix={USD:'US$',EUR:'€',GBP:'£',JPY:'¥',CAD:'CA$',INR:'₹',AUD:'A$',KRW:'₩',CNY:'CN¥'}[r.currency]||r.currency+' ';
 return prefix+new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v/scale)+suffix;
}
export async function getCompanySize(ticker,name,profile={}){
 const key='orca-company-size-v1-'+ticker;
 if(memory.has(key))return memory.get(key);
 const p=(async()=>{
  try{
   const cached=JSON.parse(localStorage.getItem(key)||'null');
   if(cached?.at&&Date.now()-cached.at<TTL&&cached.facts)return cached.facts;
  }catch{}
  let title=summaryTitle(name,profile.source),qid=String(profile.wikidataURL||'').match(/Q\d+$/)?.[0]||'';
  // Confirm the Wikipedia article and its Wikidata ID; no company-name search guess.
  let articleUrl='';
  try{
   const titles=[title,title.replace(/\s+(?:Corporation|Incorporated|Inc\.?|Company)\.?$/i,'').trim()];
   for(const candidate of [...new Set(titles)]){
    if(!candidate)continue;
    try{
     const r=await json('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(candidate.replace(/ /g,'_')));
     if(r.type!=='standard'||!r.content_urls?.desktop?.page)continue;
     const norm=x=>String(x).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\b(inc|corporation|company)\b/g,'').trim();
     if(norm(r.title)!==norm(candidate))continue;
     title=r.title;articleUrl=r.content_urls.desktop.page;qid=r.wikibase_item||qid;break;
    }catch{}
   }
  }catch{}
  let wikidata={},infobox={};
  const jobs=[];
  if(/^Q\d+$/.test(qid)){
   jobs.push((async()=>{
    try{
     const u=new URL('https://www.wikidata.org/w/api.php');
     for(const [k,v] of Object.entries({action:'wbgetentities',format:'json',origin:'*',props:'claims',ids:qid}))u.searchParams.set(k,v);
     const doc=await json(u.href);wikidata=parseEntityFacts(doc.entities?.[qid],qid);
    }catch{}
   })());
  }
  if(articleUrl){
   jobs.push((async()=>{
    try{
     const u=new URL('https://en.wikipedia.org/w/api.php');
     for(const [k,v] of Object.entries({action:'parse',format:'json',formatversion:'2',prop:'text',section:'0',page:title,origin:'*'}))u.searchParams.set(k,v);
     const doc=await json(u.href);
     infobox=parseInfobox(String(doc.parse?.text||''),articleUrl);
    }catch{}
   })());
  }
  await Promise.all(jobs);
  const facts={employees:last(wikidata.employees,infobox.employees),revenue:last(wikidata.revenue,infobox.revenue)};
  try{localStorage.setItem(key,JSON.stringify({at:Date.now(),facts}));}catch{}
  return facts;
 })();
 memory.set(key,p);
 return p;
}
