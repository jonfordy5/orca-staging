import {createClient} from "npm:@supabase/supabase-js@2.57.0";
// ORCA staging: opt-in Unsplash photo selection, up to ten event-aware photos per authorized request.
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
 const short=name.replace(/\b(common stock|class [a-z] stock|corporation|incorporated|inc\.?|corp\.?|company|limited|ltd\.?|plc)\b/ig,"").replace(/[.,]/g,"").trim().toLowerCase();
 const brand=({DG:"dollar general",AAP:"advance auto parts",NVDA:"nvidia",ULTA:"ulta",AAPL:"apple",MSFT:"microsoft",INTC:"intel",META:"meta",RKLB:"rocket lab",AMZN:"amazon",WMT:"walmart",TSLA:"tesla"} as Record<string,string>)[ticker]||short||ticker.toLowerCase();
 const info=(name+" "+description).toLowerCase();
 const themes=[
  {test:/dollar general|discount (?:retailer|retail|store)|variety store|value retailer/,
   theme:"discount retail",
   terms:["dollar general","discount store","discount retail","convenience store","convenience shop","grocery aisle","retail shelves","store shelves","household essentials","household products","general merchandise","groceries"],
   queries:["convenience store interior","convenience store shelves","discount store groceries","discount retail shelves","household essentials retail","grocery store aisle"]},
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
  (profile.theme==="auto parts retail"||profile.theme==="discount retail")?profile.brand+" store":profile.brand;
 return [
  {query:primaryQuery,keywords:brandTokens,minimumScore:8,companyOnly:true},
  {query:profile.theme==="auto parts retail"?"auto parts store":
   profile.theme==="discount retail"?profile.brand+" discount store":profile.brand+" "+profile.queries[0],keywords:profile.terms,minimumScore:3,companyOnly:false},
  ...profile.queries.filter((query,index)=>!(profile.theme==="auto parts retail"&&index===0)).map(query=>({query,keywords:profile.terms,minimumScore:3,companyOnly:false}))
 ];
}
function photoScore(photo:any,plan:any,profile:ThemeProfile){
 const tags=(photo.tags||[]).map((t:any)=>String(t.title||"")).join(" ");
 const description=(String(photo.alt_description||"")+" "+String(photo.description||"")+" "+tags+" "+String(photo.slug||"")).toLowerCase();
 const has=(word:string)=>description.includes(word);
 const matches=profile.terms.filter(has);
 const brandMatch=profile.brand.split(/\s+/).every(has);
 if(profile.theme==="discount retail"){
  const cash=/\b(banknote|banknotes|dollar bills?|cash|currency|coins?|bitcoin|bank teller|forex|banking|money|financial chart)\b/i;
  const competitor=/\b(dollar tree|family dollar|walmart|target|costco|aldi|lidl|five below|walgreens|cvs)\b/i;
  const retail=/\b(discount stores?|discount retail|convenience (?:stores?|shops?|retail)|grocery (?:aisles?|shelves|store|section)|supermarket|produce section|refrigerated (?:section|shelves|food)|retail shelves|store shelves|store aisles?|storefront|household essentials|household products|general merchandise|variety store|shopping aisles?)\b/i;
  const brand=/\bdollar general\b/i.test(description);
  if(cash.test(description)||competitor.test(description)||!(brand||retail.test(description)))return -100;
  if(plan.companyOnly&&!brand)return -100;
  return (brand?26:0)+(retail.test(description)?12:0);
 }
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



type Candidate={
 id:string;image_url:string;full_image_url:string;photographer:string;photographer_url:string;
 photo_url:string;download_location:string;title:string;query:string;tier:number;score:number;company_match?:boolean;venue?:string;context_kinds?:string[];retail_illustration?:boolean;
};
// Industry words do not establish company identity. Keep the complete brand phrase.
function companyPhotoIdentity(title:string,profile:ThemeProfile):boolean{
 const clean=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
 const description=" "+clean(title)+" ";
 const brand=clean(profile.brand);
 if(!brand||!description.includes(" "+brand+" "))return false;
 // Ambiguous company names also need their industry/product context.
 if(["apple","meta","ford","amazon","target","intel"].includes(brand))
  return profile.terms.some(term=>clean(term)!==brand&&description.includes(" "+clean(term)+" "));
 return true;
}
function photoVenue(title:string):string|undefined{
 return /\b(new york stock exchange|nyse)\b/i.test(title)?"nyse":undefined;
}
// Illustrative scenes follow the EVENT, not just the company's general industry.
// Never describe these images as documentary evidence of an actual milestone.
type EventVisualPlan={kind:string;queries:string[];terms:string[]};
function eventVisualPlan(event:{title:string;category?:string},profile:ThemeProfile):EventVisualPlan{
 const title=String(event.title||"").toLowerCase();
 if(/\b(mexico|mexican|international expansion|overseas)\b/.test(title)){
  const mexico=/\b(mexico|mexican)\b/.test(title);
  if(mexico&&profile.theme==="discount retail")
   return {kind:"international",queries:["mexico grocery supermarket"],terms:["supermarket","grocery","retail","store","aisle"]};
  return {kind:"international",queries:profile.queries.slice(0,2).map(q=>(mexico?"mexico ":"")+q),terms:profile.terms};
 }
 if(/\b(nyse|stock exchange|ipo|public trading|public listing|listed|initial public offering)\b/.test(title))
  return {kind:"listing",queries:profile.brand==="dollar general"?["new york stock exchange"]:["new york stock exchange building","wall street stock exchange"],terms:["stock exchange","wall street","nyse","trading floor","exchange","financial district"]};
 if(/\b(ceo|chief executive|leadership|management|appointments?|president|board names|chairman)\b/.test(title))
  return {kind:"leadership",queries:profile.brand==="dollar general"?["meeting boardroom"]:["business meeting boardroom","corporate office leadership"],terms:["meeting","boardroom","office","conference","team","business","corporate"]};
 if(/\b(fresh|grocer|food|refrigerat|distribution|supply chain|cold storage)\b/.test(title))
  return {kind:"grocery",queries:profile.brand==="dollar general"?["grocery supermarket refrigerated","convenience store"]:profile.theme==="discount retail"?["grocery supermarket refrigerated section","convenience store interior","convenience store shelves"]:["grocery supermarket refrigerated section","supermarket fresh food shelves"],terms:["grocery","refrigerat","supermarket","food","produce","store","shelves","cold","distribution"]};
 if(/\b(popshelf|home goods|merchandise|new product|product line)\b/.test(title))
  return {kind:"merchandise",queries:profile.brand==="dollar general"?["convenience store","retail storefront"]:profile.theme==="discount retail"?["convenience store shelves","colorful home goods store shelves"]:["colorful home goods store shelves","retail home decor merchandise"],terms:["home goods","decor","merchandise","shelves","store","retail","products","colorful"]};
 if(/\b(merger|acquisition|take.private|go private|buyout|deal)\b/.test(title))
  return {kind:"corporate",queries:profile.brand==="dollar general"?["retail storefront","convenience store"]:["retail storefront exterior","corporate office building"],terms:["storefront","retail","office","building","business","store","corporate"]};
 if(/\b(closing|closures?|shrink|restructur|store opening|opened|new stores?|expansion)\b/.test(title))
  return {kind:"stores",queries:profile.brand==="dollar general"?["retail storefront","convenience store"]:profile.theme==="discount retail"?["convenience store exterior","convenience store interior"]:["retail store storefront","retail shopping aisles"],terms:["storefront","store","retail","shopping","shelves","aisle"]};
 return {kind:"general",queries:profile.brand==="dollar general"?["convenience store"]:[profile.queries[0],profile.queries[1]],terms:profile.terms};
}
function visualQueries(profile:ThemeProfile,events:{title:string;category?:string}[]):string[]{
 // DG pilot: seven broad, distinct search phrases. Do not narrow or recombine them.
 // Repeated convenience-store searches use different result pages, not duplicated page one.
 if(profile.brand==="dollar general")return [
  "dollar general",
  "convenience store",
  "retail storefront",
  "new york stock exchange",
  "meeting boardroom",
  "grocery supermarket refrigerated",
  "mexico grocery supermarket"
 ];
 const plans=events.map(e=>eventVisualPlan(e,profile));
 const subjects=[...new Set(plans.map(p=>p.kind))];
 const themed=profile.theme==="discount retail"?"convenience store interior":
  profile.theme==="beauty retail"?"beauty skincare store":
  profile.theme==="auto parts retail"?"automotive parts shop":
  profile.theme==="semiconductors"?"computer chip electronics":profile.queries[0];
 // Company first; then one search per distinct milestone subject.
 const specific=photoPlans(profile);
 return [...new Set([specific[0]?.query,
  ...(profile.theme==="discount retail"?["convenience store interior","convenience store shelves","convenience store exterior"]:[]),
  ...subjects.map(kind=>plans.find(p=>p.kind===kind)?.queries[0]),
  specific[1]?.query,themed,...profile.queries].filter(Boolean))].slice(0,12);
}
// Search intent is not evidence. Require a matching SUBJECT in the image's metadata.
function eventContextMatch(description:string,plan:EventVisualPlan):boolean{
 const text=description.toLowerCase();
 switch(plan.kind){
  case "international":return /\b(mexico|mexican|supermercado)\b/.test(text)&&
   /\b(grocery|groceries|supermarket|market|retail|store|shop|shopping|food)\b/.test(text);
  case "listing":return /\b(nyse|new york stock exchange|stock exchange|wall street)\b/.test(text);
  case "leadership":return /\b(boardroom|board meeting|conference room|business meeting|corporate meeting|office meeting|meeting room)\b/.test(text);
  case "grocery":return /\b(grocery|supermarket|refrigerat\w*|produce aisle|produce market|fresh food|cold storage|distribution center|food aisle|convenience store(?: (?:interior|shelves|aisle))?)\b/.test(text);
  case "merchandise":return /\b(home goods|home decor|homeware|household goods|decor store|merchandise shelves|retail display|convenience store(?: (?:interior|shelves|aisle))?)\b/.test(text);
  case "corporate":return /\b(retail storefront|storefront|corporate office|office building|company headquarters)\b/.test(text);
  case "stores":return /\b(storefront|store front|retail store|retail shopping|shopping aisle|shopfront|retail shelves|convenience store(?: (?:interior|shelves|aisle|exterior))?)\b/.test(text);
  default:return false;
 }
}
function eventCandidateScore(candidate:Candidate,plan:EventVisualPlan):number{
 const desc=candidate.title.toLowerCase();
 const hits=plan.terms.filter(term=>desc.includes(term)).length;
 const scene=Boolean(candidate.context_kinds?.includes(plan.kind));
 if(candidate.company_match&&scene)return 250+Math.min(hits,4)*12;
 if(plan.kind==="listing"&&candidate.venue==="nyse")return 220+Math.min(hits,4)*12;
 if(scene)return 190+Math.min(hits,4)*12;
 if(candidate.company_match)return 65+Math.min(hits,4)*8+Math.min(candidate.score,40);
 // A caption-identified retail scene is an honest illustrative fallback for
 // discount retailers; it is never represented as an event photograph.
 if(candidate.retail_illustration)return 30+Math.min(hits,3)*5+Math.min(candidate.score,25);
 return -Infinity;
}
const excludedBrands=/\b(lordco|autozone|o'?reilly|napa auto|pep boys|sephora|dior|chanel|louis vuitton|gucci|prada)\b/i;
const offThemeAuto=/\b(scrap|junkyard|salvage|wreck|factory|assembly line|welding|industrial robots|crashed)\b/i;
function candidateFromUnsplash(p:any,query:string,tier:number,profile:ThemeProfile,plans:EventVisualPlan[]):Candidate|null{
 const url=urlAllowed(p.urls?.small,"images.unsplash.com");
 const full=urlAllowed(p.urls?.regular,"images.unsplash.com");
 const photographer=String(p.user?.name||"").trim().slice(0,120);
 const photographer_url=withUtm(p.user?.links?.html);
 const photo_url=withUtm(p.links?.html);
 const download=urlAllowed(p.links?.download_location,"api.unsplash.com");
 const id=String(p.id||"");
 const description=[p.alt_description,p.description,p.slug,(p.tags||[]).map((t:any)=>t.title).join(" ")].filter(Boolean).join(" ").toLowerCase();
 if(!id||!url||!full||!photographer||!photographer_url||!photo_url||!download)return null;
 if(excludedBrands.test(description)&&!description.includes(profile.brand))return null;
 // Cross-company signage and cash photos never become legitimate stock context.
 if(profile.theme==="discount retail"&&/\b(dollar tree|family dollar|walmart|target|costco|aldi|lidl|five below|walgreens|cvs|banknotes?|dollar bills?|currency|bitcoin|cash|coins|money|gas station|gas pump|fuel pump|petrol station|filling station|fuel dispenser)\b/i.test(description))return null;
 if(profile.theme==="auto parts retail"&&/\b(lordco|autozone|o'?reilly|napa auto|carquest|pep boys)\b/i.test(description))return null;
 if(profile.theme==="auto parts retail"&&offThemeAuto.test(description))return null;
 let score=photoScore(p,{companyOnly:tier===0,minimumScore:0,keywords:profile.terms},profile);
 // Do not accept off-brand results at any fallback tier.
 if(score<0&&profile.theme==="discount retail"&&
  /\b(stock exchange|wall street|business meeting|corporate office)\b/i.test(query)&&
  /\b(stock exchange|wall street|trading floor|boardroom|conference room|business meeting|office building|corporate office)\b/i.test(description)&&
  !/\b(banknotes?|cash|dollar bills?|coins?|currency|bitcoin|money|forex|bank teller|walmart|target|dollar tree|family dollar)\b/i.test(description))score=12;
 const context_kinds=[...new Set(plans.filter(plan=>plan.queries.includes(query)&&eventContextMatch(description,plan)).map(p=>p.kind))];
 // Compute scene relevance before checking it. The previous order caused a ReferenceError.
 const retail_illustration=profile.theme==="discount retail"&&
  /\b(convenience stores?|convenience shops?|grocery stores?|supermarkets?|discount stores?|retail shelves|store shelves|shopping aisles|grocery aisles|retail storefront|storefront)\b/i.test(description);
 if(score<0&&!context_kinds.length&&!retail_illustration)return null;
 const company_match=companyPhotoIdentity(description,profile);
 const venue=photoVenue(description);
 if(!company_match&&!venue&&!context_kinds.length&&!retail_illustration)return null;
 return {id,image_url:url,full_image_url:full,photographer,photographer_url,
  photo_url,download_location:download,title:description.slice(0,300),query,tier,company_match,venue,context_kinds,retail_illustration,
  score:Math.max(0,score)+Math.max(0,5-tier)*8+Math.min(Number(p.likes||0)/500,2)};
}
async function findUnsplashCandidates(accessKey:string,queries:string[],profile:ThemeProfile,plans:EventVisualPlan[]):Promise<{candidates:Candidate[],limited:boolean,queries_tried:string[]}>{
 const out:Candidate[]=[];let limited=false;
 const q: string[]=[];
 // Four searches are usually enough to cover 10 unique images; reserve an abstract
 // query if the pool remains insufficient. A 30-photo batch costs one search call.
 // Three genuinely different result pages for the repeated "convenience store" request.
 searchLoop: for(const [tier,query] of queries.entries()){
  const pageCount=profile.brand==="dollar general"&&query==="convenience store"?3:1;
  for(let page=1;page<=pageCount;page++){
   q.push(query+(pageCount>1?" (page "+page+")":""));
   const uri=new URL("https://api.unsplash.com/search/photos");
   uri.searchParams.set("query",query);
   uri.searchParams.set("page",String(page));
   uri.searchParams.set("per_page","30");
   uri.searchParams.set("orientation","landscape");
   uri.searchParams.set("order_by","relevant");
   uri.searchParams.set("content_filter","high");
   try{
    const response=await fetch(uri.toString(),{headers:{"Authorization":"Client-ID "+accessKey,"Accept-Version":"v1"},
     signal:AbortSignal.timeout(8500)});
    if(!response.ok){if([401,403,429].includes(response.status)){limited=true;break searchLoop}continue}
    const json=await response.json();
    for(const p of (Array.isArray(json.results)?json.results:[])){
     const c=candidateFromUnsplash(p,query,tier,profile,plans);
     if(c)out.push(c);
    }
   }catch(error){console.warn("ORCA Unsplash search failed",String(error))}
  }
 }
 const byId=new Map<string,Candidate>();
 for(const c of out){
  const old=byId.get(c.id);
  if(!old||c.score>old.score)byId.set(c.id,c);
 }
 return {candidates:[...byId.values()].sort((a,b)=>b.score-a.score),limited,queries_tried:q};
}
function pickCandidate(pool:Candidate[],reserved:Set<string>,photographerCounts:Map<string,number>,plan:EventVisualPlan):Candidate|null{
 const available=pool.filter(p=>!reserved.has(p.id)&&Number.isFinite(eventCandidateScore(p,plan)));
 if(!available.length)return null;
 available.sort((a,b)=>(eventCandidateScore(b,plan)-(photographerCounts.get(b.photographer)||0)*5)-
  (eventCandidateScore(a,plan)-(photographerCounts.get(a.photographer)||0)*5));
 return available[0];
}

const maximumPerCall=10;
// Shared development allowance, measured over a rolling 24-hour window.
const dailyPhotoLimit=300;
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


 const {count,error:countError}=await admin.from("orca_timeline_photo_selections")
   .select("event_id",{head:true,count:"exact"}).gte("created_at",new Date(Date.now()-86400000).toISOString());
 if(countError)return reply(503,{error:"Photo cache unavailable"});
 const {data:events,error:eventError}=await admin.from("orca_timeline_annotations")
  .select("id,ticker,title,event_at,category").eq("ticker",ticker).is("created_by",null)
  .order("event_at",{ascending:true}).limit(100);
 if(eventError)return reply(503,{error:"Milestone lookup unavailable"});
 const all=events||[];
 const featured=all.length<=10?all:Array.from({length:10},(_,i)=>all[Math.round(i*(all.length-1)/9)]);
 const {data:stock,error:stockError}=await admin.from("stocks").select("company_name").eq("ticker",ticker).maybeSingle();
 if(stockError||!stock?.company_name)return reply(404,{error:"Unknown company"});
 const {data:companyProfile}=await admin.from("orca_ai_company_profiles").select("content")
  .eq("ticker",ticker).maybeSingle();
 const profile=companyTheme(ticker,String(stock.company_name),
  String(companyProfile?.content?.what_they_do||companyProfile?.content?.overview||""));
 const {data:cached,error:cachedError}=await admin.from("orca_timeline_photo_selections")
  .select("event_id,photo_id,needs_review,photographer").eq("ticker",ticker).limit(500);
 if(cachedError)return reply(503,{error:"Photo cache unavailable"});
 const existing=new Map((cached||[]).map((p:any)=>[p.event_id,p]));
 const seenIds=new Set<string>(),duplicateEvents=new Set<string>();
 for(const e of featured){
  const photoId=String(existing.get(e.id)?.photo_id||"");
  if(!photoId)continue;
  if(seenIds.has(photoId))duplicateEvents.add(e.id);
  else seenIds.add(photoId);
 }
 const targets=featured.filter((e:any)=>!existing.has(e.id)||existing.get(e.id)?.needs_review||duplicateEvents.has(e.id));
 if(!targets.length)return reply(200,{state:"cached",added:0,remaining:0,photos:featured.length});
 const remainingDaily=Math.max(0,dailyPhotoLimit-(count||0));
 if(!remainingDaily){
  const {data:oldest}=await admin.from("orca_timeline_photo_selections").select("created_at")
   .gte("created_at",new Date(Date.now()-86400000).toISOString()).order("created_at").limit(1);
  const retryAt=oldest?.[0]?.created_at?new Date(Date.parse(oldest[0].created_at)+86400000).toISOString():null;
  return reply(429,{state:"daily_limit",error:"Photo-selection daily safety limit reached",
   limit:dailyPhotoLimit,used:count,remaining:targets.length,retry_at:retryAt});
 }
 const todo=targets.slice(0,Math.min(10,remainingDaily));
 const accessKey=Deno.env.get("UNSPLASH_ACCESS_KEY");
 if(!accessKey)return reply(503,{error:"Unsplash access key is not configured"});
 const plans=featured.map((e:any)=>eventVisualPlan(e,profile));
 const search=await findUnsplashCandidates(accessKey,visualQueries(profile,featured),profile,plans);
 const reserved=new Set((cached||[]).filter((p:any)=>!p.needs_review).map((p:any)=>p.photo_id));
 const photographers=new Map<string,number>();
 for(const p of cached||[])photographers.set(p.photographer,(photographers.get(p.photographer)||0)+1);
 let added=0,failed=0;
 const choices: {event_id:string,choice:Candidate}[]=[];
 for(const e of todo){
  const found=pickCandidate(search.candidates,reserved,photographers,eventVisualPlan(e,profile));
  if(!found){failed++;continue}
  reserved.add(found.id);
  photographers.set(found.photographer,(photographers.get(found.photographer)||0)+1);
  choices.push({event_id:e.id,choice:found});
 }
 // If all unique candidates were exhausted, reuse the strongest relevant photo only as
 // a last resort. Repetition is suboptimal but is preferred to an unfilled timeline.
 const lastResort=search.candidates.filter(c=>c.score>=0);
 // Absolute last resort: already cached, credited Unsplash photographs. This remains
 // photography rather than a blank placeholder, including during provider outages.
 // Only reuse this company's credited, non-flagged photographs.
 if(lastResort.length<todo.length){
  const {data:stockCache}=await admin.from("orca_timeline_photo_selections")
   .select("photo_id,image_url,full_image_url,photographer,photographer_url,photo_url,ticker,needs_review,image_title")
   .eq("ticker",ticker).limit(100);
  // Never use another ticker's photo as a visual fallback.
  const backups=stockCache||[];
  const already=new Set(lastResort.map(c=>c.id));
  for(const p of backups){
   if(p.needs_review||!p.photo_id||already.has(p.photo_id)||
     !urlAllowed(p.image_url,"images.unsplash.com")||
     !urlAllowed(p.full_image_url,"images.unsplash.com")||
     !urlAllowed(p.photo_url,"unsplash.com")||
     !urlAllowed(p.photographer_url,"unsplash.com"))continue;
   already.add(p.photo_id);
   lastResort.push({id:p.photo_id,image_url:p.image_url,full_image_url:p.full_image_url,
    photographer:p.photographer,photographer_url:p.photographer_url,photo_url:p.photo_url,
    download_location:"",query:"existing credited photo cache",title:p.image_title||"",
    company_match:companyPhotoIdentity(p.image_title||"",profile),venue:photoVenue(p.image_title||""),
    tier:99,score:p.ticker===ticker?4:0});
  }
 }
 for(const e of todo){
  if(choices.find(c=>c.event_id===e.id))continue;
  if(!lastResort.length)continue;
  // Reuse only company-identified photography or the matching named venue.
  const plan=eventVisualPlan(e,profile);
  const ranked=lastResort.filter(c=>Number.isFinite(eventCandidateScore(c,plan)))
   .sort((a,b)=>eventCandidateScore(b,plan)-eventCandidateScore(a,plan));
  if(!ranked.length)continue;
  const pick=ranked[0];
  if(existing.has(e.id))continue;
  choices.push({event_id:e.id,choice:pick});
  failed=Math.max(0,failed-1);
 }
 for(const {event_id,choice} of choices){
  const duplicated=(cached||[]).some((p:any)=>p.event_id!==event_id&&p.photo_id===choice.id)||
   choices.some(x=>x.event_id!==event_id&&x.choice.id===choice.id);
  const plan=eventVisualPlan(featured.find((e:any)=>e.id===event_id)||{title:""},profile);
  const context=Boolean(choice.context_kinds?.includes(plan.kind));
  const matchType=context&&choice.company_match?"company_event_context":
   context?"topic_context":plan.kind==="listing"&&choice.venue==="nyse"?"venue_context":
   choice.company_match?"company_context":choice.retail_illustration?"retail_illustration":"company_context";
  const {error:saveError}=await admin.from("orca_timeline_photo_selections").upsert({
   event_id,ticker,photo_id:choice.id,image_url:choice.image_url,
   full_image_url:choice.full_image_url,photographer:choice.photographer,
   photographer_url:choice.photographer_url,photo_url:choice.photo_url,illustrative:true,
   source_type:"unsplash_legacy",rights_status:"legacy_provider_terms",
   match_type:matchType,search_query:choice.query,query_used:choice.query,
   strategy_version:9,needs_review:duplicated,created_at:new Date().toISOString(),
   image_title:choice.title,
   match_score:Math.round(choice.score),relevance_score:Math.min(100,Math.round(choice.score)),
   attribution_text:"Photo by "+choice.photographer+" on Unsplash",
   source_page_url:choice.photo_url,creator:choice.photographer
  },{onConflict:"event_id"});
  if(saveError){failed++;continue}
  added++;
 }
 // Every accepted photo is counted as an Unsplash selection/download event.
 // This remains a user-initiated operation, and the browser hotlinks the CDN URL.
 const uniqueDownloads=[...new Map(choices.filter(x=>x.choice.download_location).map(x=>[x.choice.id,x.choice])).values()];
 await Promise.allSettled(uniqueDownloads.map(c=>fetch(c.download_location,{
  headers:{"Authorization":"Client-ID "+accessKey,"Accept-Version":"v1"},
  signal:AbortSignal.timeout(4500)})));
 return reply(200,{state:search.limited?"rate_limited":"ready",added,failed,
  requested:todo.length,remaining:Math.max(0,targets.length-added),
  featured:featured.length,query_count:search.queries_tried.length,queries:search.queries_tried,
  note:"Event-aware illustrative photography with same-company fallback. Research sources unchanged."});
});
