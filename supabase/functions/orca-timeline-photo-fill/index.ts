import {createClient} from "npm:@supabase/supabase-js@2.57.0";
// Business illustrations only. Milestone titles, dates and brands never rank photos.
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
function candidate(photo:any,query:string){
 const image=safeUrl(photo.urls?.regular,"images.unsplash.com"),full=safeUrl(photo.urls?.raw||photo.urls?.full||photo.urls?.regular,"images.unsplash.com");
 const source=creditedUrl(photo.links?.html),author=creditedUrl(photo.user?.links?.html);
 const download=safeUrl(photo.links?.download_location,"api.unsplash.com");
 const title=[photo.alt_description,photo.description].filter(Boolean).join(" ");
 if(!photo.id||!image||!full||!source||!author||!download||!photo.user?.name||photo.premium||photo.plus)return null;
 if(photo.width<600||photo.height<350||/\b(3d render(?:ing)?|ai.generated|illustration|vector art|clip ?art)\b/i.test(title))return null;
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
async function selectPhotos(accessKey:string,queries:string[],needed:number,usedIds:Set<string>,usedUrls:Set<string>,save:(photo:any)=>Promise<boolean>){
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
   if(!p||usedIds.has(p.id)||usedUrls.has(originalUrl(p.full_image_url)))continue;
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
  const cached=await rows("orca_timeline_photo_selections","event_id,photo_id,image_url,full_image_url,needs_review");
  const byEvent=new Map(cached.map(p=>[p.event_id,p]));
  const usedIds=new Set<string>(),usedUrls=new Set<string>();
  const targets=events.filter(e=>{
   const p=byEvent.get(e.id);let original="";
   try{original=originalUrl(p?.full_image_url||p?.image_url)}catch{}
   if(!p?.photo_id||!p?.image_url||!original||usedIds.has(p.photo_id)||usedUrls.has(original))return true;
   // Preserve all existing distinct covers, including those flagged by old relevance rules.
   usedIds.add(p.photo_id);usedUrls.add(original);return false;
  });
  if(!targets.length)return reply(200,{state:"cached",added:0,remaining:0,photos:events.length});
  const accessKey=Deno.env.get("UNSPLASH_ACCESS_KEY");if(!accessKey)throw Error("Unsplash access key is not configured");
  const {data:profile}=await admin.from("orca_ai_company_profiles").select("company_name,content").eq("ticker",ticker).maybeSingle();
  const {data:job}=await admin.from("orca_timeline_photo_jobs").select("queries").eq("ticker",ticker).single();
  const description=[profile?.content?.overview,profile?.content?.what_they_do,profile?.content?.business_focus].filter(Boolean).join(" ");
  const queries=await businessQueries(ticker,profile?.company_name||ticker,description,job?.queries);
  let saveFailures=0,index=0;
  const search=await selectPhotos(accessKey,queries,targets.length,usedIds,usedUrls,async p=>{
   const {error}=await admin.from("orca_timeline_photo_selections").upsert({
    event_id:targets[index].id,ticker,photo_id:p.id,image_url:p.image_url,full_image_url:p.full_image_url,
    photo_url:p.photo_url,photographer:p.photographer,photographer_url:p.photographer_url,
    illustrative:true,source_type:"unsplash_legacy",rights_status:"legacy_provider_terms",
    license_name:"Unsplash License",license_url:"https://unsplash.com/license",verified_at:new Date().toISOString(),
    source_page_url:p.photo_url,creator:p.photographer,attribution_text:"Photo by "+p.photographer+" on Unsplash",
    match_type:"contextual",search_query:p.query,query_used:p.query,strategy_version:11,
    needs_review:false,image_title:p.title,match_score:null,relevance_score:null
   },{onConflict:"event_id"});
   if(error){saveFailures++;return false}index++;return true;
  });
  return reply(200,{...search,state:search.added?"ready":saveFailures?"save_failed":search.provider_http_status===429?"rate_limited":search.provider_http_status!==200?"provider_error":"no_matches",
   remaining:targets.length-search.added,save_failures:saveFailures,note:"Business illustrations, not photographs of historical events."});
 }catch(error){return reply(503,{error:error instanceof Error?error.message:"Photo selection failed"})}
 finally{await admin.from("orca_timeline_photo_jobs").update({lock_token:null,locked_until:null}).eq("ticker",ticker).eq("lock_token",token)}
});
