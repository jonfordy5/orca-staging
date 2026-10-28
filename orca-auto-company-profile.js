// Auto-generated, source-attributed company profile for newly registered stocks.
// This is informational only; never infer a company's mission, ownership, or finances.
const cache=new Map();
const $=(parent,tag,cls,value)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(value!==undefined)node.textContent=value;
 parent.append(node);
 return node;
};
const normalize=s=>String(s||'').toLowerCase().replace(/&/g,' and ')
 .replace(/[^a-z0-9 ]/g,' ').replace(/\b(the|inc|incorporated|corp|corporation|co|company|limited|ltd|plc|common|stock|shares|class)\b/g,' ')
 .replace(/\s+/g,' ').trim();
function listingBase(name){
 return String(name||'').replace(/\s+(?:Class [A-Z] )?Common Stock.*$/i,'')
  .replace(/\s+(?:American Depositary Shares|Ordinary Shares)\b.*$/i,'')
  .replace(/\s+/g,' ').trim();
}
function urlLink(parent,label,url){
 try{
  const target=new URL(url);
  if(target.protocol!=='https:')return;
  const a=$(parent,'a',null,label);a.href=target.href;a.target='_blank';a.rel='noopener noreferrer';
 }catch{/* Do not render malformed source links */}
}
async function requestJson(url){
 const c=new AbortController(),timeout=setTimeout(()=>c.abort(),7500);
 try{const r=await fetch(url,{signal:c.signal,credentials:'omit'});if(!r.ok)throw Error('External source unavailable');return await r.json();}
 finally{clearTimeout(timeout);}
}
async function wikiSummary(title){
 const url='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title.replace(/ /g,'_'));
 return requestJson(url);
}
async function loadArticle(companyName){
 const base=listingBase(companyName);
 const candidates=[base,base.replace(/\s+(?:Corporation|Inc\.?|Incorporated|Limited|Ltd\.?|Company)\.?$/i,'').trim()];
 const seen=new Set();
 for(const candidate of candidates){
  if(!candidate||seen.has(candidate.toLowerCase()))continue;seen.add(candidate.toLowerCase());
  try{
   const p=await wikiSummary(candidate);
   if(p.type!=='standard'||!p.extract||!p.content_urls?.desktop?.page)continue;
   const a=normalize(base),b=normalize(p.title);
   if(a&&b&&(a===b||a.startsWith(b+' ')||b.startsWith(a+' ')))return p;
  }catch{/* Continue to a conservative company-name candidate */}
 }
 return null;
}
function licenseAllowed(name){
 return /^(?:CC BY(?:-SA)?\b|CC0\b|Public domain\b|PD[- ]|PDM\b)/i.test(String(name||'').trim());
}
function artistText(html){
 const node=document.createElement('div');node.textContent=String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
 return node.textContent.replace(/\s+/g,' ').trim().slice(0,100);
}
// Commons licensing and descriptive credit are checked before displaying any media.
async function commonsFile(file,{logo=false}={}){
 if(typeof file!=='string'||!/^[^<>]{1,250}\.(?:svg|png|jpe?g|webp)$/i.test(file))return null;
 if(!logo&&/(logo|icon|seal|flag|wordmark|symbol|emblem)/i.test(file))return null;
 const api=new URL('https://commons.wikimedia.org/w/api.php');
 for(const [k,v] of Object.entries({action:'query',format:'json',origin:'*',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:720,titles:'File:'+file}))api.searchParams.set(k,v);
 try{
  const d=await requestJson(api.href),p=Object.values(d.query?.pages||{})[0],i=p?.imageinfo?.[0];
  const license=String(i?.extmetadata?.LicenseShortName?.value||''),url=i?.thumburl||i?.url,source=i?.descriptionurl;
  if(!licenseAllowed(license)||!url||!source)return null;
  const imageURL=new URL(url),sourceURL=new URL(source);
  if(imageURL.protocol!=='https:'||!/(^|\.)wikimedia\.org$/.test(imageURL.hostname)
     ||sourceURL.protocol!=='https:'||sourceURL.hostname!=='commons.wikimedia.org')return null;
  return {url:imageURL.href,source:sourceURL.href,license,credit:artistText(i.extmetadata?.Artist?.value)||'Wikimedia Commons contributor',
    caption:file.replace(/_/g,' ').replace(/\.[^.]+$/,'')};
 }catch{return null;}
}
async function sourcedPhoto(article){
 const api=new URL('https://en.wikipedia.org/w/api.php');
 for(const [k,v] of Object.entries({action:'query',format:'json',origin:'*',prop:'pageimages',piprop:'name',titles:article.title}))api.searchParams.set(k,v);
 try{
  const d=await requestJson(api.href);
  const file=Object.values(d.query?.pages||{})[0]?.pageimage;
  return await commonsFile(file);
 }catch{return null;}
}
function valueOf(entity,property){
 const claims=entity?.claims?.[property];
 if(!Array.isArray(claims))return null;
 const row=claims.find(x=>x.rank==='preferred'&&x.mainsnak?.datavalue)
   ||claims.find(x=>x.rank!=='deprecated'&&x.mainsnak?.datavalue);
 return row?.mainsnak?.datavalue?.value??null;
}
function namedItem(value){return typeof value?.id==='string'&&/^Q\d+$/.test(value.id)?value.id:null;}
async function wikidataEntities(ids,props='labels|descriptions|claims'){
 const valid=[...new Set(ids.filter(id=>/^Q\d+$/.test(id||'')))].slice(0,8);
 if(!valid.length)return {};
 const u=new URL('https://www.wikidata.org/w/api.php');
 for(const [k,v] of Object.entries({action:'wbgetentities',format:'json',origin:'*',languages:'en',props,ids:valid.join('|')}))u.searchParams.set(k,v);
 const r=await requestJson(u.href);return r.entities||{};
}
function siteURL(s){
 if(typeof s!=='string')return null;
 try{const u=new URL(s);return u.protocol==='https:'&&u.hostname.includes('.')?u.href:null;}catch{return null;}
}
function foundedYear(v){
 const match=typeof v?.time==='string'&&/^\+?(-?\d{4})/.exec(v.time);
 return match?match[1]:null;
}
function firstHqFromArticle(intro){
 const phrase=/(?:headquartered|headquarters (?:are|is) (?:based|located))\s+in\s+([A-Z][A-Za-z .'-]{2,65},\s*[A-Z][A-Za-z .'-]{2,60})(?:,|\s|\.|$)/.exec(intro);
 return phrase?phrase[1].trim():null;
}
async function wikidataCompany(article,intro){
 const id=article?.wikibase_item;
 if(!/^Q\d+$/.test(id||''))return {};
 try{
  const entities=await wikidataEntities([id]);
  const entity=entities[id];
  if(!entity)return {};
  const hqId=namedItem(valueOf(entity,'P159'));
  const industryId=namedItem(valueOf(entity,'P452'));
  const links=await wikidataEntities([hqId,industryId],'labels');
  const label=q=>links[q]?.labels?.en?.value||null;
  const homepage=siteURL(valueOf(entity,'P856'));
  const logoName=valueOf(entity,'P154');
  const logo=await commonsFile(logoName,{logo:true});
  const cik=String(valueOf(entity,'P1278')||'').trim();
  return {
   website:homepage,logo,headquarters:label(hqId)||firstHqFromArticle(intro),
   founded:foundedYear(valueOf(entity,'P571')),industry:label(industryId),
   secCIK:/^\d{1,10}$/.test(cik)?cik:null,
   wikidataURL:'https://www.wikidata.org/wiki/'+id
  };
 }catch{return {headquarters:firstHqFromArticle(intro)};}
}
function sentences(text){return String(text||'').replace(/\s+/g,' ').trim().match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map(s=>s.trim()).filter(Boolean)||[];}
async function wikiProfile(registeredName){
 const article=await loadArticle(registeredName);
 if(!article)return null;
 const parts=sentences(article.extract);
 const intro=parts.slice(0,2).join(' ').slice(0,420)||article.extract.slice(0,420);
 const actionable=parts.filter(s=>/\b(?:designs?|builds?|manufactures?|develops?|operates?|provides?|supplies?|sells?|markets?|offers?|produces?|serves?)\b/i.test(s));
 const business=actionable.slice(0,2).join(' ').slice(0,420);
 const [image,details]=await Promise.all([sourcedPhoto(article),wikidataCompany(article,article.extract||'')]);
 return {title:listingBase(registeredName),focus:article.description||'Publicly listed company',
  intro, business:business||null,source:article.content_urls.desktop.page,
  revision:article.timestamp||null,image,...details};
}
function fallback(root,ticker,name,reason){
 root.replaceChildren();
 $(root,'p','company-eyebrow','ABOUT THE COMPANY');
 $(root,'h2','company-name',name||ticker);
 $(root,'p','company-description',reason);
 $(root,'p','company-auto-notice','Company facts and photographs are shown only when their sources can be verified. The chart and research workspace remain usable.');
 urlLink(root,'Join the research team','https://jonfordy5.github.io/orca-staging/join-research.html?environment=orca-staging&ticker='+encodeURIComponent(ticker));
}
function render(root,company,ticker){
 root.replaceChildren();
 const layout=$(root,'div','company-profile-grid');
 const body=$(layout,'div','company-profile-copy');
 $(body,'p','company-eyebrow','ABOUT THE COMPANY · SOURCED OVERVIEW');
 $(body,'h2','company-name',company.title);
 $(body,'p','company-description',company.intro);
 const mission=$(body,'div','company-mission');
 $(mission,'strong',null,'Company focus');
 $(mission,'p',null,company.focus);
 $(mission,'small','company-auto-notice','Source description — not an official company mission statement.');
 const facts=$(body,'dl','company-facts');
 for(const [label,value] of [['Headquarters',company.headquarters],['Founded',company.founded],['Industry',company.industry],['Listing',ticker]]){
  if(!value)continue;
  const entry=$(facts,'div','company-fact');
  $(entry,'dt',null,label);$(entry,'dd',null,value);
 }
 const about=$(body,'div','company-business');
 $(about,'strong',null,'What they do');
 $(about,'p',null,company.business||company.intro);
 const breakdown=$(body,'section','company-business-breakdown');
 const head=$(breakdown,'div','company-business-heading');
 $(head,'h3',null,'How they do it');
 $(breakdown,'p','company-description',company.business||'Detailed operations and revenue segments still need verification in primary company filings.');
 const disclaimer=$(body,'p','company-auto-notice','This is an attributed encyclopedia overview, not an audited breakdown of products, segments or revenue. Independent agent research is shown below.');
 const side=$(layout,'aside','company-visual');
 const logoFrame=$(side,'div','company-logo-frame');
 const logoFallback=$(logoFrame,'span','company-logo-fallback',ticker);
 if(company.logo){
  const logoLink=$(logoFrame,'a');logoLink.href=company.logo.source;logoLink.target='_blank';logoLink.rel='noopener noreferrer';logoLink.setAttribute('aria-label','Company logo source and license');
  const img=$(logoLink,'img');img.src=company.logo.url;img.alt=company.title+' verified Wikimedia Commons logo';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  img.addEventListener('load',()=>{logoFallback.hidden=true;});
  img.addEventListener('error',()=>{img.hidden=true;logoFallback.hidden=false;});
  $(side,'p','company-visual-caption','Company logo · '+company.logo.license+' · linked to source');
 }else $(side,'p','company-visual-caption','Ticker mark · verified logo unavailable');
 if(company.headquarters){
  const hq=$(side,'p','company-address');
  $(hq,'strong',null,'HQ: ');hq.append(document.createTextNode(company.headquarters));
 }
 const links=$(side,'div','company-source-links');
 urlLink(links,'Official website',company.website);
 urlLink(links,'Company overview',company.source);
 urlLink(links,'Company facts',company.wikidataURL);
 if(company.secCIK)urlLink(links,'SEC filings','https://www.sec.gov/edgar/browse/?CIK='+encodeURIComponent(company.secCIK));
 $(side,'p','company-asof','External company links are included only when independently identified. Investor-relations and leadership links are omitted unless verified.');
 if(company.image){
  const picture=$(side,'figure','company-activity-photo');
  const a=$(picture,'a');a.href=company.image.source;a.target='_blank';a.rel='noopener noreferrer';
  const img=$(a,'img');img.src=company.image.url;img.loading='lazy';img.referrerPolicy='no-referrer';
  img.alt='Public Wikimedia Commons photograph related to '+company.title+': '+company.image.caption;
  const caption=$(picture,'figcaption');
  caption.append(document.createTextNode(company.image.caption+' · '+company.image.credit+' · '+company.image.license+' · '));
  urlLink(caption,'Photo source',company.image.source);
 }else{
  $(side,'p','company-asof','No clearly licensed company photograph was confirmed automatically. ORCA has not substituted an unrelated picture.');
 }
 $(side,'p','company-asof','Company overview: Wikipedia contributors (CC BY-SA). Company facts: Wikidata contributors (CC0).');
 urlLink(side,'Source article',company.source);
 if(company.revision)$(side,'p','company-asof','Source updated '+new Date(company.revision).toLocaleDateString());
}
export async function renderAutomaticCompanyProfile(root,ticker,sb){
 fallback(root,ticker,ticker,'Loading the verified company listing…');
 if(!sb)return;
 let name=ticker;
 try{
  const {data,error}=await sb.from('stocks').select('ticker,company_name').eq('ticker',ticker).maybeSingle();
  if(error)throw error;
  if(!data){fallback(root,ticker,ticker,'This stock is not registered in ORCA.');return;}
  name=String(data.company_name||ticker);
 }catch{fallback(root,ticker,name,'Company listing is temporarily unavailable.');return;}
 try{
  let info=cache.get(ticker);
  if(!info){info=await wikiProfile(name);if(info)cache.set(ticker,info);}
  if(info)render(root,info,ticker);
  else fallback(root,ticker,name,'A matching source-backed company overview is not yet available.');
 }catch{fallback(root,ticker,name,'Public company data could not be loaded; source-backed details will appear when available.');}
}
