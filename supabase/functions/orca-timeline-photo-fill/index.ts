import {createClient} from "npm:@supabase/supabase-js@2.57.0";
// Up to two identifiable company photographs; broad business illustrations for every other card. No event/year matching.
const admin=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",{auth:{persistSession:false,autoRefreshToken:false}});
const origin="https://jonfordy5.github.io";
const cors={"Content-Type":"application/json","Access-Control-Allow-Origin":origin,
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-supabase-api-version",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store","Vary":"Origin"};
const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:cors});
function safeUrl(value:unknown,host:string){
 try{const u=new URL(String(value));return u.protocol==="https:"&&u.hostname===host&&!u.username&&!u.password?u.href:null}catch{return null}
}
function originalUrl(value:string){const u=new URL(value);return u.origin+u.pathname}
function creditedUrl(value:unknown){
 const valueUrl=safeUrl(value,"unsplash.com");if(!valueUrl)return null;
 const u=new URL(valueUrl);u.searchParams.set("utm_source","ai_stock_commons_orca");u.searchParams.set("utm_medium","referral");return u.href;
}
const photoVersion=12;
const commonsAgent="ORCA-Timeline/2.0 (https://github.com/jonfordy5/orca-staging)";
function plain(value:unknown){return String(value||"").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g," ").replace(/\s+/g," ").trim()}
function recognizableName(company:string){
 return company.replace(/^The\s+/i,"").replace(/[’‘]/g,"'")
  .replace(/\b(?:Common Stock|Ordinary Shares|Class [A-Z]|Holdings?|Corporation|Incorporated|Company|Limited|Inc|Corp|Ltd|PLC|Co)\b\.?/gi,"")
  .replace(/[, ]+$/g,"").replace(/\s+/g," ").trim();
}
function words(value:string){return plain(value).toLowerCase().replace(/[’‘']/g,"").replace(/[^a-z0-9]+/g," ").trim()}
function brandMatch(title:string,brand:string){
 const text=" "+words(title)+" ",tokens=words(brand).split(" ").filter(Boolean);
 return tokens.length>0&&tokens.every(t=>text.includes(" "+t+" "))&&
  /\b(restaurant|store|storefront|sign|signage|exterior|building|vehicle|car|factory|facility|rocket|station|headquarters|office|aircraft|product|gpu|chip|refinery|supermarket)\b/i.test(title)&&
  !/\b(abandoned|derelict|demolished|vacant|ruins?|closed)\b/i.test(title);
}
function commonsCandidate(page:any,query:string){
 const info=page.imageinfo?.[0],meta=info?.extmetadata||{};
 if(!info||info.mediatype!=="BITMAP"||info.width<600||info.height<350||info.width<info.height)return null;
 const value=(key:string)=>plain(meta[key]?.value);
 const title=plain(page.title)+" "+value("ImageDescription");
 if(unusableImageText(title))return null;
 const license=value("LicenseShortName"),declared=value("UsageTerms");
 const publicDomain=/^(Public domain|CC0)(?:\b|$)/i.test(license)||declared==="Public domain";
 const licenseUrl=String(meta.LicenseUrl?.value||"");
 let licenseLink:string|null=null;
 if(publicDomain)licenseLink=safeUrl(licenseUrl,"creativecommons.org")||"https://creativecommons.org/publicdomain/mark/1.0/";
 else if(/^CC BY(?:-SA)? [1-4]\.0$/i.test(license)&&/^https:\/\/creativecommons\.org\/licenses\/by(?:-sa)?\/[1-4]\.0\/?$/.test(licenseUrl))licenseLink=licenseUrl;
 if(!licenseLink)return null; // Exclude NC/ND, unknown and permission-only licenses.
 const image=safeUrl(info.thumburl||info.url,"upload.wikimedia.org"),full=safeUrl(info.url,"upload.wikimedia.org");
 const source=safeUrl(info.descriptionurl,"commons.wikimedia.org");
 const artist=value("Artist")||value("Credit");
 let authorUrl=source;
 try{
  const href=String(meta.Artist?.value||"").match(/href=["']([^"']+)["']/i)?.[1];
  if(href){const u=new URL(href,"https://commons.wikimedia.org");if(u.protocol==="https:"&&!u.username&&!u.password)authorUrl=u.href;}
 }catch{}
 if(!image||!full||!source||!artist)return null;
 return {id:"commons:"+page.pageid,image_url:image,full_image_url:full,photo_url:source,
  photographer:artist,photographer_url:authorUrl,source_type:"wikimedia_commons",
  license_name:license||declared,license_url:licenseLink,image_hash:info.sha1||null,
  attribution_text:[artist,value("Attribution"),value("Credit"),license||declared,"via Wikimedia Commons; cropped for card display"].filter(Boolean).join(" · "),
  title,query};
}
async function selectCommons(queries:string[],needed:number,usedIds:Set<string>,usedUrls:Set<string>,save:(p:any)=>Promise<boolean>,brand="",usedHashes=new Set<string>()){
 let added=0,requests=0,results=0,status:number|null=null;
 for(const query of queries.slice(0,brand?1:2)){
  // One brand query checks Commons even when Unsplash already found both covers.
  if(!brand&&added>=needed)break;
  const uri=new URL("https://commons.wikimedia.org/w/api.php");
  uri.search=new URLSearchParams({action:"query",generator:"search",gsrsearch:query+" filetype:bitmap -intitle:screenshot -intitle:logo",gsrnamespace:"6",gsrlimit:"12",prop:"imageinfo",iiprop:"url|size|extmetadata|sha1|mediatype",iiurlwidth:"1000",format:"json",formatversion:"2"}).toString();
  let response:Response;
  try{response=await fetch(uri,{headers:{"User-Agent":commonsAgent},signal:AbortSignal.timeout(10000)})}catch{break}
  requests++;status=response.status;if(!response.ok)break;
  const data=await response.json();
  const pages=(data.query?.pages||[]).sort((a:any,b:any)=>(a.index||0)-(b.index||0));
  for(const page of pages){
   if(added>=needed)break;
   results++;
   const p=commonsCandidate(page,query);
   if(!p||brand&&!brandMatch(p.title,brand)||usedIds.has(p.id)||usedUrls.has(originalUrl(p.full_image_url))||p.image_hash&&usedHashes.has(p.image_hash))continue;
   try{
    const check=await fetch(p.image_url,{method:"HEAD",headers:{"User-Agent":commonsAgent},signal:AbortSignal.timeout(4500)});
    if(!check.ok||!check.headers.get("content-type")?.startsWith("image/"))continue;
   }catch{continue}
   if(!await save(p))continue;
   usedIds.add(p.id);usedUrls.add(originalUrl(p.full_image_url));if(p.image_hash)usedHashes.add(p.image_hash);added++;
  }
 }
 return {added,provider_requests_made:requests,provider_results_received:results,provider_http_status:status};
}
function unusableImageText(text:string){
 return /\b(3d render(?:ing)?|ai.generated|illustration|vector art|clip ?art|screenshot|screen shot|software interface|promotional graphic|marketing banner|logo on (?:a )?white background)\b/i.test(text);
}
function candidate(photo:any,query:string){
 const image=safeUrl(photo.urls?.regular,"images.unsplash.com"),full=safeUrl(photo.urls?.raw||photo.urls?.full||photo.urls?.regular,"images.unsplash.com");
 const source=creditedUrl(photo.links?.html),author=creditedUrl(photo.user?.links?.html);
 const download=safeUrl(photo.links?.download_location,"api.unsplash.com");
 const title=[photo.alt_description,photo.description].filter(Boolean).join(" ");
 if(!photo.id||!image||!full||!source||!author||!download||!photo.user?.name||photo.premium||photo.plus)return null;
 if(photo.width<600||photo.height<350||unusableImageText(title))return null;
 // Unsplash's ranked subject search supplies relevance. Sparse metadata is OK.
 return {id:String(photo.id),image_url:image,full_image_url:full,photo_url:source,
  photographer:String(photo.user.name),photographer_url:author,download_location:download,
  title:title.slice(0,600),query};
}
async function businessQueries(ticker:string,company:string,description:string,cached:any){
 if(Array.isArray(cached)&&cached.length)return cached.slice(0,4);
 if(!description.trim())throw Error("company_description_missing");
 const key=Deno.env.get("OPENAI_API_KEY");if(!key)throw Error("subject_service_unconfigured");
 const response=await fetch("https://api.openai.com/v1/responses",{
  method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
  signal:AbortSignal.timeout(25000),body:JSON.stringify({model:"gpt-5.4-mini",store:false,
   reasoning:{effort:"low"},max_output_tokens:500,
   instructions:"From the business description, choose ONE simple physical subject representing what the company primarily does or sells, then three closely related alternatives for stock photography. Use short recognizable search phrases (one to three words), not corporate jargon. Prefer the main product or place: oil refinery, computer chip, electric car, grocery store, steak, hamburger, makeup, warehouse, smartphone, computer. For digital services use the device people use. Do not search company names, historical events, acquisitions, dates, logos, or exact models. Avoid ambiguous single words. No web research. Return four queries in priority order.",
   input:JSON.stringify({company,description}),text:{format:{type:"json_schema",name:"business_photo_subject",strict:true,
    schema:{type:"object",properties:{queries:{type:"array",items:{type:"string"}}},required:["queries"],additionalProperties:false}}}
  })});
 if(!response.ok)throw Error("subject_provider_"+response.status);
 const raw=await response.json();
 const output=raw.output_text||(raw.output||[]).flatMap((p:any)=>(p.content||[]).filter((c:any)=>c.type==="output_text").map((c:any)=>c.text)).join("");
 const queries=[...new Set<string>(JSON.parse(output).queries.map((s:any)=>String(s).trim()).filter((s:string)=>s.length>1&&s.length<65))].slice(0,4);
 if(!queries.length)throw Error("subject_missing");
 const {error}=await admin.from("orca_timeline_photo_jobs").update({queries}).eq("ticker",ticker);
 if(error)throw Error("subject_cache_failed");
 return queries;
}
async function selectPhotos(accessKey:string,queries:string[],needed:number,usedIds:Set<string>,usedUrls:Set<string>,save:(photo:any)=>Promise<boolean>,brand=""){
 let added=0,requests=0,results=0,providerStatus:number|null=null,remaining:number|null=null;
 const tried:string[]=[];
 for(const query of queries.slice(0,4)){
  if(added>=needed)break;
  tried.push(query);
  const uri=new URL("https://api.unsplash.com/search/photos");
  uri.search=new URLSearchParams({query,per_page:"30",orientation:"landscape",content_filter:"high",order_by:"relevant"}).toString();
  const response=await fetch(uri,{headers:{Authorization:"Client-ID "+accessKey,"Accept-Version":"v1"},signal:AbortSignal.timeout(10000)});
  requests++;providerStatus=response.status;
  const rate=response.headers.get("X-Ratelimit-Remaining");remaining=rate===null?null:Number(rate);
  if(!response.ok)break;
  const data=await response.json();
  for(const raw of data.results||[]){
   if(added>=needed)break;
   results++;
   const p=candidate(raw,query);
   if(!p||brand&&!brandMatch(p.title,brand)||usedIds.has(p.id)||usedUrls.has(originalUrl(p.full_image_url)))continue;
   usedIds.add(p.id);usedUrls.add(originalUrl(p.full_image_url));
   // Test the actual cover before committing it; failed URLs leave original art.
   try{
    const check=await fetch(p.image_url,{method:"HEAD",signal:AbortSignal.timeout(4500)});
    if(!check.ok||!check.headers.get("content-type")?.startsWith("image/"))continue;
   }catch{continue}
   if(!await save(p))continue;
   added++;
   // Required by the Unsplash API when a photograph is selected for use.
   try{await fetch(p.download_location,{headers:{Authorization:"Client-ID "+accessKey,"Accept-Version":"v1"},signal:AbortSignal.timeout(4500)})}catch{console.warn("Unsplash download tracking failed",p.id)}
  }
  if(remaining===0)break;
 }
 return {added,queries:tried,provider_requests_made:requests,provider_results_received:results,
  provider_http_status:providerStatus,provider_rate_remaining:remaining};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"POST only"});
 if(req.headers.get("Origin")!==origin)return reply(403,{error:"ORCA staging only"});
 const bearer=(req.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!bearer)return reply(401,{error:"Sign in required"});
 const {data:identity,error:authError}=await admin.auth.getUser(bearer);
 if(authError||!identity?.user)return reply(401,{error:"Invalid sign-in"});
 let body:any;try{body=await req.json()}catch{return reply(400,{error:"Invalid JSON"})}
 const ticker=String(body.ticker||"").trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.]{0,9}$/.test(ticker))return reply(400,{error:"Invalid stock ticker"});
 const {data:profiles,error:profileError}=await admin.from("agent_profiles").select("id").eq("owner_id",identity.user.id).eq("opted_in",true).limit(1);
 if(profileError||!profiles?.length)return reply(403,{error:"Opted-in ORCA researcher required"});
 const token=crypto.randomUUID();
 const {data:locked,error:lockError}=await admin.rpc("orca_timeline_lock_photos",{p_ticker:ticker,p_token:token});
 if(lockError)return reply(503,{error:"Photo cache unavailable"});
 if(!locked)return reply(200,{state:"building",added:0});
 try{
  async function rows(table:string,columns:string){
   const result:any[]=[];
   for(let offset=0;;offset+=250){
    let q=admin.from(table).select(columns).eq("ticker",ticker);
    if(table==="orca_timeline_annotations")q=q.is("created_by",null).neq("category","custom_note").order("event_at");
    const {data,error}=await q.range(offset,offset+249);
    if(error)throw Error("cache_read_failed");
    result.push(...(data||[]));if(!data||data.length<250)return result;
   }
  }
  const events=await rows("orca_timeline_annotations","id");
  if(!events.length)return reply(200,{state:"history_required",added:0,remaining:0});
  const cached=await rows("orca_timeline_photo_selections","*");
  const byEvent=new Map(cached.map(p=>[p.event_id,p]));
  const usedIds=new Set<string>(),usedUrls=new Set<string>(),usedHashes=new Set<string>();
  const targets=events.filter(e=>{
   const p=byEvent.get(e.id);let original="";
   try{original=originalUrl(p?.full_image_url||p?.image_url)}catch{}
   if(!p?.photo_id||!p?.image_url||!original||usedIds.has(p.photo_id)||usedUrls.has(original))return true;
   // Preserve existing distinct photos; brand upgrades replace at most two cards.
   usedIds.add(p.photo_id);usedUrls.add(original);if(p.image_hash)usedHashes.add(p.image_hash);return false;
  });
  const {data:job,error:jobError}=await admin.from("orca_timeline_photo_jobs").select("queries,brand_search_version").eq("ticker",ticker).single();
  if(jobError)throw Error("photo_job_unavailable");
  const checkBrand=Number(job?.brand_search_version||0)<photoVersion;
  if(!targets.length&&!checkBrand)return reply(200,{state:"cached",added:0,remaining:0,photos:events.length,brand_checked:true});
  const {data:profile}=await admin.from("orca_ai_company_profiles").select("company_name,content").eq("ticker",ticker).maybeSingle();
  const description=[profile?.content?.overview,profile?.content?.what_they_do,profile?.content?.business_focus].filter(Boolean).join(" ");
  const queries=await businessQueries(ticker,profile?.company_name||ticker,description,job?.queries);
  const brand=recognizableName(profile?.company_name||"");
  const accessKey=Deno.env.get("UNSPLASH_ACCESS_KEY")||"";
  const existingBranded=cached.filter(p=>p.match_type==="exact_subject"&&p.image_url).length;
  let brandAdded=0,broadAdded=0,saveFailures=0;
  let unsplashAvailable=!!accessKey;
  const replacements=events.filter(e=>!targets.some(t=>t.id===e.id)&&byEvent.get(e.id)?.match_type!=="exact_subject");
  async function savePhoto(p:any,branded:boolean){
   const target=targets[0]||(branded?replacements[0]:null);
   if(!target)return false;
   const old=byEvent.get(target.id);
   const commons=p.source_type==="wikimedia_commons";
   const record:any={event_id:target.id,ticker,photo_id:p.id,image_url:p.image_url,full_image_url:p.full_image_url,
    photo_url:p.photo_url,photographer:p.photographer,photographer_url:p.photographer_url,
    illustrative:true,source_type:commons?"wikimedia_commons":"unsplash_legacy",rights_status:commons?"reuse_verified":"legacy_provider_terms",
    license_name:p.license_name||"Unsplash License",license_url:p.license_url||"https://unsplash.com/license",verified_at:new Date().toISOString(),
    source_page_url:p.photo_url,creator:p.photographer,attribution_text:p.attribution_text||"Photo by "+p.photographer+" on Unsplash",
    match_type:branded?"exact_subject":"contextual",search_query:p.query,query_used:p.query,strategy_version:photoVersion,
    needs_review:false,image_title:p.title,image_hash:p.image_hash||null,match_score:null,relevance_score:null};
   if(old)record.previous_photo=old.previous_photo||old;
   const {error}=await admin.from("orca_timeline_photo_selections").upsert(record,{onConflict:"event_id"});
   if(error){saveFailures++;return false}
   if(targets[0]?.id===target.id)targets.shift();else replacements.shift();
   if(branded)brandAdded++;else broadAdded++;
   return true;
  }
  const brandReports:any[]=[];
  if(checkBrand){
   const desired=Math.max(0,2-existingBranded);
   if(brand&&desired){
    const subject=/restaurant|dining|fast.food/i.test(description)?"restaurant":/retail|stores|supermarket/i.test(description)?"storefront":queries[0];
    if(accessKey){
     for(const query of [brand+" "+subject,brand+" signage"]){
      if(brandAdded>=desired)break;
      const report=await selectPhotos(accessKey,[query],query.endsWith(" signage")?desired-brandAdded:1,usedIds,usedUrls,p=>savePhoto(p,true),brand);
      brandReports.push({provider:"unsplash",query,...report});
      if(report.provider_http_status!==200||report.provider_rate_remaining===0){unsplashAvailable=false;break}
     }
    }
    const report=await selectCommons([brand+" "+subject],desired-brandAdded,usedIds,usedUrls,p=>savePhoto(p,true),brand,usedHashes);
    brandReports.push({provider:"wikimedia_commons",...report});
   }
   // Cache a completed bounded search, including a genuine no-match result.
   // Provider outages remain eligible for an intentional retry.
   const complete=!desired||brandReports.some(r=>r.provider_http_status===200);
   if(complete){
    const {error}=await admin.from("orca_timeline_photo_jobs").update({brand_search_version:photoVersion,brand_diagnostics:{brand,selected:brandAdded,reports:brandReports}}).eq("ticker",ticker);
    if(error)throw Error("brand_status_save_failed");
   }
  }
  let broad:any={added:0,provider_requests_made:0};
  if(targets.length&&unsplashAvailable)broad=await selectPhotos(accessKey,queries,targets.length,usedIds,usedUrls,p=>savePhoto(p,false));
  let commons:any={added:0,provider_requests_made:0};
  if(targets.length)commons=await selectCommons(queries,targets.length,usedIds,usedUrls,p=>savePhoto(p,false),"",usedHashes);
  const added=brandAdded+broadAdded;
  return reply(200,{state:added?"ready":targets.length?"no_matches":"cached",added,brand_added:brandAdded,
   branded_photos:existingBranded+brandAdded,remaining:targets.length,save_failures:saveFailures,
   providers:{branded:brandReports,broad_unsplash:broad,broad_commons:commons},
   note:"Illustrative company and business photographs, not photographs of historical events."});

 }catch(error){return reply(503,{error:error instanceof Error?error.message:"Photo selection failed"})}
 finally{await admin.from("orca_timeline_photo_jobs").update({lock_token:null,locked_until:null}).eq("ticker",ticker).eq("lock_token",token)}
});
