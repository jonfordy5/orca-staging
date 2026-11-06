import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const url=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const publishableKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={
 "Content-Type":"application/json",
 "Access-Control-Allow-Origin":"https://jonfordy5.github.io",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info,x-supabase-api-version",
 "Cache-Control":"no-store"
};
const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:cors});
const model="gpt-5.4-mini";
const categories=["earnings","product","macro","legal"];
const schema={
 type:"object",properties:{milestones:{type:"array",items:{
  type:"object",properties:{
   date:{type:"string"},category:{type:"string",enum:categories},
   title:{type:"string"},summary:{type:"string"},source_url:{type:"string"},
   points:{type:"array",items:{type:"string"}},why:{type:"string"}
  },required:["date","category","title","summary","source_url","points","why"],additionalProperties:false
 }}},required:["milestones"],additionalProperties:false
};
const validTicker=(t:string)=>/^[A-Z][A-Z0-9.]{0,9}$/.test(t);
function safeSource(source:string,site:string){
 try{
  const raw=new URL(source),official=new URL(site);
  if(raw.protocol!=="https:"||raw.username||raw.password||raw.port)return null;
  if(official.protocol!=="https:")return null;
  const host=raw.hostname.toLowerCase().replace(/^www\./,"");
  const officialHost=official.hostname.toLowerCase().replace(/^www\./,"");
  const parts=officialHost.split(".");
  const base=parts.length>2?parts.slice(-2).join("."):officialHost;
  if(["github.io","netlify.app","pages.dev","vercel.app","co.uk","com.au","co.nz"].includes(base))
   return host===officialHost||host.endsWith("."+officialHost)||host==="sec.gov"||host.endsWith(".sec.gov")?raw.href:null;
  return host===base||host.endsWith("."+base)||host==="sec.gov"||host.endsWith(".sec.gov")?raw.href:null;
 }catch{return null}
}
function parseOutput(raw:any){
 const direct=typeof raw.output_text==="string"?raw.output_text:"";
 const joined=direct||((raw.output||[]).flatMap((part:any)=>
  part.type==="message"?(part.content||[]).filter((c:any)=>c.type==="output_text").map((c:any)=>c.text):[]).join(""));
 if(!joined)throw Error("empty_response");
 return JSON.parse(joined);
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const bearer=(req.headers.get("Authorization")||"").match(/^Bearer\s+(\S+)$/i)?.[1];
 if(!bearer)return reply(401,{error:"sign_in_required"});
 const {data:identity,error:authError}=await admin.auth.getUser(bearer);
 if(authError||!identity?.user)return reply(401,{error:"invalid_session"});
 let body:any;
 try{body=await req.json()}catch{return reply(400,{error:"invalid_request"})}
 const ticker=String(body?.ticker||"").trim().toUpperCase();
 if(!validTicker(ticker))return reply(400,{error:"invalid_ticker"});
 const user=identity.user;
 // Cached public history is free to read without generating anything.
 const {data:existing,error:readError}=await admin.from("orca_timeline_annotations")
  .select("id,title,source_url").eq("ticker",ticker).neq("category","custom_note").is("created_by",null).limit(500);
 if(readError)return reply(503,{error:"milestone_cache_unavailable"});
 const {data:last}=await admin.from("orca_timeline_generation_runs")
  .select("state,attempted_at").eq("ticker",ticker).eq("state","ready")
  .order("attempted_at",{ascending:false}).limit(1).maybeSingle();
 if((existing?.length||0)>=10)
  return reply(200,{state:"cached",milestones:existing?.length||0,reason:"existing_verified_history"});
 const {data:reservation,error:reserveError}=await admin.rpc("orca_timeline_reserve_generation",
  {p_ticker:ticker,p_user:user.id});
 if(reserveError)return reply(403,{error:"team_membership_and_research_consent_required"});
 if(reservation?.state!=="reserved")
  return reply(200,{state:reservation?.state||"unavailable",milestones:existing?.length||0,refresh_eligible_after:reservation?.refresh_eligible_after||null});
 const run=reservation.run_id;
 let tokensIn=0,tokensOut=0,searchCalls=0;
 let cost=0;
 async function finish(events:any[],errorCode:string|null){
  const {data,error}=await admin.rpc("orca_timeline_finish_generation",{
   p_run_id:run,p_events:events,p_cost_usd:cost,p_search_calls:searchCalls,
   p_input_tokens:tokensIn,p_output_tokens:tokensOut,p_error_code:errorCode
  });
  if(error)throw Error("save_failed");
  return data;
 }
 try{
  const {data:stock,error:stockError}=await admin.from("stocks")
   .select("company_name").eq("ticker",ticker).single();
  if(stockError||!stock?.company_name)throw Error("stock_identity_not_found");
  const {data:profile}=await admin.from("orca_ai_company_profiles")
   .select("state,usage").eq("ticker",ticker).maybeSingle();
  const official=profile?.state==="ready"?String(profile?.usage?.official_website||""):"";
  if(!official.startsWith("https://"))throw Error("official_website_not_verified");
  const apiKey=Deno.env.get("OPENAI_API_KEY");
  if(!apiKey)throw Error("openai_unconfigured");
  const instructions=[
   "Research factual, important historical milestones for the specified PUBLIC COMPANY. This is an illustrated company history, not investor advice or a rating.",
   "Use live web search and PRIMARY sources only: official company history or heritage pages, company newsroom or investor relations, and SEC EDGAR. Start with the company's official historical timeline if one exists, particularly for companies founded before 2006. Verify original event dates; no blogs, social opinions or invented events.",
   "Aim for ten distinct sourced milestones across the company's FULL HISTORY, from founding (not before 1900) through today. For long-established companies spread milestones across early history, middle decades and recent decades. If earlier milestones exist, research only those missing. Prioritize founding, foundational products, manufacturing innovations, international expansion, acquisitions, financial turning points, leadership changes and legal events.",
   "Do not claim an announcement is realized revenue, and distinguish announcements from completion. Use each event's actual date (YYYY-MM-DD), not the article access date.",
   "Include a genuine direct HTTPS URL from an original source supporting EACH item. Do not guess URLs or copy sources from a different company. Do not reuse an unverified link.",
   "Treat each timeline milestone like a major sourced news item: clear and compelling, not sensational. Headlines must be 6–90 characters, describe WHAT happened and why it is significant, and lead with a concrete fact when available. Never inflate results or imply outcomes that are only plans.",
   "Write a 90–330 character plain-English summary that gives who, what, and one concrete verified detail. Supply exactly two concise informative points, 35–160 characters each, that add facts not already repeated in the summary. Add one short why-it-matters sentence, 40–160 characters, explaining the business or technological significance. Every detail must be supported by the original source.",
   "Numbers, performance claims, and comparisons must be attributed to their announcement when not independently established. Clearly differentiate projections, announced plans, launches, and completed deals. Do not fabricate figures or rely on marketing hype.",
   "Return enough distinct events to bring the total toward TEN, in chronological order, no more than ten new events. Never repeat existing milestone titles or source URLs. Find an original-source page directly supporting each new event, with distinct URLs for distinct events. Avoid concentrating events in just one decade. If original-source evidence is insufficient, return fewer rather than fabricating.",
   "Output structured JSON only. Do not generate image URLs. Timeline photography is selected separately."
  ].join(" ");
  const providerBody={
   model,store:false,reasoning:{effort:"low"},instructions,
   input:JSON.stringify({ticker,company_name:stock.company_name,official_website:official,
    target_total:10,missing_milestones:Math.max(0,10-(existing?.length||0)),
    research_period:"From founding (1900+) through today, across several eras",
    existing_titles:(existing||[]).map((e:any)=>e.title),existing_sources:(existing||[]).map((e:any)=>e.source_url)}),
   tools:[{type:"web_search",search_context_size:"medium"}],
   max_tool_calls:5,max_output_tokens:6500,
   text:{format:{type:"json_schema",name:"orca_company_history_v1",strict:true,schema}}
  };
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),85000);
  let provider:Response;
  try{provider=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
   body:JSON.stringify(providerBody),signal:controller.signal
  })}finally{clearTimeout(timer)}
  if(!provider.ok)throw Error("provider_"+provider.status);
  const result=await provider.json();
  tokensIn=Number(result.usage?.input_tokens||0);
  tokensOut=Number(result.usage?.output_tokens||0);
  searchCalls=(result.output||[]).filter((x:any)=>x.type==="web_search_call"&&x.status==="completed").length;
  // Planning estimate, not a guaranteed hard dollar limit on the external provider.
  cost=Number(((tokensIn*.75+tokensOut*4.5)/1000000+searchCalls*.01).toFixed(5));
  if(cost>.15)throw Error("cost_envelope_exceeded");
  const parsed=parseOutput(result);
  if(!Array.isArray(parsed.milestones))throw Error("invalid_provider_output");
  const accepted:any[]=[];
  let rejected=0;
  let briefIncomplete=0;
  const sources=new Set<string>();
  for(const e of parsed.milestones){
   const when=String(e?.date||"");
   const parsedDate=Date.parse(when+"T12:00:00Z");
   const primary=safeSource(String(e?.source_url||""),official);
   const title=String(e?.title||"").trim(),summary=String(e?.summary||"").trim();
   const points=Array.isArray(e?.points)?e.points.map((p:any)=>String(p||"").trim()):[];
   const why=String(e?.why||"").trim();
   if((existing||[]).some((prior:any)=>prior.source_url===primary||String(prior.title||'').trim().toLowerCase()===title.toLowerCase()))continue;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(when)||!Number.isFinite(parsedDate)
    ||parsedDate>Date.now()||parsedDate<Date.parse("1900-01-01")
    ||!categories.includes(e?.category)||title.length<4||title.length>100
    ||summary.length<60||summary.length>500||!primary||sources.has(primary)){
    rejected++;continue;
   }
   const goodBrief=points.length===2&&!points.some((p:string)=>p.length<20||p.length>200)
    &&why.length>=20&&why.length<=200;
   if(!goodBrief)briefIncomplete++;
   sources.add(primary);
   accepted.push({date:when,category:e.category,title,summary,source_url:primary,
    points:goodBrief?points:null,why:goodBrief?why:null,image_url:null,image_credit:null});
  }
  if(!accepted.length)throw Error("no_acceptable_primary_source_milestones");
  const saved=await finish(accepted.slice(0,10),null);
  return reply(200,{state:saved?.state||"unknown",added:saved?.added||0,
   total_cached:(existing?.length||0)+(saved?.added||0),target_total:10,
   missing_after_run:Math.max(0,10-((existing?.length||0)+(saved?.added||0))),estimated_usd:cost,
   rejected,reduced_briefs:briefIncomplete,milestone_sources:"company_and_sec_originals"});
 }catch(e){
  const message=String(e instanceof Error?e.message:e).slice(0,80);
  try{await finish([],message)}catch{}
  return reply(503,{error:"Milestone discovery deferred. Existing sourced events are unchanged.",
   code:message});
 }
});
