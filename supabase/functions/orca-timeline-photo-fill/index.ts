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
 const brand=({F:"ford",DG:"dollar general",AAP:"advance auto parts",NVDA:"nvidia",ULTA:"ulta",AAPL:"apple",MSFT:"microsoft",INTC:"intel",META:"meta",RKLB:"rocket lab",AMZN:"amazon",WMT:"walmart",TSLA:"tesla"} as Record<string,string>)[ticker]||short||ticker.toLowerCase();
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
 // "Ford" returns real cars and models; "Ford Motor" unnecessarily loses results.
 if(ticker==="F")return {brand:"ford",theme:"automotive",
  terms:["car","cars","truck","pickup","vehicle","automotive","mustang","bronco","f150","f-150","model t","classic car","logo","electric"],
  queries:["ford","ford mustang","ford truck","ford model t"]};
 // For Rocket Lab use beautiful, distinct photographic rockets as
 // illustrations when company-specific event photography is unavailable.
 if(ticker==="RKLB")return {brand:"rocket lab",theme:"aerospace",
  terms:["rocket","launch","liftoff","spacecraft","satellite","spaceflight","launchpad","space"],
  queries:["rocket","rocket launch","rocket liftoff","space rocket","launch pad"]};
 // Branded company/brand searches before generic visual context.
 if(ticker==="AMZN")return {brand:"amazon",theme:"amazon commerce",
  terms:["amazon","prime","kindle","aws","whole foods","zappos","souq",
   "warehouse","delivery","pickup","returns","fulfillment","logo",
   "packages","e-commerce","online","truck","cloud","bookstore"],
  queries:["amazon","amazon delivery","whole foods market",
   "amazon kindle","amazon prime","amazon warehouse"]};
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
// AAP photos may show distinct auto parts or automotive components even when
// their metadata lacks the company name. Do not confuse car photos with parts.
function aapPartsSubject(text:string):boolean{
 const competitor=/\b(autozone|o'?reilly|napa auto|pep boys|lordco|repco|autobarn|autodoc|autoparts24|europarts)\b/i;
 const unrelated=/\b(scrap(?:yard)?|junk(?:yard)?|salvage|wreck(?:age)?|crash(?:ed)?|collision|racing?|car show|car wash|dealership|factory|assembly line|welding|industrial robots|aircraft|airplane|marine engine)\b/i;
 const parts=/\b(auto parts?|car parts?|automotive parts?|spare parts?|parts store|auto supply|auto accessories|engine(?: bay| block| compartment| parts?| components?)?|car batteries|car battery|automotive batter(?:y|ies)|brake(?:s| pads?| discs?| rotors?| calipers?)?|oil filters?|air filters?|fuel filters?|spark plugs?|alternators?|radiators?|pistons?|camshafts?|crankshafts?|timing belts?|serpentine belts?|transmissions?|carburetors?|vehicle parts?|car components?|wheel bearings?|suspensions?|windshield wipers?|motor oil|car motor)\b/i;
 const acquired=/\b(carquest|worldpac|diehard)\b/i.test(text)&&/\b(auto|car|automotive|part|store|retail|battery|batteries|brand|product|logo)\b/i.test(text);
 return !competitor.test(text)&&!unrelated.test(text)&&(parts.test(text)||acquired||/\badvance auto parts\b/i.test(text));
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
  const genuineBrand=/\badvance auto parts\b/i.test(description);
  const acquired=/\b(carquest|worldpac|diehard)\b/i.test(description);
  if(!aapPartsSubject(description))return -100;
  return (genuineBrand?25:0)+(acquired?18:0)+
   (/\b(auto parts|car parts|parts store|auto supply|shelves|retail)\b/i.test(description)?12:0)+
   (/\b(engine|brake|battery|spark plug|filter|alternator|radiator)\b/i.test(description)?9:0)+8;
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
 source_type?:"wikimedia_commons";license_name?:string;license_url?:string;verified_at?:string;
};
// Industry words do not establish company identity. Keep the complete brand phrase.
function companyPhotoIdentity(title:string,profile:ThemeProfile):boolean{
 const clean=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
 const description=" "+clean(title)+" ";
 const brand=clean(profile.brand);
 if(!brand||!description.includes(" "+brand+" "))return false;
 // A Ford vehicle, named model or Ford logo is company imagery; a Ford
 // bridge, town or surname without automotive context is not.
 if(brand==="ford")return /\b(car|cars|automobile|automotive|vehicle|vehicles|truck|trucks|pickup|mustang|bronco|f150|f 150|f250|f 250|model t|engine|grille|logo|badge|classic|raptor|ranger|fiesta|focus|explorer|gt|suv|factory)\b/.test(description);
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
 // For a named acquired business, use THAT brand, not unrelated storefronts.
 if(profile.brand==="amazon"){
  if(/\bwhole foods\b/.test(title))
   return {kind:"amazon_whole_foods",queries:["whole foods market","amazon whole foods","amazon"],terms:["whole foods","amazon","market","grocery"]};
  if(/\bzappos\b/.test(title))
   return {kind:"amazon_zappos",queries:["zappos","amazon zappos","amazon"],terms:["zappos","amazon","shoes"]};
  if(/\bsouq\b/.test(title))
   return {kind:"amazon_souq",queries:["souq amazon","amazon","souq"],terms:["souq","amazon","marketplace"]};
  if(/\bkindle\b/.test(title))
   return {kind:"amazon_kindle",queries:["amazon kindle","kindle e-reader","amazon"],terms:["kindle","e-reader","ebook","amazon"]};
  if(/\bprime\b/.test(title))
   return {kind:"amazon_prime",queries:["amazon prime","amazon delivery","amazon"],terms:["prime","delivery","packages","amazon"]};
  return {kind:"amazon_company",queries:["amazon","amazon delivery","amazon warehouse"],terms:["amazon","delivery","warehouse","logo","fulfillment","aws"]};
 }
 if(profile.brand==="rocket lab")
  return {kind:"rocket_illustration",queries:["rocket","rocket launch","rocket liftoff","space rocket"],
   terms:["rocket","launch","liftoff","spacecraft","satellite","launch pad"]};
 // Named acquired AAP brands qualify for their own historical milestones.
 if(profile.brand==="advance auto parts"){
  if(/\b(carquest|worldpac)\b/.test(title))return {kind:"aap_carquest",queries:["carquest auto parts","worldpac automotive parts","advance auto parts store"],terms:["carquest","worldpac","auto parts"]};
  if(/\bdiehard\b/.test(title))return {kind:"aap_diehard",queries:["diehard car battery","diehard automotive batteries","advance auto parts store"],terms:["diehard","car battery","automotive battery"]};
  return {kind:"aap_general",queries:["advance auto parts store","auto parts store","car battery"],terms:["advance auto parts","auto parts","car battery","brake pads"]};
 }
 // Ford photos should represent the named vehicle or company era. Other
 // companies still use their existing event-specific plans.
 if(profile.brand==="ford"){
  if(/\b(mustang|mach[- ]?e)\b/.test(title))
   return {kind:"ford_mustang",queries:["ford","ford mustang","ford mustang mach e"],terms:["ford","mustang","mach e","mach-e","coupe"]};
  if(/\b(f[- ]?150|lightning|pickup|truck)\b/.test(title))
   return {kind:"ford_truck",queries:["ford","ford truck","ford f150"],terms:["ford","truck","pickup","f150","f-150","lightning"]};
  if(/\b(found|model t|assembly line|highland park|1949 ford|vintage|original)\b/.test(title))
   return {kind:"ford_vintage",queries:["ford","ford model t","vintage ford car"],terms:["ford","model t","vintage","classic","antique","old car"]};
  return {kind:"ford_brand",queries:["ford","ford car","ford truck"],terms:["ford","car","truck","vehicle","logo"]};
 }
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
 // The high-coverage primary query is simply "ford", just as a person
 // would type into Unsplash, followed by model/era variants for diversity.
 if(profile.brand==="ford")return [
  "ford","ford mustang","ford truck","ford model t","ford f150","ford bronco"
 ];
 if(profile.brand==="amazon")return [
  "amazon","amazon delivery","whole foods market","amazon whole foods",
  "amazon kindle","amazon prime","amazon warehouse","zappos","souq amazon"
 ];
 if(profile.brand==="rocket lab")return [
  "rocket","rocket launch","rocket liftoff","space rocket","rocket launchpad"
 ];
 if(profile.brand==="advance auto parts")return [
  "advance auto parts store","car engine","car parts",
  "automotive brake pads","car battery","oil filter",
  "alternator car part","spare auto parts","carquest auto parts","diehard car battery"
 ];
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
// Generic rockets may illustrate Rocket Lab milestones, but never imply an
// exact image of the event. Reject toys, cartoons and unrelated homonyms.
function rocketPhotoSubject(text:string):boolean{
 const irrelevant=/\b(rocket league|rocket salad|arugula|rocket stove|water rocket|bottle rocket|toy rockets?|model rockets?|paper rocket|cartoon|drawing|vector|clipart|illustration|graphic design|logo|sticker|video game|fireworks|firecracker)\b/i;
 const rocket=/\b(rocket(?:s)?|launch vehicle|space launch|spacecraft launch|rocketship|rocket ship|space shuttle|launchpad|launch pad|liftoff|lift-off)\b/i;
 return !irrelevant.test(text)&&rocket.test(text);
}
function eventContextMatch(description:string,plan:EventVisualPlan):boolean{
 const text=description.toLowerCase();
 switch(plan.kind){
  case "rocket_illustration":return rocketPhotoSubject(text);
  case "aap_carquest":return /\b(carquest|worldpac)\b/.test(text)&&/\b(auto|automotive|parts?|store|retail|distribution)\b/.test(text);
  case "aap_diehard":return /\bdiehard\b/.test(text)&&/\b(battery|batteries|car|auto|automotive)\b/.test(text);
  case "aap_general":return aapPartsSubject(text);
  case "amazon_whole_foods":return /\bwhole foods(?: market)?\b/.test(text);
  case "amazon_zappos":return /\bzappos\b/.test(text);
  case "amazon_souq":return /\bsouq\b/.test(text);
  case "amazon_kindle":return /\b(kindle|e[- ]reader)\b/.test(text);
  case "amazon_prime":return /\bamazon prime\b/.test(text);
  case "amazon_company":return /\bamazon\b/.test(text)&&
   /\b(delivery|warehouse|logo|building|headquarters|pickup|returns|fulfillment|aws|packages?|cloud|store|truck)\b/.test(text);
  case "ford_mustang":return /\b(mustang|mach[- ]?e)\b/.test(text);
  case "ford_truck":return /\b(truck|pickup|f[- ]?150|lightning|raptor)\b/.test(text);
  case "ford_vintage":return /\b(model t|vintage|classic|antique|old car|191\d|192\d|1949)\b/.test(text);
  case "ford_brand":return /\b(ford|mustang|bronco|f[- ]?150|car|truck|automotive)\b/.test(text);
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
 // A generic storefront is not a company's M&A announcement.
 if(plan.kind==="rocket_illustration"&&!rocketPhotoSubject(desc))return -Infinity;
 if(plan.kind==="corporate"&&!candidate.company_match)return -Infinity;
 // Acquired-brand subjects are reserved for their matching AAP event.
 if(plan.kind==="aap_general"&&/\b(carquest|worldpac|diehard)\b/.test(desc))return -Infinity;
 if(plan.kind==="aap_carquest"&&/\bdiehard\b/.test(desc))return -Infinity;
 if(plan.kind==="aap_diehard"&&/\b(carquest|worldpac)\b/.test(desc))return -Infinity;
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
 if(profile.theme==="auto parts retail"&&/\b(lordco|autozone|o'?reilly|napa auto|pep boys)\b/i.test(description))return null;
 if(profile.theme==="auto parts retail"&&offThemeAuto.test(description))return null;
 let score=photoScore(p,{companyOnly:tier===0&&profile.theme!=="auto parts retail"&&profile.brand!=="rocket lab",minimumScore:0,keywords:profile.terms},profile);
 // Do not accept off-brand results at any fallback tier.
 if(score<0&&profile.theme==="discount retail"&&
  /\b(stock exchange|wall street|business meeting|corporate office)\b/i.test(query)&&
  /\b(stock exchange|wall street|trading floor|boardroom|conference room|business meeting|office building|corporate office)\b/i.test(description)&&
  !/\b(banknotes?|cash|dollar bills?|coins?|currency|bitcoin|money|forex|bank teller|walmart|target|dollar tree|family dollar)\b/i.test(description))score=12;
 const context_kinds=[...new Set(plans.filter(plan=>(plan.queries.includes(query)||["advance auto parts","rocket lab"].includes(profile.brand))&&eventContextMatch(description,plan)).map(p=>p.kind))];
 // Compute scene relevance before checking it. The previous order caused a ReferenceError.
 const retail_illustration=(profile.theme==="discount retail"&&
   /\b(convenience stores?|convenience shops?|grocery stores?|supermarkets?|discount stores?|retail shelves|store shelves|shopping aisles|grocery aisles|retail storefront|storefront)\b/i.test(description))||
   (profile.theme==="auto parts retail"&&aapPartsSubject(description));
 if(profile.brand==="rocket lab"&&!rocketPhotoSubject(description))return null;
 if(score<0&&!context_kinds.length&&!retail_illustration)return null;
 const company_match=companyPhotoIdentity(description,profile);
 // A named acquired business may be shown for its own event, but a random
 // store or market is not a legitimate Amazon photograph.
 if(profile.brand==="amazon"&&!company_match&&
    !context_kinds.some(kind=>["amazon_whole_foods","amazon_zappos","amazon_souq","amazon_kindle","amazon_prime"].includes(kind)))
  return null;
 const venue=photoVenue(description);
 if(!company_match&&!venue&&!context_kinds.length&&!retail_illustration)return null;
 return {id,image_url:url,full_image_url:full,photographer,photographer_url,
  photo_url,download_location:download,title:description.slice(0,300),query,tier,company_match,venue,context_kinds,retail_illustration,
  score:Math.max(0,score)+Math.max(0,5-tier)*8+Math.min(Number(p.likes||0)/500,2)};
}
// Provider diagnostics: numeric metadata only; never expose application keys or user credentials.
type ProviderMeta={http_status:number|null;rate_limit:number|null;rate_remaining:number|null;retry_after_seconds:number|null};
function numericHeader(value:string|null):number|null{
 if(value===null||!/^\d{1,10}$/.test(value))return null;
 const n=Number(value);
 return Number.isSafeInteger(n)?n:null;
}
function providerMeta(response:Response):ProviderMeta{
 return {http_status:response.status,
  rate_limit:numericHeader(response.headers.get("X-Ratelimit-Limit")),
  rate_remaining:numericHeader(response.headers.get("X-Ratelimit-Remaining")),
  retry_after_seconds:numericHeader(response.headers.get("Retry-After"))};
}
function providerMeaning(status:number|null):string{
 return status===200?"ok":status===400?"bad_request":status===401?"invalid_key":
  status===402?"payment_required":status===403?"forbidden":status===429?"rate_limited":
  status===null?"network_error":status>=500?"provider_error":"unexpected_status";
}
function recordUnsplash(mode:string,query:string,page:number,meta:ProviderMeta,results:number|null){
 console.info("ORCA_UNSPLASH_DIAG",JSON.stringify({
  mode,query,page,http_status:meta.http_status,rate_limit:meta.rate_limit,
  rate_remaining:meta.rate_remaining,retry_after_seconds:meta.retry_after_seconds,results}));
}
async function diagnosticUnsplash(key:string,ticker:string){
 // Only one API GET; no photo downloads and no database writes.
 const query=ticker==="DG"?"convenience store":ticker.toLowerCase();
 const uri=new URL("https://api.unsplash.com/search/photos");
 uri.searchParams.set("query",query);uri.searchParams.set("per_page","1");
 uri.searchParams.set("orientation","landscape");uri.searchParams.set("order_by","relevant");
 uri.searchParams.set("content_filter","high");
 try{
  const response=await fetch(uri.toString(),{headers:{"Authorization":"Client-ID "+key,"Accept-Version":"v1"},
   signal:AbortSignal.timeout(8500)});
  const health=providerMeta(response);
  let results:number|null=null;
  if(response.ok){
   try{
    const body=await response.json();
    results=Array.isArray(body?.results)?body.results.length:null;
   }catch{}
  }
  recordUnsplash("probe",query,1,health,results);
  return {state:"diagnostic",provider:"Unsplash",query,requests_made:1,...health,
   meaning:providerMeaning(health.http_status),results_returned:results,photo_records_changed:0};
 }catch{
  const health:ProviderMeta={http_status:null,rate_limit:null,rate_remaining:null,retry_after_seconds:null};
  recordUnsplash("probe",query,1,health,null);
  return {state:"diagnostic",provider:"Unsplash",query,requests_made:1,...health,
   meaning:"network_error",results_returned:null,photo_records_changed:0};
 }
}
// A single brand search usually provides many possible images. Do not spend
// nine requests upfront: assess actual milestone coverage after EACH result.
const maxSearchRequestsPerFill=3;
function unfilledAfterPreview(events:any[],pool:Candidate[],alreadyUsed:Set<string>,
 profile:ThemeProfile,existingPhotographers:Map<string,number>):any[]{
 const used=new Set(alreadyUsed),photographers=new Map(existingPhotographers);
 const missing:any[]=[];
 for(const event of events){
  const match=pickCandidate(pool,used,photographers,eventVisualPlan(event,profile));
  if(!match){missing.push(event);continue}
  used.add(match.id);
  photographers.set(match.photographer,(photographers.get(match.photographer)||0)+1);
 }
 return missing;
}
async function findUnsplashCandidates(accessKey:string,queries:string[],profile:ThemeProfile,
 plans:EventVisualPlan[],events:any[]=[],alreadyUsed=new Set<string>(),
 existingPhotographers=new Map<string,number>()):Promise<{candidates:Candidate[],limited:boolean,queries_tried:string[],provider_last:ProviderMeta|null,provider_failure:ProviderMeta|null,requests_made:number,results_received:number,network_failures:number}>{
 const byId=new Map<string,Candidate>(),tried=new Set<string>();
 const triedList:string[]=[];
 let limited=false,provider_last:ProviderMeta|null=null,provider_failure:ProviderMeta|null=null;
 let requests_made=0,results_received=0,network_failures=0;
 const brandQuery=queries[0]||profile.brand;
 let nextQuery:string|null=brandQuery;
 const requestBudget=["advance auto parts","rocket lab"].includes(profile.brand)?8:maxSearchRequestsPerFill;
 while(nextQuery&&requests_made<requestBudget){
  const query=nextQuery;tried.add(query);triedList.push(query);
  const uri=new URL("https://api.unsplash.com/search/photos");
  uri.searchParams.set("query",query);
  uri.searchParams.set("page","1");
  uri.searchParams.set("per_page","30");
  uri.searchParams.set("orientation","landscape");
  uri.searchParams.set("order_by","relevant");
  uri.searchParams.set("content_filter","high");
  requests_made++;
  try{
   const response=await fetch(uri.toString(),{headers:{"Authorization":"Client-ID "+accessKey,"Accept-Version":"v1"},
    signal:AbortSignal.timeout(8500)});
   const health=providerMeta(response);
   provider_last=health;
   if(!response.ok){
    recordUnsplash("fill",query,1,health,null);
    provider_failure??=health;
    if([401,402,403,429].includes(response.status)){limited=response.status===429;break}
   }else{
    const json=await response.json();
    const results=Array.isArray(json.results)?json.results:[];
    results_received+=results.length;
    recordUnsplash("fill",query,1,health,results.length);
    for(const p of results){
     try{
      const c=candidateFromUnsplash(p,query,triedList.length-1,profile,plans);
      if(c&&(!byId.has(c.id)||c.score>(byId.get(c.id)?.score||0)))byId.set(c.id,c);
     }catch{console.warn("ORCA_UNSPLASH_BAD_PHOTO_METADATA")}
    }
    if(health.rate_remaining===0){limited=true;break}
   }
  }catch{
   network_failures++;
   const unavailable:ProviderMeta={http_status:null,rate_limit:null,rate_remaining:null,retry_after_seconds:null};
   provider_failure??=unavailable;
   recordUnsplash("fill",query,1,unavailable,null);
  }
  const pool=[...byId.values()].sort((a,b)=>b.score-a.score);
  const missing=unfilledAfterPreview(events,pool,alreadyUsed,profile,existingPhotographers);
  if(!missing.length)break; // One call is enough when every event has a unique image.
  // Search only for still-unmatched milestones; prefer the actual company,
  // model or acquired-brand phrase from those events over generic categories.
  // AAP explicitly prefers different generic car-parts images rather than blanks.
   const possible=["advance auto parts","rocket lab"].includes(profile.brand)?
    [...queries,...missing.flatMap(e=>eventVisualPlan(e,profile).queries)]:
    [...missing.flatMap(e=>eventVisualPlan(e,profile).queries),...queries];
   nextQuery=possible.find(q=>q&&!tried.has(q))||null;
 }
 return {candidates:[...byId.values()].sort((a,b)=>b.score-a.score),limited,
  queries_tried:triedList,provider_last,provider_failure,requests_made,results_received,network_failures};
}

type CommonsPhoto=Candidate&{source_type:"wikimedia_commons";license_name:string;license_url:string;verified_at:string};
const commonsQueries:Record<string,string[]>={
 DG:["Dollar General store","Dollar General storefront","Dollar General retail","discount retail shelves"],
 MSFT:["Microsoft Altair 8800","Microsoft headquarters","Microsoft campus","Microsoft logo","Microsoft computer","Microsoft office"],
 ULTA:["Ulta Beauty store","Ulta Beauty storefront","Ulta cosmetics","cosmetics beauty store"],
 RKLB:["Rocket Lab Electron","Rocket Lab launch","Rocket Lab Photon","Rocket Lab CAPSTONE","Rocket Lab Neutron","Electron rocket launch","Rocket Lab space"]
};
function cleanCommons(v:any){return String(v||"").replace(/<[^>]*>/g," ").replace(/&(?:amp|nbsp|quot|#39);/g," ").replace(/\s+/g," ").trim().slice(0,300)}
function fromCommons(page:any,ticker:string,query:string):CommonsPhoto|null{
 const i=page?.imageinfo?.[0];if(!i)return null;
 const desc=(String(page.title||"")+" "+cleanCommons(i.extmetadata?.ImageDescription?.value)).toLowerCase();
 const brands:Record<string,RegExp>={DG:/\bdollar general\b/,MSFT:/\bmicrosoft\b/,ULTA:/\bulta(?: beauty)?\b/,RKLB:/\brocket lab\b/};
 const related:Record<string,RegExp>={DG:/\bdiscount (?:store|retail)\b/,MSFT:/\b(altair 8800|windows computer)\b/,ULTA:/\b(cosmetics store|makeup products|beauty retail)\b/,RKLB:/\b(electron rocket|rocket launch|rocket booster|spacecraft|satellite)\b/};
 if(!brands[ticker]||(!brands[ticker].test(desc)&&!related[ticker].test(desc)))return null;
 if(/\b(dollar tree|family dollar|autozone|sephora|wreckage|toy rocket|model rocket)\b/.test(desc))return null;
 const license=cleanCommons(i.extmetadata?.LicenseShortName?.value);
 if(!/^(?:CC BY(?:-SA)? \d\.\d|CC0(?: 1\.0)?|Public domain|PD[- ][A-Za-z0-9 -]+)$/i.test(license))return null;
 let licenseUrl=String(i.extmetadata?.LicenseUrl?.value||"");
 if(!licenseUrl){
  const version=(license.match(/\d\.\d/)||[])[0];
  licenseUrl=/^CC0\b/i.test(license)?"https://creativecommons.org/publicdomain/zero/1.0/":
   /^(?:Public domain|PD[- ])/i.test(license)?"https://creativecommons.org/publicdomain/mark/1.0/":
   version?"https://creativecommons.org/licenses/"+(/^CC BY-SA/i.test(license)?"by-sa/":"by/")+version+"/":"";
 }
 const safe=(v:string,host:string)=>{try{const u=new URL(v);return u.protocol==="https:"&&u.hostname===host&&!u.username&&!u.password}catch{return false}};
 const thumb=String(i.thumburl||i.url||""),full=String(i.url||""),source=String(i.descriptionurl||"");
 if(!safe(thumb,"upload.wikimedia.org")||!safe(full,"upload.wikimedia.org")||
  !safe(source,"commons.wikimedia.org")||!safe(licenseUrl,"creativecommons.org")||
  !/\.(?:jpg|jpeg|png|webp)$/i.test(String(page.title||""))||!Number.isInteger(page.pageid))return null;
 const creator=cleanCommons(i.extmetadata?.Artist?.value)||String(i.user||"Wikimedia Commons contributor").slice(0,120);
 return {id:"commons:"+page.pageid,image_url:thumb,full_image_url:full,photo_url:source,
  photographer:creator.slice(0,120),photographer_url:source,download_location:"",
  title:desc.slice(0,300),query,tier:0,score:brands[ticker].test(desc)?110:40,
  company_match:brands[ticker].test(desc),source_type:"wikimedia_commons",
  license_name:license,license_url:licenseUrl,verified_at:new Date().toISOString()};
}
async function findCommons(ticker:string,needed:number):Promise<CommonsPhoto[]>{
 const pool=new Map<string,CommonsPhoto>();
 if(!commonsQueries[ticker]||!needed)return [];
 for(const query of commonsQueries[ticker].slice(0,7)){
  const u=new URL("https://commons.wikimedia.org/w/api.php");
  for(const [k,v] of Object.entries({action:"query",format:"json",formatversion:"2",generator:"search",gsrsearch:query,
   gsrnamespace:"6",gsrlimit:"20",prop:"imageinfo",iiprop:"url|extmetadata|user",iiurlwidth:"900",
   iiextmetadatafilter:"LicenseShortName|LicenseUrl|Artist|ImageDescription"}))u.searchParams.set(k,v);
  try{
   const r=await fetch(u.href,{headers:{"Accept":"application/json","User-Agent":"ORCA-Stock-Commons/1.0 (https://jonfordy5.github.io/orca-staging/)"},
    signal:AbortSignal.timeout(7000)});
   if(!r.ok)continue;const d=await r.json();
   for(const page of (Array.isArray(d?.query?.pages)?d.query.pages:[])){
    const p=fromCommons(page,ticker,query);if(p)pool.set(p.id,p);
   }
  }catch{console.warn("ORCA_COMMONS_LOOKUP_FAILED",ticker)}
  if(pool.size>=needed+8)break;
 }
 return [...pool.values()];
}
function chooseCommons(pool:CommonsPhoto[],event:any,reserved:Set<string>):CommonsPhoto|null{
 const title=String(event.title||"").toLowerCase();
 const score=(p:CommonsPhoto)=>{
  let n=p.score;
  for(const term of ["rocket","electron","neutron","photon","capstone","altair","microsoft","ulta","dollar general","store","launch","computer","nasdaq"])
   if(title.includes(term)&&p.title.includes(term))n+=25;
  return n;
 };
 return pool.filter(p=>!reserved.has(p.id)).sort((a,b)=>score(b)-score(a))[0]||null;
}
// Database constraint "orca_timeline_photo_selections_relevance_check" only allows
// exact_event, exact_subject, contextual and rejected. Detailed ranking stays in
// memory, but persisted labels must obey that existing contract.
function storedMatchType(choice:Candidate):"exact_subject"|"contextual"{
 return choice.company_match?"exact_subject":"contextual";
}
function pickCandidate(pool:Candidate[],reserved:Set<string>,photographerCounts:Map<string,number>,plan:EventVisualPlan):Candidate|null{
 const available=pool.filter(p=>!reserved.has(p.id)&&Number.isFinite(eventCandidateScore(p,plan)));
 if(!available.length)return null;
 available.sort((a,b)=>(eventCandidateScore(b,plan)-(photographerCounts.get(b.photographer)||0)*5)-
  (eventCandidateScore(a,plan)-(photographerCounts.get(a.photographer)||0)*5));
 return available[0];
}

const maximumPerCall=15;
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

 // The authorized diagnostic is intentionally independent of all photo caches.
 if(body?.diagnostic===true){
  const accessKey=Deno.env.get("UNSPLASH_ACCESS_KEY");
  if(!accessKey)return reply(503,{state:"diagnostic",provider:"Unsplash",meaning:"missing_access_key",
   http_status:null,rate_limit:null,rate_remaining:null,requests_made:0,photo_records_changed:0});
  return reply(200,await diagnosticUnsplash(accessKey,ticker));
 }
 const {count,error:countError}=await admin.from("orca_timeline_photo_selections")
   .select("event_id",{head:true,count:"exact"}).gte("created_at",new Date(Date.now()-86400000).toISOString());
 if(countError)return reply(503,{error:"Photo cache unavailable"});
 // Page all saved events; photo requests stay limited to ten new matches.
 const all:any[]=[];
 for(let offset=0;;offset+=250){
  const {data:page,error:eventError}=await admin.from("orca_timeline_annotations")
   .select("id,ticker,title,event_at,category").eq("ticker",ticker).is("created_by",null)
   .order("event_at",{ascending:true}).range(offset,offset+249);
  if(eventError)return reply(503,{error:"Milestone lookup unavailable"});
  all.push(...(page||[]));
  if(!page||page.length<250)break;
 }
 // Photo work is batched, but the underlying timeline has no maximum length.
 // Process up to ten missing images per click across ALL saved events.
 const featured=all;
 const {data:stock,error:stockError}=await admin.from("stocks").select("company_name").eq("ticker",ticker).maybeSingle();
 if(stockError||!stock?.company_name)return reply(404,{error:"Unknown company"});
 const {data:companyProfile}=await admin.from("orca_ai_company_profiles").select("content")
  .eq("ticker",ticker).maybeSingle();
 const profile=companyTheme(ticker,String(stock.company_name),
  String(companyProfile?.content?.what_they_do||companyProfile?.content?.overview||""));
 const cached:any[]=[];
 for(let offset=0;;offset+=250){
  const {data:page,error:cachedError}=await admin.from("orca_timeline_photo_selections")
   .select("event_id,photo_id,needs_review,photographer,full_image_url").eq("ticker",ticker)
   .range(offset,offset+249);
  if(cachedError)return reply(503,{error:"Photo cache unavailable"});
  cached.push(...(page||[]));
  if(!page||page.length<250)break;
 }
 const existing=new Map(cached.map((p:any)=>[p.event_id,p]));
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
 const todo=targets.slice(0,Math.min(maximumPerCall,remainingDaily));
 const accessKey=Deno.env.get("UNSPLASH_ACCESS_KEY");
 if(!accessKey)return reply(503,{error:"Unsplash access key is not configured"});
 const plans=featured.map((e:any)=>eventVisualPlan(e,profile));
 const reserved=new Set((cached||[]).filter((p:any)=>!p.needs_review&&p.photo_id).map((p:any)=>p.photo_id));
 const photographers=new Map<string,number>();
 for(const p of cached||[])photographers.set(p.photographer,(photographers.get(p.photographer)||0)+1);
 const search=await findUnsplashCandidates(accessKey,visualQueries(profile,featured),profile,
  plans,todo,reserved,photographers);
 let added=0,failed=0,saveFailures=0;
 const choices: {event_id:string,choice:Candidate}[]=[];
 const savedChoices:Candidate[]=[];
 for(const e of todo){
  const found=pickCandidate(search.candidates,reserved,photographers,eventVisualPlan(e,profile));
  if(!found){failed++;continue}
  reserved.add(found.id);
  photographers.set(found.photographer,(photographers.get(found.photographer)||0)+1);
  choices.push({event_id:e.id,choice:found});
 }
 // Wikimedia Commons rescue for missing slots; keep all existing distinct photos.
 if(commonsQueries[ticker]){
  const pending=todo.filter(e=>!choices.some(c=>c.event_id===e.id));
  const pool=await findCommons(ticker,pending.length);
  const reservedUrls=new Set<string>((cached||[]).map((p:any)=>String(p.full_image_url||"")).filter(Boolean));
  for(const item of choices)reservedUrls.add(item.choice.full_image_url);
  for(const event of pending){
   const candidates=pool.filter(p=>!reservedUrls.has(p.full_image_url));
   const choice=chooseCommons(candidates,event,reserved);if(!choice)continue;
   choices.push({event_id:event.id,choice});reserved.add(choice.id);
   reservedUrls.add(choice.full_image_url);failed=Math.max(0,failed-1);
  }
 }
 // Never recycle one photo across different milestones.
 // Unmatched events stay pending so another broad company-first search can
 // supply a distinct photo. Ten duplicate cards are NOT a successful result.
 for(const {event_id,choice} of choices){
  const duplicated=choices.some(x=>x.event_id!==event_id&&x.choice.id===choice.id)||
   (cached||[]).some((p:any)=>p.event_id!==event_id&&p.photo_id===choice.id&&!p.needs_review);
  if(duplicated){failed++;continue}
  const matchType=storedMatchType(choice);
  const {error:saveError}=await admin.from("orca_timeline_photo_selections").upsert({
   event_id,ticker,photo_id:choice.id,image_url:choice.image_url,
   full_image_url:choice.full_image_url,photographer:choice.photographer,
   photographer_url:choice.photographer_url,photo_url:choice.photo_url,illustrative:true,
   source_type:("source_type" in choice?choice.source_type:"unsplash_legacy"),
   rights_status:("source_type" in choice?"reuse_verified":"legacy_provider_terms"),
   ...("source_type" in choice?{license_name:choice.license_name,license_url:choice.license_url,verified_at:choice.verified_at}:{}),
   match_type:matchType,search_query:choice.query,query_used:choice.query,
   strategy_version:10,needs_review:false,created_at:new Date().toISOString(),
   image_title:choice.title,
   match_score:Math.round(choice.score),relevance_score:Math.min(100,Math.round(choice.score)),
   attribution_text:("source_type" in choice?"Image by "+choice.photographer+" via Wikimedia Commons":"Photo by "+choice.photographer+" on Unsplash"),
   source_page_url:choice.photo_url,creator:choice.photographer
  },{onConflict:"event_id"});
  if(saveError){
   failed++;saveFailures++;
   // Don't silently reinterpret a SQL check violation as an irrelevant photo.
   // Log only the SQLSTATE and public ticker, never credentials or photo URLs.
   console.error("ORCA_TIMELINE_PHOTO_SAVE_FAILED",JSON.stringify({
    ticker,code:String(saveError.code||"unknown").slice(0,16)}));
   continue;
  }
  savedChoices.push(choice);
  added++;
 }
 // Every accepted photo is counted as an Unsplash selection/download event.
 // This remains a user-initiated operation, and the browser hotlinks the CDN URL.
 const uniqueDownloads=[...new Map(savedChoices.filter(x=>x.download_location).map(x=>[x.id,x])).values()];
 await Promise.allSettled(uniqueDownloads.map(c=>fetch(c.download_location,{
  headers:{"Authorization":"Client-ID "+accessKey,"Accept-Version":"v1"},
  signal:AbortSignal.timeout(4500)})));
 const commonsAdded=savedChoices.filter(c=>c.source_type==="wikimedia_commons").length;
 const upstream=search.provider_failure||search.provider_last;
 return reply(200,{state:added>0?"ready":saveFailures>0?"save_failed":search.provider_failure?.http_status===429?"rate_limited":search.provider_failure?"provider_error":search.limited?"rate_limited":"no_matches",added,failed,save_failures:saveFailures,
  requested:todo.length,remaining:Math.max(0,targets.length-added),
  featured:featured.length,query_count:search.queries_tried.length,queries:search.queries_tried,
  provider_http_status:upstream?.http_status??null,provider_meaning:providerMeaning(upstream?.http_status??null),
  provider_rate_limit:search.provider_last?.rate_limit??null,provider_rate_remaining:search.provider_last?.rate_remaining??null,
  provider_requests_made:search.requests_made,provider_results_received:search.results_received,
  provider_eligible_candidates:search.candidates.length,photo_choices:choices.length,
  provider_network_failures:search.network_failures,commons_added:commonsAdded,
  note:"Photos are illustrative with linked source and license; historical research sources remain unchanged."});
});
