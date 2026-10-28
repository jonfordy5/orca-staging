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
async function sourcedPhoto(article){
 // Resolve article lead-image filename, then independently verify Commons license/source.
 const api=new URL('https://en.wikipedia.org/w/api.php');
 for(const [k,v] of Object.entries({action:'query',format:'json',origin:'*',prop:'pageimages',piprop:'name',titles:article.title}))
  api.searchParams.set(k,v);
 let imageName=null;
 try{
  const d=await requestJson(api.href);
  imageName=Object.values(d.query?.pages||{})[0]?.pageimage||null;
 }catch{return null;}
 if(!imageName||!/\.(?:png|jpe?g|webp)$/i.test(imageName)||/(logo|icon|seal|flag|wordmark|symbol|emblem)/i.test(imageName))return null;
 const commons=new URL('https://commons.wikimedia.org/w/api.php');
 for(const [k,v] of Object.entries({action:'query',format:'json',origin:'*',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:720,titles:'File:'+imageName}))
  commons.searchParams.set(k,v);
 try{
  const d=await requestJson(commons.href);
  const page=Object.values(d.query?.pages||{})[0],i=page?.imageinfo?.[0];
  const license=i?.extmetadata?.LicenseShortName?.value;
  const url=i?.thumburl||i?.url,source=i?.descriptionurl;
  if(!licenseAllowed(license)||!url||!source)return null;
  if(!/^https:\/\/(?:upload\.wikimedia\.org|thumb\.wikimedia\.org)\//i.test(url))return null;
  if(!/^https:\/\/commons\.wikimedia\.org\//i.test(source))return null;
  return {url,source,license,credit:artistText(i.extmetadata?.Artist?.value)||'Wikimedia Commons contributor',
    caption:imageName.replace(/_/g,' ').replace(/\.[^.]+$/,'')};
 }catch{return null;}
}
function sentences(text){return String(text||'').replace(/\s+/g,' ').trim().match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map(s=>s.trim()).filter(Boolean)||[];}
async function wikiProfile(registeredName){
 const article=await loadArticle(registeredName);
 if(!article)return null;
 const parts=sentences(article.extract);
 const intro=parts.slice(0,2).join(' ').slice(0,420)||article.extract.slice(0,420);
 const actionable=parts.filter(s=>/\b(?:designs?|builds?|manufactures?|develops?|operates?|provides?|supplies?|sells?|markets?|offers?|produces?|serves?)\b/i.test(s));
 const business=actionable.slice(0,2).join(' ').slice(0,420);
 const image=await sourcedPhoto(article);
 return {title:registeredName,focus:article.description||'Publicly listed company',
  intro, business:business||null,source:article.content_urls.desktop.page,
  revision:article.timestamp||null,image};
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
 const facts=$(body,'dl','company-facts'),entry=$(facts,'div','company-fact');
 $(entry,'dt',null,'LISTING');$(entry,'dd',null,ticker);
 const about=$(body,'div','company-business');
 $(about,'strong',null,'What they do');
 $(about,'p',null,company.business||company.intro);
 const breakdown=$(body,'section','company-business-breakdown');
 const head=$(breakdown,'div','company-business-heading');
 $(head,'h3',null,'How they do it');
 $(breakdown,'p','company-description',company.business||'Detailed operations and revenue segments still need verification in primary company filings.');
 const disclaimer=$(body,'p','company-auto-notice','This is an attributed encyclopedia overview, not an audited breakdown of products, segments or revenue. Independent agent research is shown below.');
 const side=$(layout,'aside','company-visual');
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
 $(side,'p','company-asof','Company overview from Wikipedia contributors (CC BY-SA); check the dated source for accuracy.');
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
