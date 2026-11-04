import {createClient} from "npm:@supabase/supabase-js@2.57.0";
// ORCA staging: opt-in Unsplash photo selection, capped to three NEW photos per user click.
// Photos remain on Unsplash's CDN; milestone research and original sources are unchanged.
const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const origin="https://jonfordy5.github.io";
const cors={"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":origin,
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-supabase-api-version",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
const validTicker=(v:string)=>/^[A-Z][A-Z0-9.]{0,9}$/.test(v);
function urlAllowed(value:unknown,host:string){
 try{const u=new URL(String(value));return u.protocol==="https:"&&u.hostname===host&&!u.username&&!u.password?u.href:null}catch{return null}
}
function withUtm(value:unknown){
 const s=urlAllowed(value,"unsplash.com");if(!s)return null;
 const u=new URL(s);u.searchParams.set("utm_source","ai_stock_commons_orca");u.searchParams.set("utm_medium","referral");return u.href;
}

type ThemeProfile={brand:string,theme:string,terms:string[],queries:string[]};
function companyTheme(ticker:string,name:string,description:string):ThemeProfile{
 const short=name.replace(/\b(common stock|class [a-z] stock|corporation|incorporated|inc\.?|corp\.?|company|limited|ltd\.?|plc)\b/ig,"").replace(/[.,]/g,"").trim().split(/\s+/)[0].toLowerCase();
 const brand=({AAP:"advance auto parts",NVDA:"nvidia",ULTA:"ulta",AAPL:"apple",MSFT:"microsoft",INTC:"intel",META:"meta",RKLB:"rocket lab",AMZN:"amazon",WMT:"walmart",TSLA:"tesla"} as Record<string,string>)[ticker]||short||ticker.toLowerCase();
 const info=(name+" "+description).toLowerCase();
 const themes=[
  // Retail replacement parts must not inherit automotive manufacturing imagery.
  {test:/advance auto parts|auto parts (retailer|store|retail|chain)|automotive aftermarket parts|automotive parts retailer|car parts (retail|store)/,theme:"auto parts retail",
   terms:["auto parts","car parts","parts store","spare parts","auto supply","automotive accessories","car batteries","car battery","brake pads","oil filter","motor oil","store","retail","shelves"],
   queries:["auto parts store","auto parts shelves","car parts retail","auto parts counter"]},
  {test:/beauty|cosmetics|skincare|fragrance|salon/,theme:"beauty retail",terms:["makeup","cosmetic","beauty","skincare","fragrance","retail"],queries:["makeup cosmetics","beauty store","skincare products"]},
  {test:/nvidia|semiconductor|graphics processor|gpu|chip|foundry|accelerated computing/,theme:"semiconductors",terms:["gpu","chip","semiconductor","processor","circuit","server","datacenter","data center","graphics card"],queries:["semiconductor chip","gpu graphics card","data center servers"]},
  {test:/apple inc|iphone|ipad|macbook|consumer electronics/,theme:"consumer devices",terms:["iphone","ipad","macbook","laptop","smartphone","computer","electronics","apple"],queries:["iphone smartphone","laptop computers","consumer electronics"]},
  {test:/microsoft|azure|windows|office software/,theme:"software and cloud",terms:["microsoft","software","cloud","server","computer","windows","azure","data center"],queries:["software computers","cloud data center","server technology"]},
  {test:/rocket lab|satellite|spacecraft|launch vehicle/,theme:"aerospace",terms:["rocket","space","satellite","launch","spacecraft","aerospace"],queries:["rocket launch","space satellite","aerospace technology"]},
  {test:/automotive|motor vehicle|electric car|tesla|ford motor/,theme:"automotive",terms:["car","vehicle","automotive","factory","electric","manufacturing"],queries:["automotive factory","car vehicle","electric vehicle"]},
  {test:/restaurant|fast food|dining|burger/,theme:"restaurants",terms:["restaurant","food","kitchen","meal","dining"],queries:["restaurant food","commercial kitchen","dining restaurant"]},
  {test:/retailer|retail|store|shopping|e-commerce|merchandise/,theme:"retail",terms:["retail","store","shopping","products","supermarket","warehouse"],queries:["retail store","shopping shelves","retail warehouse"]},
  {test:/energy|oil|petroleum|gas exploration/,theme:"energy",terms:["energy","oil","gas","refinery","industrial","pipeline"],queries:["oil refinery","energy industry","industrial pipeline"]}
 ];
 const selected=themes.find(t=>t.test.test(info))||{theme:"business technology",terms:["technology","business","office","building"],queries:["technology infrastructure","business workplace","corporate headquarters"]};
 return {brand,theme:selected.theme,terms:selected.terms,queries:selected.queries};
}
function photoPlans(profile:ThemeProfile){
 // Prefer a one-word company name, except ambiguous names whose single-word search
 // is crowded by unrelated subjects (e.g. Apple fruit vs Apple computers).
 const brandTokens=profile.brand.toLowerCase().split(/\s+/);
 const primaryQuery=profile.brand==="apple"?"apple computers":
  profile.theme==="auto parts retail"?profile.brand+" store":profile.brand;
 return [
  {query:primaryQuery,keywords:brandTokens,minimumScore:8,companyOnly:true},
  {query:profile.theme==="auto parts retail"?"auto parts store":profile.brand+" "+profile.queries[0],keywords:profile.terms,minimumScore:3,companyOnly:false},
  ...profile.queries.filter((query,index)=>!(profile.theme==="auto parts retail"&&index===0)).map(query=>({query,keywords:profile.terms,minimumScore:3,companyOnly:false}))
 ];
}
function photoScore(photo:any,plan:any,profile:ThemeProfile){
 const tags=(photo.tags||[]).map((t:any)=>String(t.title||"")).join(" ");
 const description=(String(photo.alt_description||"")+" "+String(photo.description||"")+" "+tags+" "+String(photo.slug||"")).toLowerCase();
 const has=(word:string)=>description.includes(word);
 const matches=profile.terms.filter(has);
 const brandMatch=profile.brand.split(/\s+/).every(has);
 // Require strong evidence of a RETAIL parts scene or identifiable products.
 // Anything confusing, industrial, scrap-related, or belonging to a competing chain is rejected.
 if(profile.theme==="auto parts retail"){
  const competitor=/\b(lordco|autozone|o'?reilly|napa auto|carquest|pep boys|repco|autobarn|autodoc|autoparts24|europarts)\b/i;
  const nonRetail=/\b(scrap|scrapyard|junk|junkyard|wreck|wreckage|salvage|dismantl|damaged|crash|collision|repair|mechanic|garage|workshop|warehouse|factory|factories|robot|weld|assembly|industrial|manufactur|car wash|auto show|race|racing|vehicle lift|engine bay|car dealership|car dealer|machinery|production|machining)\b/i;
  const genuineBrand=/\badvance auto parts\b/i.test(description);
  const retailer=/(?:\b(auto|car|automotive|spare) parts?\b.{0,30}\b(store|retail|aisle|shelves|shelf|counter|storefront)\b|\bparts? (store|retailer|retail|aisle|shelves|shelf|counter)\b|\bauto supply (store|shop)\b)/i.test(description);
  const products=/\b(oil filters?|brake pads?|spark plugs?|car batter(?:y|ies)|motor oil|windshield wipers?|air filters?)\b/i.test(description);
  if(competitor.test(description)||nonRetail.test(description)||!(genuineBrand||retailer||products))return -100;
  return (genuineBrand?18:0)+(retailer?12:0)+(products?7:0);
 }
 const competingBrand=/\b(nvidia|intel|amd|apple|microsoft|samsung|qualcomm|tesla|ulta|sephora)\b/g;
 const otherNames=(description.match(competingBrand)||[]).filter((name:string)=>!profile.brand.toLowerCase().split(/\s+/).includes(name));
 if(otherNames.length&&!(description.includes(profile.brand)&&otherNames.length===1&&/\b(partner|collaborat|with|together)\b/.test(description)))return -100;
 // Strictly reject unrelated visual worlds, even when an event mentions a generic term.
 const forbidden=profile.theme==="auto parts retail"?/\b(factory|factories|manufactur(?:e|ing)|assembly|assembly line|production line|welding|welder|robot|robotic|automation|industrial|automaker|auto plant|car plant|vehicle plant|garage|workshop|mechanic|car repair|repair bay|vehicle repair|scrapyard|junkyard)\b/i:
  profile.theme==="semiconductors"?/\b(makeup|cosmetics|skincare|fashion|wedding|make-up|court house|courthouse|woman in dress)\b/i:
  profile.theme==="beauty retail"?/\b(courthouse|rockets?|satellite|data center|microchip|processor)\b/i:null;
 if(forbidden?.test(description))return -100;
 // The word "automotive" alone is not proof of a retail auto-parts scene.
 // Require retail/product evidence, not just a car or a manufacturing line.
 if(profile.theme==="auto parts retail"&&
  !/\b(auto parts|car parts|spare parts|parts store|auto supply|automotive accessories|car accessories|car battery|car batteries|brake pads|oil filters?|motor oil|automotive parts)\b/i.test(description))return -100;
 if(plan.companyOnly&&!brandMatch)return -100;
 // Short ambiguous brand terms must have industry context before being accepted.
 if(plan.companyOnly&&["apple","meta","ford","amazon","target","intel"].includes(profile.brand)&&!matches.some((term:string)=>!profile.brand.split(/\s+/).includes(term)))return -100;
 if(!plan.companyOnly&&!matches.length&&!brandMatch)return -100;
 if(/\b(portrait|selfie|wedding|fashion model)\b/.test(description)&&!/\b(gpu|chip|makeup|cosmetic|skincare)\b/.test(description))return -100;
 const offBrands=/\b(dior|chanel|sephora|charlotte tilbury|louis vuitton|gucci|prada|ysl|shu uemura)\b/i;
 if(offBrands.test(description))return -30;
 return (brandMatch?9:0)+matches.length*3;
}
function cachedNeedsReview(photo:any,profile:ThemeProfile){
 if(!photo)return false;
 if(photo.needs_review)return true;
 if(Number(photo.strategy_version||1)>=2)return false;
 const label=decodeURIComponent(String(photo.photo_url||"")).toLowerCase().replace(/-/g," ");
 if(profile.theme==="semiconductors")return !/\b(nvidia|gpu|chip|semiconductor|processor|circuit|server|data center|graphics card|computer hardware)\b/.test(label);
 if(profile.theme==="beauty retail")return /\b(courthouse|rocket|satellite|semiconductor|gpu)\b/.test(label);
 return false;
}

function similarPhotoMetadata(a:any,b:any):boolean{
 const photographer=(p:any)=>String(p.photographer||"").trim().toLowerCase();
 if(!photographer(a)||photographer(a)!==photographer(b))return false;
 const terms=(p:any)=>{
  try{
   const slug=decodeURIComponent(new URL(String(p.photo_url||"")).pathname.split("/").pop()||"")
    .replace(/-[A-Za-z0-9_]{11}$/,"");
   return new Set(slug.toLowerCase().split("-").filter(w=>w.length>=4&&!["store","photo","image","with","from","view"].includes(w)));
  }catch{return new Set<string>()}
 };
 const wordsA=terms(a),wordsB=terms(b);
 let common=0;for(const word of wordsA){if(wordsB.has(word))common++}
 // Two shop-interior portraits can be near-identical despite different Unsplash slugs.
 const scene=(p:any)=>String(p.photo_url||"").toLowerCase();
 const bothRetail=[a,b].every(p=>/store|shelves|beauty/.test(scene(p)));
 const bothProduct=[a,b].every(p=>/product|skincare|cosmetic/.test(scene(p)));
 return common>=3||(bothRetail&&bothProduct);
}


type Candidate={photo_id:string,image_url:string,full_image_url:string,photographer:string,photographer_url:string,photo_url:string,
 source_type:string,source_page_url:string,creator:string,license_name:string,license_url:string,attribution_text:string,
 rights_status:string,match_type:string,relevance_score:number,query_used:string,image_title:string,thumbnail_url:string};
const commonHeaders={"User-Agent":"ORCA-CompanyTimeline/1.0 (https://github.com/jonfordy5/orca-staging; Wikimedia Commons licensed media lookup)","Accept":"application/json"};
function plain(value:unknown):string{
 return String(value||"").replace(/<[^>]*>/g," ").replace(/&quot;/g,'"').replace(/&amp;/g,"&")
 .replace(/&#(?:x[0-9a-f]+|\d+);/gi," ").replace(/\s+/g," ").trim().slice(0,1000);
}
function canonicalTokens(value:string):string[]{
 return value.toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(t=>t.length>2&&!new Set(
 ["the","and","for","with","from","that","this","announces","announced","introduces","introduced","unveils","unveiled","company",
 "corp","inc","incorporated","reports","filed","annual","report","results","first","new","after","their","more","than"]).has(t));
}
function subjectsForEvent(event:any,companyName:string,ticker:string):string[]{
 const title=String(event.title||"");
 // A routine financial filing does not imply an identifiable photo subject.
 if(/\b(10-k|annual report|filed its|fiscal results|quarter results|year-end results)\b/i.test(title))return [];
 const names:string[]=[];
 const known=[
 /\b(GeForce RTX|GeForce GTX|GH200|H100|Tesla P100|Blackwell|Hopper|Kepler|Mellanox|PortalPlayer|Grace Hopper)\b/ig,
 /\b(Space NK|UB Marketplace|Neutron|Electron)\b/ig,
 /\b(Azure|Windows|iPhone|MacBook|iPad|Tesla Cybertruck)\b/ig
 ];
 for(const regex of known)for(const match of title.matchAll(regex))names.push(match[1]);
 // Named executives are valid exact image subjects, unlike the generic word "CEO".
 for(const m of title.matchAll(/\b(?:appoints|names|hires|elects)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s+(?:as|to|CEO|CFO|president))?/g))
  names.push(m[1]);
 const normalized=companyName.replace(/\b(inc|corp|corporation|common stock|company|plc|ltd)\b/gi,"").replace(/\s+/g," ").trim();
 // Only strong event-specific subjects; using company alone would license generic unrelated photos.
 if(names.length===0){
  const match=title.match(/\b(acquisition of|acquires|merges with|opens in|partners with)\s+([A-Z][A-Za-z0-9& -]{3,50})/);
  if(match)names.push(match[2].trim());
 }
 return [...new Set(names)].filter(x=>x.length>=4&&x.toLowerCase()!==normalized.toLowerCase()).slice(0,3);
}
function licensedCommons(meta:any):{name:string,url:string,artist:string}|null{
 const m=meta||{};
 const name=plain(m.LicenseShortName?.value||m.License?.value||"");
 const licenseLink=String(m.LicenseUrl?.value||"").trim();
 const usage=plain(m.UsageTerms?.value||"");
 const permittedName=/^(CC0|CC BY(?:-SA)?(?:\s|$)|Public domain|PD(?:-|$))/i.test(name);
 const permittedURL=/^https:\/\/creativecommons\.org\/(licenses\/by(?:-sa)?\/|publicdomain\/(?:zero|mark)\/)/i.test(licenseLink);
 // A machine-readable reuse license is mandatory. Never invent a license URL.
 if(!permittedName||!permittedURL)return null;
 if(/noncommercial|no derivatives|all rights reserved|\bNC\b|\bND\b/i.test(name+" "+usage))return null;
 const official=licenseLink;
 const artist=plain(m.Artist?.value||m.Credit?.value||"");
 if(!artist)return null;
 return {name:name||"Public domain",url:official,artist:artist.slice(0,240)};
}
function exactSubjectMatch(subject:string,text:string):boolean{
 const terms=canonicalTokens(subject);
 if(!terms.length)return false;
 const haystack=canonicalTokens(text);
 if(terms.length===1)return haystack.includes(terms[0]);
 // A named product or acquired company must have all distinctive tokens.
 return terms.every(t=>haystack.includes(t));
}
function imageMime(filename:string):boolean{return /\.(jpe?g|png|webp)$/i.test(filename)}
function checkCommonsResult(page:any,subject:string,query:string):Candidate|null{
 const info=page?.imageinfo?.[0],meta=info?.extmetadata;
 const license=licensedCommons(meta);
 if(!license||!info||!imageMime(page.title||""))return null;
 const fileName=String(page.title||"").replace(/^File:/i,"").replace(/_/g," ");
 const context=plain(meta?.ImageDescription?.value||"");
 // Full-text descriptions can mention a subject without depicting it.
 // For unattended publication require a named subject in the actual Commons file title.
 const subjectMatches=exactSubjectMatch(subject,fileName);
 if(!subjectMatches)return null;
 // Avoid untrustworthy "stock photo" assumptions: require product/person name visible in metadata.
 const source=String(info.descriptionurl||"");
 const thumb=String(info.thumburl||info.url||"");
 const original=String(info.url||"");
 if(!source.startsWith("https://commons.wikimedia.org/wiki/File:")||
 !/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(thumb)||
 !/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//.test(original))return null;
 const id="commons:"+encodeURIComponent(String(page.title||""));
 const score=exactSubjectMatch(subject,fileName)?93:86;
 return {photo_id:id,image_url:thumb,full_image_url:original,thumbnail_url:thumb,
  photographer:license.artist,photographer_url:source,photo_url:source,
  source_type:"wikimedia_commons",source_page_url:source,creator:license.artist,
  license_name:license.name,license_url:license.url,attribution_text:license.artist+" · "+license.name,
  rights_status:"reuse_verified",match_type:"exact_subject",relevance_score:score,query_used:query,
  image_title:fileName};
}
async function fetchJson(u:URL):Promise<any>{
 const res=await fetch(u.toString(),{headers:commonHeaders,signal:AbortSignal.timeout(8500)});
 if(!res.ok)throw new Error("image_catalogue_"+res.status);
 return res.json();
}
async function commonsSearch(subject:string):Promise<Candidate[]>{
 const u=new URL("https://commons.wikimedia.org/w/api.php");
 u.searchParams.set("action","query");u.searchParams.set("generator","search");
 u.searchParams.set("gsrsearch",subject);u.searchParams.set("gsrnamespace","6");
 u.searchParams.set("gsrlimit","15");u.searchParams.set("prop","imageinfo");
 u.searchParams.set("iiprop","url|extmetadata");u.searchParams.set("iiurlwidth","920");
 u.searchParams.set("format","json");u.searchParams.set("formatversion","2");
 const result=await fetchJson(u);
 return (result.query?.pages||[]).map((p:any)=>checkCommonsResult(p,subject,subject)).filter(Boolean);
}
async function wikidataImage(subject:string):Promise<Candidate[]>{
 const u=new URL("https://www.wikidata.org/w/api.php");
 u.searchParams.set("action","wbsearchentities");u.searchParams.set("search",subject);
 u.searchParams.set("language","en");u.searchParams.set("limit","3");u.searchParams.set("format","json");
 const results=await fetchJson(u);
 const entity=(results.search||[]).find((e:any)=>exactSubjectMatch(subject,String(e.label||"")));
 if(!entity)return [];
 const detail=new URL("https://www.wikidata.org/w/api.php");
 detail.searchParams.set("action","wbgetentities");detail.searchParams.set("ids",entity.id);
 detail.searchParams.set("props","claims");detail.searchParams.set("format","json");
 const claims=await fetchJson(detail);
 const files=(claims.entities?.[entity.id]?.claims?.P18||[]).map((x:any)=>x.mainsnak?.datavalue?.value).filter(Boolean).slice(0,2);
 const out:Candidate[]=[];
 for(const filename of files){
  const u2=new URL("https://commons.wikimedia.org/w/api.php");
  u2.searchParams.set("action","query");u2.searchParams.set("titles","File:"+filename);
  u2.searchParams.set("prop","imageinfo");u2.searchParams.set("iiprop","url|extmetadata");
  u2.searchParams.set("iiurlwidth","920");u2.searchParams.set("format","json");u2.searchParams.set("formatversion","2");
  const r=await fetchJson(u2);
  const page=(r.query?.pages||[])[0];
  const candidate=checkCommonsResult(page,subject,subject);
  if(candidate)out.push(candidate);
 }
 return out;
}
async function officialReleaseCheck(event:any,allowedSite:string):Promise<{found:boolean,reusable:boolean}>{
 // Only fetch the original verified company release, on the company's controlled host.
 // Metadata (og:image/twitter:image) does NOT itself grant image reuse rights.
 try{
  const u=new URL(String(event.source_url||"")),base=new URL(allowedSite);
  const root=base.hostname.replace(/^www\./,"");
  if(u.protocol!=="https:"||!(u.hostname===root||u.hostname.endsWith("."+root)))return {found:false,reusable:false};
  const response=await fetch(u.toString(),{headers:{"User-Agent":commonHeaders["User-Agent"]},
    signal:AbortSignal.timeout(6000),redirect:"error"});
  if(!response.ok||!/text\/html/.test(response.headers.get("content-type")||""))return {found:false,reusable:false};
  const page=(await response.text()).slice(0,120000);
  const hasImage=/(?:og:image|twitter:image|application\/ld\+json)/i.test(page);
  // Public press imagery is not automatically licensed. Defer to a future
  // rights-cleared approved-domain registry, never auto-accept it from HTML alone.
  return {found:hasImage,reusable:false};
 }catch{return {found:false,reusable:false}}
}

const maximumPerCall=3;
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"POST only"});
 if(req.headers.get("Origin")!==origin)return reply(403,{error:"ORCA staging only"});
 if(Number(req.headers.get("content-length")||"0")>512)return reply(413,{error:"Request too large"});
 const bearer=(req.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!bearer)return reply(401,{error:"Sign in required"});
 const {data:identity,error:authError}=await admin.auth.getUser(bearer);
 if(authError||!identity?.user)return reply(401,{error:"Invalid sign-in"});
 let body:any;try{body=await req.json()}catch{return reply(400,{error:"Invalid JSON"})}
 const ticker=String(body?.ticker||"").trim().toUpperCase();
 if(!validTicker(ticker))return reply(400,{error:"Invalid stock ticker"});
 // Company photography is a shared public-page enhancement, not an agent submission.
 // Require authenticated research consent; stock-specific membership stays mandatory
 // for the independent claim/research/publish workflow, not shared photo caching.
 const {data:profiles,error:profileError}=await admin.from("agent_profiles").select("id")
  .eq("owner_id",identity.user.id).eq("opted_in",true).limit(1);
 if(profileError||!profiles?.length)return reply(403,{error:"Opted-in ORCA researcher required"});

 // This remains an explicit, authenticated, opted-in user action. No paid vision
 // or unapproved Flickr commercial API calls are performed.
 const {count,error:countError}=await admin.from("orca_timeline_photo_selections")
  .select("event_id",{head:true,count:"exact"}).gte("created_at",new Date(Date.now()-86400000).toISOString());
 if(countError)return reply(503,{error:"Photo cache unavailable"});
 if((count||0)>=24)return reply(429,{error:"Daily staging photo-selection limit reached"});
 const {data:events,error:eventError}=await admin.from("orca_timeline_annotations")
  .select("id,ticker,title,ai_summary,event_at,source_url,category").eq("ticker",ticker)
  .is("created_by",null).order("event_at",{ascending:true}).limit(100);
 if(eventError)return reply(503,{error:"Milestone lookup unavailable"});
 const {data:stock,error:stockError}=await admin.from("stocks").select("company_name").eq("ticker",ticker).maybeSingle();
 if(stockError||!stock?.company_name)return reply(404,{error:"Unknown company"});
 const {data:profile}=await admin.from("orca_ai_company_profiles").select("usage,content")
  .eq("ticker",ticker).maybeSingle();
 const official=String(profile?.usage?.official_website||"");
 const {data:cached,error:cachedError}=await admin.from("orca_timeline_photo_selections")
  .select("event_id,photo_id,source_type,needs_review,match_type,relevance_score").eq("ticker",ticker).limit(500);
 if(cachedError)return reply(503,{error:"Photo cache unavailable"});
 const byEvent=new Map((cached||[]).map((p:any)=>[p.event_id,p]));
 const improve=body?.improve===true;
 const targets=(events||[]).filter((event:any)=>{
  const previous:any=byEvent.get(event.id);
  return !previous||(improve&&previous.needs_review);
 });
 const todo=targets.slice(0,3);
 if(!todo.length)return reply(200,{state:"cached",added:0,remaining:0,
  note:"All displayed records are already cached and not flagged."});
 const reservedIds=new Set((cached||[]).map((p:any)=>p.photo_id));
 let added=0,failed=0,attempted=0,licenseRejected=0,sourceTried={official:0,wikimedia:0,flickr:0};
 const tested:any[]=[];
 for(const event of todo){
  attempted++;
  let choice:Candidate|null=null,subjectUsed="";
  try{
   if(official){sourceTried.official++;await officialReleaseCheck(event,official);}
   // Search exact named event subjects, not generic company/industry keywords.
   const subjects=subjectsForEvent(event,stock.company_name,ticker);
   for(const subject of subjects.slice(0,2)){
    subjectUsed=subject;
    let candidates:Candidate[]=[];
    try{sourceTried.wikimedia++;candidates=await wikidataImage(subject)}catch{}
    try{sourceTried.wikimedia++;candidates.push(...await commonsSearch(subject))}catch{}
    // Two image IDs for the same Commons file must never be selected twice.
    candidates=candidates.filter(c=>!reservedIds.has(c.photo_id));
    candidates.sort((a,b)=>b.relevance_score-a.relevance_score);
    if(candidates.length){
     choice=candidates[0];
     break;
    }
   }
   // Flickr and AI vision remain disabled. No credentials, API quota or AI charges incurred.
   if(!choice){
    failed++;tested.push({event_id:event.id,title:event.title,accepted:false,
     reason:subjectUsed?"no_rights_verified_exact_subject_image":"no_identifiable_event_subject"});
    continue;
   }
   const {error:writeError}=await admin.from("orca_timeline_photo_selections").upsert({
    event_id:event.id,ticker,photo_id:choice.photo_id,image_url:choice.image_url,
    full_image_url:choice.full_image_url,photographer:choice.photographer,
    photographer_url:choice.photographer_url,photo_url:choice.photo_url,illustrative:true,
    search_query:choice.query_used,match_score:choice.relevance_score,strategy_version:3,needs_review:false,
    source_type:choice.source_type,source_page_url:choice.source_page_url,creator:choice.creator,
    license_name:choice.license_name,license_url:choice.license_url,
    attribution_text:choice.attribution_text,rights_status:choice.rights_status,
    match_type:choice.match_type,relevance_score:choice.relevance_score,query_used:choice.query_used,
    verified_at:new Date().toISOString(),thumbnail_url:choice.thumbnail_url,image_title:choice.image_title,
    event_date:event.event_at?.slice(0,10),event_title:event.title
   },{onConflict:"event_id"});
   if(writeError){failed++;tested.push({event_id:event.id,accepted:false,reason:"cache_write_failed"});continue}
   reservedIds.add(choice.photo_id);added++;
   tested.push({event_id:event.id,accepted:true,source:choice.source_type,
    subject:subjectUsed,match_type:choice.match_type,score:choice.relevance_score,license:choice.license_name});
  }catch{failed++;tested.push({event_id:event.id,accepted:false,reason:"catalogue_unavailable_or_unverified"})}
 }
 return reply(200,{state:"ready",added,failed,requested:todo.length,remaining:Math.max(0,targets.length-added),
  source_attempts:sourceTried,tested,
  note:"Official rights not assumed. Wikimedia exact-subject images only. Flickr and Unsplash automatic lookup disabled."});
});
