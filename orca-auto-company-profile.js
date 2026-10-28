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
// Optional free reference facts are generated into tiny static shard files by GitHub Actions.
// Missing shard = quietly continue using public Wikipedia/Wikidata references.
const referenceCache=new Map();
async function referenceFacts(ticker){
 const letter=/^[A-Z]/.test(ticker)?ticker[0]:'0';
 if(!referenceCache.has(letter)){
  referenceCache.set(letter,(async()=>{
   try{
    const path='./data/company-profile-index/'+letter+'.json';
    const r=await fetch(path,{cache:'force-cache'});
    if(!r.ok)return {};
    const json=await r.json();
    return json&&typeof json==='object'&&!Array.isArray(json)?json:{};
   }catch{return {};}
  })());
 }
 const all=await referenceCache.get(letter);
 return all[ticker]||null;
}
function mergeReference(company,facts){
 if(!facts)return company;
 const location=[facts.city,facts.state,facts.country].filter(Boolean).join(', ');
 // Public encyclopedia links remain source-attributed; optional MIT source facts
 // complement only missing fields; never override the verified company identity.
 return {...company,
  headquarters:company.headquarters||location||null,
  industry:company.industry||facts.industry||facts.sector||null,
  website:company.website||siteURL(facts.website)||null,
  listing:company.listing||facts.exchange||null,
  referenceUsed:true
 };
}
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
// The ONE layout for every ORCA stock. All profile inputs are company-specific data.
// Layout, section headings, typography classes and photo placement live only here.
export function renderUnifiedCompanyProfile(root,ticker,profile={}){
 root.replaceChildren();
 const name=String(profile.name||ticker);
 const description=String(profile.description||'A verified company overview is not available yet.');
 const missionText=String(profile.mission||'Official company mission or focus has not yet been verified.');
 const operations=String(profile.operations||'An independently sourced description of this company’s activities is not yet available.');
 const lines=Array.isArray(profile.businessLines)?profile.businessLines:[];
 const layout=$(root,'div','company-profile-grid');
 const body=$(layout,'div','company-profile-copy');
 $(body,'p','company-eyebrow',profile.eyebrow||'ABOUT THE COMPANY');
 $(body,'h2','company-name',name);
 $(body,'p','company-description',description);
 const mission=$(body,'div','company-mission');
 $(mission,'strong',null,profile.missionHeading||'Mission');
 $(mission,'p',null,missionText);
 if(profile.missionNote)$(mission,'small','company-auto-notice',profile.missionNote);
 const facts=$(body,'dl','company-facts');
 for(const [title,value] of [
  ['Headquarters',profile.headquarters],
  ['Founded',profile.founded],
  ['Founder & CEO',profile.founderCEO],
  ['Industry',profile.industry],
  ['Listing',profile.listing||ticker]
 ]){
  if(!value)continue;
  const entry=$(facts,'div','company-fact');
  $(entry,'dt',null,title);$(entry,'dd',null,String(value));
 }
 const what=$(body,'div','company-business');
 $(what,'strong',null,'What they do');
 $(what,'p',null,operations);
 const breakdown=$(body,'section','company-business-breakdown');
 const heading=$(breakdown,'div','company-business-heading');
 $(heading,'h3',null,'How they do it');
 if(profile.businessSource)urlLink(heading,profile.businessSourceLabel||'Company filings',profile.businessSource);
 if(lines.length){
  for(const item of lines){
   if(!item?.name||!item?.detail)continue;
   const block=$(breakdown,'div','company-business-line');
   $(block,'h4',null,String(item.name));
   $(block,'p',null,String(item.detail));
  }
 }else $(breakdown,'p','company-description',profile.how||'Detailed operating segments have not yet been verified.');
 if(profile.investorFocus){
  const focus=$(body,'section','company-investor-focus');
  $(focus,'h3',null,profile.investorFocusHeading||'What investors watch');
  $(focus,'p',null,String(profile.investorFocus));
 }
 if(profile.notice)$(body,'p','company-auto-notice',profile.notice);
 const side=$(layout,'aside','company-visual');
 const frame=$(side,'div','company-logo-frame');
 const fallback=$(frame,'span','company-logo-fallback',ticker);
 const logo=profile.logo;
 if(logo?.url){
  let mediaHost=frame;
  if(logo.source){
   const link=$(frame,'a');
   const sourceURL=safeURL(logo.source);
   if(sourceURL){
    link.href=sourceURL;link.target='_blank';link.rel='noopener noreferrer';
    link.setAttribute('aria-label','Company logo source and credit');
    mediaHost=link;
   }
  }
  const img=$(mediaHost,'img');
  img.src=logo.url;
  img.alt=logo.alt||name+' company logo';
  img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  img.addEventListener('load',()=>{fallback.hidden=true;});
  img.addEventListener('error',()=>{img.hidden=true;fallback.hidden=false;});
  $(side,'p','company-visual-caption',logo.caption||'Company logo · linked to source when verified');
 }else $(side,'p','company-visual-caption','Company logo not verified · ticker shown instead');
 if(profile.headquartersAddress||profile.headquarters){
  const hq=$(side,'p','company-address');
  $(hq,'strong',null,'HQ: ');
  hq.append(document.createTextNode(String(profile.headquartersAddress||profile.headquarters)));
 }
 const links=$(side,'div','company-source-links');
 for(const link of profile.links||[]){
  if(link?.label&&link.url)urlLink(links,String(link.label),link.url);
 }
 if(!links.childElementCount)$(side,'p','company-asof','Verified company links are not yet available.');
 if(profile.sourceNote)$(side,'p','company-asof',profile.sourceNote);
 const photo=profile.photo;
 if(photo?.url&&photo?.source){
  const picture=$(side,'figure','company-activity-photo');
  const link=$(picture,'a');
  const origin=safeURL(photo.source);
  if(origin){link.href=origin;link.target='_blank';link.rel='noopener noreferrer';}
  const img=$(link,'img');
  img.src=photo.url;img.alt=photo.alt||('Company-related image: '+(photo.caption||name));
  img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';
  const missing=$(link,'span','company-photo-unavailable','Open the original company photograph at its source');
  missing.hidden=true;
  img.addEventListener('error',()=>{img.hidden=true;missing.hidden=false;});
  const credit=$(picture,'figcaption');
  credit.append(document.createTextNode([photo.caption,photo.credit,photo.license].filter(Boolean).join(' · ')+' · '));
  urlLink(credit,'Photo source',photo.source);
 }else $(side,'p','company-asof','No verified source-linked company photograph is currently available.');
 if(profile.sourceUpdated){
  const date=new Date(profile.sourceUpdated);
  if(!Number.isNaN(date.getTime()))$(side,'p','company-asof','Source updated '+date.toLocaleDateString());
 }
}
function safeURL(url){
 try{
  const parsed=new URL(url);
  return parsed.protocol==='https:'?parsed.href:null;
 }catch{return null;}
}
function fallback(root,ticker,name,reason){
 renderUnifiedCompanyProfile(root,ticker,{
  name:name||ticker,description:reason,missionHeading:'Company focus',
  missionNote:'Not an official mission statement until independently verified.',
  operations:'Company operations pending independent verification.',
  how:'The research board can still be used while verified operating details are collected.',
  links:[{label:'Join the research team',url:'https://jonfordy5.github.io/orca-staging/join-research.html?environment=orca-staging&ticker='+encodeURIComponent(ticker)}],
  notice:'No company facts or images have been invented to fill missing fields.'
 });
}
function render(root,company,ticker){
 renderUnifiedCompanyProfile(root,ticker,{
  name:company.title,description:company.intro,
  eyebrow:'ABOUT THE COMPANY · SOURCED OVERVIEW',
  missionHeading:'Company focus',mission:company.focus,
  missionNote:'Publicly sourced company description; not a verified official mission statement.',
  headquarters:company.headquarters,founded:company.founded,industry:company.industry,
  listing:ticker,operations:company.business||company.intro,
  how:company.business||'Detailed operating segments still need verification in primary company filings.',
  businessSource:company.source,businessSourceLabel:'Company overview source',
  investorFocus:'Company-specific investment catalysts and financial results require independent research using filings and dated sources.',
  investorFocusHeading:'What investors watch',
  notice:'Source-backed encyclopedia profile, not an audited financial or business segment breakdown.',
  logo:company.logo?{...company.logo,alt:company.title+' sourced company logo',caption:'Company logo · '+company.logo.license+' · linked to source'}:null,
  photo:company.image?{...company.image,alt:'Company-related Commons photo: '+company.image.caption}:null,
  links:[
   {label:'Official website',url:company.website},
   {label:'Company overview',url:company.source},
   {label:'Company facts',url:company.wikidataURL},
   {label:'SEC filings',url:company.secCIK?'https://www.sec.gov/edgar/browse/?CIK='+encodeURIComponent(company.secCIK):null}
  ],
  sourceNote:company.referenceUsed?'Company overview: Wikipedia contributors (CC BY-SA). Company facts: Wikidata contributors (CC0); FinanceDatabase contributors (MIT).':'Company overview: Wikipedia contributors (CC BY-SA). Company facts: Wikidata contributors (CC0).',
  sourceUpdated:company.revision
 });
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
  if(!info){
   const [article,facts]=await Promise.all([wikiProfile(name),referenceFacts(ticker)]);
   info=article?mergeReference(article,facts):(facts&&facts.name?{
    title:facts.name,intro:'Publicly listed company profile. Detailed description awaits independent verification.',
    focus:[facts.sector,facts.industry].filter(Boolean).join(' · ')||'Publicly listed company',
    business:null,industry:facts.industry||facts.sector||null,
    headquarters:[facts.city,facts.state,facts.country].filter(Boolean).join(', ')||null,
    listing:facts.exchange||ticker,website:siteURL(facts.website),referenceUsed:true,
    source:'https://github.com/JerBouma/FinanceDatabase',revision:null
   }:null);
   if(info)cache.set(ticker,info);
  }
  if(info)render(root,info,ticker);
  else fallback(root,ticker,name,'A matching source-backed company overview is not yet available.');
 }catch{fallback(root,ticker,name,'Public company data could not be loaded; source-backed details will appear when available.');}
}
