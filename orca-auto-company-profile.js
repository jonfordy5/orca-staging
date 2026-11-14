import { ORCA_LOGO_DEV_PUBLISHABLE_KEY } from './orca-staging-config.js';
import { getCompanySize, formatCompanyRevenue } from './orca-company-size.js';
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
  // Wikidata P5531 is the SEC Central Index Key (CIK); P1278 is a different identifier.
  const cik=String(valueOf(entity,'P5531')||'').trim();
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
// Public, MIT-licensed company records are our primary business-description data.
// Wikipedia enriches the record with independent context, not the other way around.
function mergeReference(company,facts){
 if(!facts?.name)return company;
 const summary=String(facts.summary||'').trim();
 const parts=sentences(summary);
 const location=[facts.city,facts.state,facts.country].filter(Boolean).join(', ');
 const focus=parts.slice(0,2).join(' ');
 const work=parts.slice(0,4).join(' ');
 const how=parts.slice(2,7).join(' ');
 return {...company,
  title:facts.name,
  intro:focus||company.intro,
  focus:focus||company.focus,
  business:work||company.business,
  how:how||null,
  headquarters:location||company.headquarters||null,
  industry:facts.industry||facts.sector||company.industry||null,
  website:company.website||siteURL(facts.website)||null,
  listing:facts.exchange||company.listing||null,
  referenceUsed:true,
  referenceSummaryAvailable:Boolean(summary)
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
// Keep source-backed meaning unchanged while avoiding weak pronoun openings.
// Runs at rendering time, so cached descriptions are polished without AI calls.
export function polishCompanySentenceOpenings(text,companyName,ticker=''){
 const raw=String(text||'');
 const shortName={
  AMZN:'Amazon',F:'Ford',WEN:'Wendy’s',META:'Meta',MCD:'McDonald’s'
 }[ticker]||String(companyName||ticker).replace(/\s+(?:Inc\.?|Incorporated|Corporation|Corp\.?|Company|Co\.?|Ltd\.?|Limited|PLC)\b.*$/i,'').trim()||ticker;
 const possessive=/(?:['’]s)$/i.test(shortName)?shortName:shortName+'’s';
 return raw.replace(/(^|[.!?]\s+)(It['’]s|Its|It)(?=\s|$)/g,(_,prefix,pronoun)=>{
  const replacement=/^It['’]s$/.test(pronoun)?shortName+' is':
   pronoun==='Its'?possessive:shortName;
  return prefix+replacement;
 });
}
// The ONE layout for every ORCA stock. All profile inputs are company-specific data.
// Layout, section headings, typography classes and photo placement live only here.
export function renderUnifiedCompanyProfile(root,ticker,profile={}){
 root.replaceChildren();
 const name=String(profile.name||ticker);
 const polish=value=>polishCompanySentenceOpenings(value,name,ticker);
 const description=polish(profile.description||'A verified company overview is not available yet.');
 const missionText=polish(profile.mission||'Official company mission or focus has not yet been verified.');
 const operations=polish(profile.operations||'An independently sourced description of this company’s activities is not yet available.');
 const lines=Array.isArray(profile.businessLines)?profile.businessLines:[];
 root.classList.add('company-codex');
 const masthead=$(root,'div','codex-masthead');
 $(masthead,'span','codex-overline','ORCA  /  COMPANY INTELLIGENCE');
 $(masthead,'h2','codex-title','The Company Codex');
 $(masthead,'p','codex-intro','The business behind the ticker — what it does, where revenue comes from, and the evidence worth investigating.');
 const layout=$(root,'div','company-profile-grid');
 const body=$(layout,'div','company-profile-copy');
 $(body,'p','company-eyebrow',profile.eyebrow||'ABOUT THE COMPANY');
 $(body,'h3','company-name',name);
 $(body,'p','company-description',description);
 const highlights=$(body,'dl','codex-highlights');
 for(const [label,value] of [['Industry',profile.industry],['Headquarters',profile.headquarters],['Founded',profile.founded],['Listing',profile.listing||ticker]]){
  if(!value)continue;
  const item=$(highlights,'div','codex-highlight');
  $(item,'dt',null,label);$(item,'dd',null,String(value));
 }
 const insightGrid=$(body,'div','codex-insight-grid');
 const makeInsight=(number,title)=>{
  const panel=$(insightGrid,'section','codex-insight');
  $(panel,'span','codex-panel-kicker',number);
  $(panel,'h4',null,title);
  return panel;
 };
 const revenue=makeInsight('01  /  REVENUE ENGINE','How the business makes money');
 $(revenue,'p',null,operations);
 const method=profile.how?polish(profile.how).trim():'';
 if(method&&method!==operations)$(revenue,'p','codex-method',method);
 if(profile.businessSource)urlLink(revenue,profile.businessSourceLabel||'Business model source',profile.businessSource);
 const capabilities=makeInsight('02  /  COMPANY CAPABILITIES','Strengths & advantages');
 const strengths=Array.isArray(profile.strengths)?profile.strengths.filter(x=>typeof x==='string'&&x.trim()):[];
 if(strengths.length){
  const list=$(capabilities,'ul','codex-list');
  for(const strength of strengths.slice(0,4))$(list,'li',null,polish(strength));
  $(capabilities,'small','codex-evidence-caution','Business capabilities are not a guarantee of competitive or investment performance.');
 }else $(capabilities,'p',null,'Specific competitive advantages are not independently established in this profile. Check company filings and current research.');
 const drivers=makeInsight('03  /  THE WATCHTOWER','What investors watch');
 $(drivers,'p',null,polish(profile.investorFocus||'Company-specific catalysts and financial results require independent research using recent filings and dated sources.'));
 const risks=makeInsight('04  /  VULNERABILITIES','Risks & unknowns');
 const reportedRisks=Array.isArray(profile.risks)?profile.risks.filter(x=>typeof x==='string'&&x.trim()):[];
 if(reportedRisks.length){
  const list=$(risks,'ul','codex-list');
  for(const risk of reportedRisks.slice(0,4))$(list,'li',null,polish(risk));
 }else $(risks,'p',null,'Specific company risks are not yet established from the available profile. Review current company disclosures before drawing a conclusion.');
 if(profile.businessSource)urlLink(risks,'Read source context',profile.businessSource);
 const dossier=$(body,'details','codex-dossier');
 $(dossier,'summary',null,'Explore the full company dossier');
 const dossierBody=$(dossier,'div','codex-dossier-body');
 $(dossierBody,'p','codex-dossier-intro','Original sourced narrative, company facts and reported size data are preserved here.');
 const mission=$(dossierBody,'div','company-mission');
 $(mission,'strong',null,profile.missionHeading||'Mission');
 $(mission,'p',null,missionText);
 if(profile.missionNote)$(mission,'small','company-auto-notice',profile.missionNote);
 const facts=$(dossierBody,'dl','company-facts');
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
 const what=$(dossierBody,'div','company-business');
 $(what,'strong',null,'The mission and the method');
 $(what,'p',null,operations);
 if(profile.how&&polish(profile.how).trim()!==operations)$(what,'p','company-business-method',polish(profile.how));
 for(const item of lines){
  if(!item?.name||!item?.detail)continue;
  const block=$(what,'div','company-business-line');
  $(block,'h4',null,String(item.name));$(block,'p',null,polish(item.detail));
 }
 const breakdown=$(dossierBody,'section','company-business-breakdown');
 const heading=$(breakdown,'div','company-business-heading');
 $(heading,'h3',null,'Company size and impact');
 const list=$(breakdown,'ul','company-impact-list');
 const metrics=profile.metrics||{};
 for(const [label,entry,fmt] of [
  ['Employees',metrics.employees,v=>new Intl.NumberFormat('en-US').format(v.value)],
  ['Annual revenue',metrics.revenue,formatCompanyRevenue]
 ]){
  const item=$(list,'li','company-impact-item');
  $(item,'strong',null,label+(entry?.year?' ('+entry.year+')':'')+': ');
  item.append(document.createTextNode(entry?fmt(entry)||'Not available':'Not available in reference data'));
  if(entry?.source)urlLink(item,'Source',entry.source);
 }
 $(breakdown,'p','company-impact-note','Figures show their reported periods and linked sources. Annual revenue means sales, not net profit.');
 if(profile.notice)$(dossierBody,'p','company-auto-notice',profile.notice);
 const side=$(layout,'aside','company-visual');
 $(side,'p','codex-photo-kicker','THE COMPANY IN FOCUS');
 const frame=$(side,'div','company-logo-frame');
 const fallback=$(frame,'span','company-logo-fallback',ticker);
 const fallbackLogo=profile.logo||null;
 const logoDevUrl=ticker==='RKLB'?null:logoDevImage(ticker);
 const logo=logoDevUrl?{url:logoDevUrl,alt:name+' company logo',caption:'Company logo provided by Logo.dev'}:fallbackLogo;
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
  img.addEventListener('error',()=>{
   if(logoDevUrl&&fallbackLogo?.url){
    img.src=fallbackLogo.url;
    img.alt=fallbackLogo.alt||name+' sourced company logo';
    img.onerror=()=>{img.hidden=true;fallback.hidden=false;};
   }else{img.hidden=true;fallback.hidden=false;}
  });
  $(side,'p','company-visual-caption',logo.caption||'Company logo · linked to source when verified');
 }else $(side,'p','company-visual-caption','Company logo not verified · ticker shown instead');
 if(logoDevUrl){
  const attribution=$(side,'div','company-source-links');
  urlLink(attribution,'Logos provided by Logo.dev','https://logo.dev');
 }
 if(profile.headquartersAddress||profile.headquarters){
  const hq=$(side,'p','company-address');
  $(hq,'strong',null,'HQ: ');
  hq.append(document.createTextNode(String(profile.headquartersAddress||profile.headquarters)));
 }
 const sources=$(root,'section','codex-source-footer');
 $(sources,'h3',null,'Sources & verification');
 $(sources,'p','codex-source-note','Company descriptions may reflect earlier reporting periods. Open original sources to confirm facts, operations and risks.');
 const links=$(sources,'div','company-source-links');
 if(profile.businessSource)urlLink(links,profile.businessSourceLabel||'Business description source',profile.businessSource);
 for(const link of profile.links||[]){
  if(link?.label&&link.url)urlLink(links,String(link.label),link.url);
 }
 if(!links.childElementCount)$(sources,'p','company-asof','Verified company links are not yet available.');
 if(profile.sourceNote)$(sources,'p','company-asof',profile.sourceNote);
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
  side.insertBefore(picture,side.firstChild.nextSibling);
 }else{
  const art=$(side,'div','codex-photo-fallback');
  $(art,'span',null,'ORCA  /  COMPANY FILE');
  $(art,'strong',null,ticker);
  $(art,'small',null,'No verified company photograph is currently available');
  side.insertBefore(art,side.firstChild.nextSibling);
 }
 if(profile.sourceUpdated){
  const date=new Date(profile.sourceUpdated);
  if(!Number.isNaN(date.getTime()))$(sources,'p','company-asof','Source updated '+date.toLocaleDateString());
 }
 // The four chapters replace the old separate dossier; original sourced nodes
 // are reorganized, never discarded or sent to a billable model on page load.
 activateInteractiveCodex(root,ticker,profile);
}
function activateInteractiveCodex(root,ticker,profile){
 const grid=root.querySelector('.codex-insight-grid'),old=[...grid.children];
 const dossier=root.querySelector('.codex-dossier');
 if(old.length!==4||!dossier)return;
 const source=dossier.querySelector('.codex-dossier-body');
 const original={
  mission:source.querySelector('.company-mission'),
  facts:source.querySelector('.company-facts'),
  business:source.querySelector('.company-business'),
  metrics:source.querySelector('.company-business-breakdown')
 };
 const content={
  revenue:document.createElement('div'),capabilities:document.createElement('div'),
  watchtower:document.createElement('div'),vulnerabilities:document.createElement('div')
 };
 for(const item of [original.business,original.metrics])if(item)content.revenue.append(item);
 $(content.revenue,'small','codex-evidence-caution','Annual revenue means sales, not cash flow. Cash-flow figures are shown only when independently sourced.');
 if(profile.businessSource)urlLink(content.revenue,'Original business model source',profile.businessSource);
 for(const item of [original.mission,original.facts])if(item)content.capabilities.append(item);
 for(const item of [...old[1].querySelectorAll('p,ul,small')])content.capabilities.append(item);
 if(profile.businessSource)urlLink(content.capabilities,'Company disclosure source',profile.businessSource);
 const unavailable='Current source-checked monthly intelligence has not yet been published.';
 const summarize=(value,max=170)=>{
  const t=String(value||'').replace(/\s+/g,' ').trim();
  if(t.length<=max)return t;
  const n=t.slice(0,max).lastIndexOf(' ');
  return t.slice(0,n>65?n:max).replace(/[ ,;]+$/,'')+'…';
 };
 const titles=[
  ['revenue','01 / REVENUE ENGINE CASH FLOW','How the business makes money',profile.operations],
  ['capabilities','02 / COMPANY CAPABILITIES','Strengths & advantages',
   Array.isArray(profile.strengths)&&profile.strengths.length?profile.strengths[0]:
   'Company capabilities and verified operating facts, with evidence gaps clearly marked.'],
  ['watchtower','03 / THE WATCHTOWER','What investors watch',unavailable],
  ['vulnerabilities','04 / VULNERABILITIES','Risks & unknowns',unavailable]
 ];
 grid.replaceChildren();
 dossier.remove();
 const detail=$(grid.parentElement,'section','codex-chapter-detail');
 detail.id='codex-chapter-detail';
 detail.hidden=true;
 detail.setAttribute('role','region');
 detail.setAttribute('aria-label','Selected company intelligence chapter');
 const tabs=new Map(),monthly=new Map();
 let selected='';
 const refresh=()=>{
  detail.replaceChildren();
  detail.hidden=!selected;
  for(const [key,tab] of tabs){
   const active=key===selected;
   tab.button.setAttribute('aria-expanded',String(active));
   tab.card.classList.toggle('codex-insight-selected',active);
   tab.hint.textContent=active?'Close chapter −':'Open chapter ↗';
  }
  if(!selected)return;
  const current=tabs.get(selected);
  $(detail,'span','codex-panel-kicker',current.kicker);
  $(detail,'h4','codex-chapter-heading',current.title);
  if(selected==='watchtower'||selected==='vulnerabilities'){
   const record=monthly.get(selected);
   if(!record){
    $(detail,'p','codex-evidence-unavailable',unavailable);
    $(detail,'small','codex-evidence-caution','No speculative rating or unsupported market claim is substituted for missing evidence.');
    return;
   }
   const paragraphs=Array.isArray(record.analysis)?record.analysis:
    String(record.analysis||'').split(/\n\s*\n/);
   for(const text of paragraphs.filter(t=>typeof t==='string'&&t.trim()).slice(0,6))
    $(detail,'p','codex-analysis-paragraph',text.trim());
   if(Array.isArray(record.watch_items)&&record.watch_items.length){
    $(detail,'h5',null,'Specific information to watch');
    const ul=$(detail,'ul','codex-chapter-list');
    for(const item of record.watch_items.slice(0,4))if(typeof item==='string')$(ul,'li',null,item);
   }
   const when=new Date(record.generated_at);
   const time=Number.isNaN(when.getTime())?'Date unavailable':when.toLocaleDateString();
   $(detail,'small','codex-chapter-meta','Updated '+time+' · '+Math.max(0,Number(record.findings_count)||0)+' findings reviewed');
   const urls=Array.isArray(record.source_urls)?record.source_urls:[];
   if(urls.length){
    const evidence=$(detail,'details','codex-chapter-evidence');
    $(evidence,'summary',null,'Supporting evidence ('+urls.length+')');
    urls.slice(0,12).forEach((url,i)=>urlLink(evidence,'Original source '+(i+1),url));
   }
   if(Array.isArray(record.previous_versions)&&record.previous_versions.length){
    const archive=$(detail,'details','codex-chapter-archive');
    $(archive,'summary',null,'Previous monthly summaries ('+record.previous_versions.length+')');
    for(const edition of record.previous_versions.slice(0,6)){
     const section=$(archive,'div','codex-chapter-past');
     const at=new Date(edition.generated_at);
     $(section,'small',null,Number.isNaN(at.getTime())?'Older analysis':at.toLocaleDateString());
     $(section,'p',null,String(edition.summary||''));
    }
   }
  }else detail.append(content[selected]);
 };
 for(const [key,kicker,title,preview] of titles){
  const card=$(grid,'section','codex-insight');
  card.dataset.chapter=key;
  const button=$(card,'button','codex-insight-trigger');
  button.type='button';
  button.setAttribute('aria-controls','codex-chapter-detail');
  button.setAttribute('aria-expanded','false');
  $(button,'span','codex-panel-kicker',kicker);
  $(button,'span','codex-insight-title',title);
  const teaser=$(button,'span','codex-insight-preview',summarize(preview||unavailable));
  const hint=$(button,'span','codex-insight-open','Open chapter ↗');
  button.addEventListener('click',()=>{
   selected=selected===key?'':key;
   refresh();
  });
  tabs.set(key,{card,button,teaser,hint,kicker,title});
 }
 root.dataset.codexTicker=ticker;
 root.applyCodexIntelligence=(rows)=>{
  if(root.dataset.codexTicker!==ticker)return;
  for(const key of ['watchtower','vulnerabilities']){
   const versions=(Array.isArray(rows)?rows:[])
    .filter(row=>row?.chapter===key&&row.status==='ready')
    .sort((a,b)=>Date.parse(b.generated_at)-Date.parse(a.generated_at));
   const current=versions[0]?{...versions[0],previous_versions:versions.slice(1)}:null;
   monthly.set(key,current);
   const tab=tabs.get(key);
   tab.teaser.textContent=current?summarize(current.summary,190):unavailable;
   let meta=tab.card.querySelector('.codex-insight-meta');
   if(current){
    if(!meta)meta=$(tab.card,'small','codex-insight-meta');
    const updated=new Date(current.generated_at);
    meta.textContent=(Number.isNaN(updated.getTime())?'Undated':updated.toLocaleDateString())+
     ' · '+Math.max(0,Number(current.findings_count)||0)+' findings';
   }else meta?.remove();
  }
  if(selected==='watchtower'||selected==='vulnerabilities')refresh();
 };
}
function logoDevImage(ticker){
 const key=String(ORCA_LOGO_DEV_PUBLISHABLE_KEY||'').trim();
 if(!/^pk_[A-Za-z0-9_-]{8,}$/.test(key)||!/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(ticker))return null;
 return 'https://img.logo.dev/ticker/'+encodeURIComponent(ticker)+'?token='+encodeURIComponent(key)+'&size=256&format=png&fallback=404';
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
function shortCompanyCopy(value,max=260){
 const source=String(value||'').replace(/\s+/g,' ').trim();
 if(!source)return '';
 const sentences=source.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[];
 let text=sentences.slice(0,2).join(' ').trim();
 if(text.length<=max)return text;
 const first=sentences[0]?.trim()||text;
 if(first.length<=max)return first;
 const part=first.slice(0,max-1);
 const cut=part.lastIndexOf(' ');
 return part.slice(0,cut>100?cut:max-1).replace(/[\s,;:]+$/,'')+'…';
}
function distinctCompanyDetail(value,other,max=290){
 const v=shortCompanyCopy(value,max).trim();
 if(!v)return null;
 const norm=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 if(norm(v)===norm(other))return null;
 return v;
}
function render(root,company,ticker){
 const editorial=company.structured||null;
 const intro=editorial?.intro||shortCompanyCopy(company.intro,290);
 const focus=editorial?.focus||distinctCompanyDetail(company.focus,intro,210);
 const what=editorial?.business||distinctCompanyDetail(company.business,intro,280);
 const how=editorial?.how||distinctCompanyDetail(company.how,what||intro,290);
 const photo=editorial?.photo||company.image||null;
 renderUnifiedCompanyProfile(root,ticker,{
  name:company.title,description:intro,
  eyebrow:'ABOUT THE COMPANY · SOURCED OVERVIEW',
  missionHeading:'Business focus',mission:focus||'Company operating focus has not yet been independently documented.',
  missionNote:editorial?.aiPending?'This description is pending generation; company identity and imagery are separately sourced.':editorial?.aiGenerated?'AI-organized company description based on cited official sources; may require updating.':editorial?'Business summary extracted from the attributed reference data; not an official mission statement.':company.referenceUsed?'From public company-reference data; not an official mission statement.':'Publicly sourced business overview; not an official mission statement.',
  headquarters:editorial?.headquarters||company.headquarters,founded:company.founded,industry:editorial?.industry||company.industry,
  listing:ticker,metrics:company.metrics||null,operations:what||'Additional product and service details are not yet verified.',
  how:how||'Sales channels and operating methods are not yet verified from source material.',
  businessSource:editorial?.aiPending?null:editorial?.businessSource||(company.referenceUsed?'https://github.com/JerBouma/FinanceDatabase':company.source),
  businessSourceLabel:company.referenceUsed?'Business description data':'Company overview source',
  investorFocus:'Company-specific investment catalysts and financial results require independent research using filings and dated sources.',
  investorFocusHeading:'What investors watch',
  notice:editorial?.aiPending?'Company research will fill this section automatically when generation is available.':editorial?.aiGenerated?'Company information summarized from official and reference sources.':company.referenceUsed?'Free reference descriptions can be historical. Verify current products, segments and finances against the latest company filings.':'Encyclopedia overview only; the new free reference record was not available for this company.',
  logo:company.logo?{...company.logo,alt:company.title+' sourced company logo',caption:'Company logo · '+company.logo.license+' · linked to source'}:null,
  photo:photo?{...photo,alt:'Company-related photo: '+photo.caption}:null,
  links:[
   {label:'Official website',url:company.website},
   {label:'Company overview',url:company.source},
   {label:'Free company dataset',url:company.referenceUsed?'https://github.com/JerBouma/FinanceDatabase':null},
   {label:'Company facts',url:company.wikidataURL},
   {label:'SEC filings',url:company.secCIK?'https://www.sec.gov/edgar/browse/?CIK='+encodeURIComponent(company.secCIK):null}
  ],
  sourceNote:company.referenceUsed?'Business description and industry: FinanceDatabase (MIT); supporting context: Wikipedia (CC BY-SA), Wikidata (CC0).':'Wikipedia (CC BY-SA) and Wikidata (CC0). Free company reference data was not loaded.',
  sourceUpdated:company.revision
 });
}
async function loadOrcaAiDescription(root,ticker,sb,base){
 if(ticker==='RKLB')return;
 const endpoint='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-auto-ai-profile?ticker='+encodeURIComponent(ticker);
 const usable=d=>d?.state==='ready'&&d?.content&&['overview','business_focus','what_they_do','how_they_do_it'].every(k=>typeof d.content[k]==='string'&&d.content[k].length>20);
 const display=d=>{
  if(!root.isConnected)return;
  if(usable(d)){
   const c=d.content;
   render(root,{...base,structured:{...(base.structured||{}),intro:c.overview,focus:c.business_focus,business:c.what_they_do,how:c.how_they_do_it,businessSource:Array.isArray(d.source_urls)?d.source_urls[0]||base.source:base.source,aiGenerated:true}},ticker);
   return;
  }
  const pendingText=d?.state==='building'?'Company description is being prepared.':d?.state==='failed'?'Automated description did not pass verification; existing sourced company information remains available.':d?.limit_reached?'Daily profile generation capacity has been reached; cached company information remains available.':d?.refresh_due?'A source-backed profile update is pending; existing information remains available.':'A verified company description is not yet available.';
  // Keep the source-backed reference profile on display while generation is pending.
  render(root,base,ticker);
 };
 let data=null;
 try{const r=await fetch(endpoint,{cache:'no-store'});if(r.ok)data=await r.json();}catch{}
 if(usable(data)){
  display(data);
  if(!data.refresh_due)return;
  try{
   const {data:{session}}=await sb.auth.getSession();
   if(!session?.access_token)return;
   const config=await (await import('./orca-staging-config.js')).selectSupabaseConfig();
   const response=await fetch(endpoint,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}'});
   if(response.ok){const fresh=await response.json();if(usable(fresh))display(fresh);}
  }catch{/* Keep the last good company description; never automatically retry. */}
  return;
 }
 if(data?.state==='building'||(data?.state==='failed'&&!data?.refresh_due)||data?.limit_reached){return;}
 if(data?.state!=='missing'&&!data?.refresh_due)return;
 try{
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token){display(data);return;}
  // The existing sourced profile remains visible.
  const config=await (await import('./orca-staging-config.js')).selectSupabaseConfig();
  const response=await fetch(endpoint,{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}'});
  if(response.ok){const output=await response.json();if(usable(output))display(output);}
 }catch{/* Keep the source-backed company profile. */}
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
   const [facts,article,apiProfile]=await Promise.all([
    referenceFacts(ticker),wikiProfile(name),
    requestJson('https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-company-profile?schema=2&ticker='+encodeURIComponent(ticker)).catch(()=>null)
   ]);
   info=article?mergeReference(article,facts):(facts&&facts.name?{
    title:facts.name,intro:sentences(facts.summary).slice(0,2).join(' ')||'Publicly listed company profile. Detailed description awaits verification.',
    focus:sentences(facts.summary).slice(0,2).join(' ')||[facts.sector,facts.industry].filter(Boolean).join(' · ')||'Publicly listed company',
    business:sentences(facts.summary).slice(0,4).join(' ')||null,
    how:sentences(facts.summary).slice(2,7).join(' ')||null,
    industry:facts.industry||facts.sector||null,
    headquarters:[facts.city,facts.state,facts.country].filter(Boolean).join(', ')||null,
    listing:facts.exchange||ticker,website:siteURL(facts.website),referenceUsed:true,
    source:'https://github.com/JerBouma/FinanceDatabase',revision:null
   }:null);
   if(apiProfile&&apiProfile.ticker===ticker&&normalize(apiProfile.company_name)===normalize(name)){
    if(!info)info={title:apiProfile.company_name,intro:apiProfile.description||'Source-backed overview unavailable.',source:apiProfile.source_url,referenceUsed:true};
    const c=apiProfile.profile_content?.version>=1?apiProfile.profile_content:null;
    const p=c?.photo;
    const photo=p&&typeof p.url==='string'&&typeof p.source==='string'&&/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(p.url)&&p.source.startsWith('https://commons.wikimedia.org/')?p:null;
    info={...info,
      industry:apiProfile.industry||info.industry||null,
      headquarters:apiProfile.headquarters||info.headquarters||null,
      website:info.website||siteURL(apiProfile.website)||null,
      structured:c?{
       intro:shortCompanyCopy(c.overview||apiProfile.description||info.intro,370),
       focus:c.focus&&c.focus!==c.what?shortCompanyCopy(c.focus,230):null,
       business:c.what?shortCompanyCopy(c.what,290):null,
       how:c.how?shortCompanyCopy(c.how,330):null,
       photo,industry:apiProfile.industry,headquarters:apiProfile.headquarters,
       businessSource:apiProfile.source_url
      }:null
    };
   }
   if(info)cache.set(ticker,info);
  }
  if(info){
   info.metrics=await getCompanySize(ticker,name,info).catch(()=>({}));
   render(root,info,ticker);
   void loadOrcaAiDescription(root,ticker,sb,info);
  }
  else {
   fallback(root,ticker,name,'Company overview is being prepared from available sources.');
   void loadOrcaAiDescription(root,ticker,sb,{title:name,intro:'Company overview is being prepared.',source:null,structured:null});
  }
 }catch{fallback(root,ticker,name,'Public company data could not be loaded; source-backed details will appear when available.');}
}
