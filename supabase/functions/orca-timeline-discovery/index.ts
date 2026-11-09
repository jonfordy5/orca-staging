import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const url=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
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
  const raw=new URL(source);
  if(raw.protocol==="https:"&&(raw.hostname==="sec.gov"||raw.hostname.endsWith(".sec.gov")))return raw.href;
  const official=new URL(site);
  if(raw.protocol!=="https:"||raw.username||raw.password||raw.port)return null;
  if(official.protocol!=="https:")return null;
  const host=raw.hostname.toLowerCase().replace(/^www\./,"");
  const officialHost=official.hostname.toLowerCase().replace(/^www\./,"");
  const parts=officialHost.split(".");
  const base=parts.length>2?parts.slice(-2).join("."):officialHost;
  // Amazon's SEC investor releases live on a separate official About Amazon host.
  // Alternate hosts are explicitly linked by the company's own website.
  const alternates:Record<string,string[]>={
   "amazon.com":["aboutamazon.com"],
   "meta.com":["about.fb.com","investor.atmeta.com"]
  };
  const corporateAlternates=alternates[base]||[];
  if(["github.io","netlify.app","pages.dev","vercel.app","co.uk","com.au","co.nz"].includes(base))
   return host===officialHost||host.endsWith("."+officialHost)||host==="sec.gov"||host.endsWith(".sec.gov")?raw.href:null;
  return host===base||host.endsWith("."+base)||corporateAlternates.some(allowed=>host===allowed||host.endsWith("."+allowed))||host==="sec.gov"||host.endsWith(".sec.gov")?raw.href:null;
 }catch{return null}
}
// Track a page by the actual first-party host/path, not incidental tracking
// parameters in web-search citations.
function sourceKey(input:string):string{
 try{
  const url=new URL(input);
  return url.hostname.toLowerCase().replace(/^www\./,"")+
   url.pathname.replace(/\/+$/,"").toLowerCase();
 }catch{return ""}
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
 const scope=String(body?.scope||"history").trim().toLowerCase();
 // A unified timeline action shares a single estimated cost ceiling across
 // the initial history, founding, and current-period stages.
 const requestedBudget=Number(body?.max_budget_usd);
 if(body?.max_budget_usd!==undefined&&(!Number.isFinite(requestedBudget)||requestedBudget<0.02))
  return reply(400,{error:"invalid_research_budget"});
 const costCeiling=Number.isFinite(requestedBudget)&&requestedBudget>0?
  Math.min(0.15,requestedBudget):0.15;
 if(!validTicker(ticker)||!["history","origin","current"].includes(scope))
  return reply(400,{error:"invalid_ticker_or_scope"});
 const user=identity.user;
 // Cached public history is free to read without generating anything.
 const {data:existing,error:readError}=await admin.from("orca_timeline_annotations")
  .select("id,title,event_at,source_url,quick_brief").eq("ticker",ticker).neq("category","custom_note").is("created_by",null).limit(500);
 if(readError)return reply(503,{error:"milestone_cache_unavailable"});
 if(scope==="history"&&(existing?.length||0)>=10)
  return reply(200,{state:"cached",milestones:existing?.length||0,reason:"starter_history_complete"});
 const {data:reservation,error:reserveError}=scope==="history"
  ?await admin.rpc("orca_timeline_reserve_generation",{p_ticker:ticker,p_user:user.id,p_budget_usd:costCeiling})
  :await admin.rpc("orca_timeline_reserve_scoped_generation",{p_ticker:ticker,p_user:user.id,p_scope:scope,p_budget_usd:costCeiling});
 if(reserveError)return reply(403,{error:"team_membership_and_research_consent_required"});
 if(reservation?.state!=="reserved")
  return reply(200,{state:reservation?.state||"unavailable",milestones:existing?.length||0,refresh_eligible_after:reservation?.refresh_eligible_after||null});
 const run=reservation.run_id;
 let tokensIn=0,tokensOut=0,searchCalls=0;
 let cost=0;
 const diagnostics:any[]=[];
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
  // SEC-backed profiles can research SEC originals even when no corporate site is cached.
  const apiKey=Deno.env.get("OPENAI_API_KEY");
  if(!apiKey)throw Error("openai_unconfigured");
  // Existing verified-source rows always stay intact. A near-complete history uses
  // a small focused search instead of repeating an expensive broad research pass.
  const existingRows=existing||[];
  // Initial research aims for ten strong milestones. Afterwards the archive grows
  // indefinitely through scoped founding/current-year event additions.
  const remainingAtStart=scope==="history"?Math.max(0,10-existingRows.length):1;
  const existingEvents=existingRows.map((e:any)=>({
   date:String(e.event_at||"").slice(0,10),title:String(e.title||""),
   source_url:String(e.source_url||"")
  }));
  const accepted:any[]=[];
  let rejected=0,briefIncomplete=0;
  const asOf=new Date().toISOString().slice(0,10);
  const currentYear=new Date().getUTCFullYear();
  const observedSources=new Set<string>();
  const observedKeys=new Set<string>();
  const verifiedLinks=new Map<string,Promise<boolean>>();
  // A first-party source can be verified even when the AI citation list omits
  // it. Never accept a source on an unrelated hostname, or a broken URL.
  async function firstPartyPageExists(source:string):Promise<boolean>{
   if(observedSources.has(source)||observedKeys.has(sourceKey(source)))return true;
   let url=source;
   for(let redirect=0;redirect<2;redirect++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),4500);
    try{
     const response=await fetch(url,{method:"GET",redirect:"manual",
      signal:controller.signal,headers:{"Accept":"text/html,application/pdf,text/plain"}});
     if(response.status>=300&&response.status<400){
      const location=response.headers.get("location");
      await response.body?.cancel();
      if(!location)return false;
      const next=new URL(location,url).href;
      if(!safeSource(next,official))return false;
      url=next;continue;
     }
     const final=response.url||url;
     const type=String(response.headers.get("content-type")||"").toLowerCase();
     await response.body?.cancel();
     return response.ok&&!!safeSource(final,official)&&
      (!type||/text\/html|application\/pdf|text\/plain/.test(type));
    }catch{return false}
    finally{clearTimeout(timer)}
   }
   return false;
  }
  function verifyFirstParty(source:string):Promise<boolean>{
   if(observedSources.has(source)||observedKeys.has(sourceKey(source)))return Promise.resolve(true);
   const key=sourceKey(source);
   if(!verifiedLinks.has(key))verifiedLinks.set(key,firstPartyPageExists(source));
   return verifiedLinks.get(key)!;
  }
  const titleKeys=new Set(existingRows.map((e:any)=>String(e.title||"").trim().toLowerCase()));
  let targetedAttempted=false,targetedAccepted=0,targetedStatus="not_needed";

  function shouldTargetFollowup(existingCount:number,newCount:number,estimated:number):boolean{
   const count=existingCount+newCount;
   // Extra research only happens when a general pass left one or two gaps.
   // Keep a conservative $0.065 estimated headroom for ONE smaller web search.
   return existingCount<8&&(count===8||count===9)&&estimated<=Math.min(0.085,costCeiling-0.065);
  }
  async function acceptCandidateMilestones(items:any[]):Promise<number>{
   let newAccepted=0;
   // Validate the small batch concurrently so a slow publisher never stalls
   // the entire milestone history.
   const checked=await Promise.all(items.map(async(e:any)=>{
    const primary=safeSource(String(e?.source_url||""),official);
    return primary?verifyFirstParty(primary):false;
   }));
   for(const [index,e] of items.entries()){
    if(accepted.length>=remainingAtStart)break;
    const when=String(e?.date||"");
    const parsedDate=Date.parse(when+"T12:00:00Z");
    const primary=safeSource(String(e?.source_url||""),official);
    const title=String(e?.title||"").trim(),summary=String(e?.summary||"").trim();
    const points=Array.isArray(e?.points)?e.points.map((p:any)=>String(p||"").trim()):[];
    const why=String(e?.why||"").trim();
    if(titleKeys.has(title.toLowerCase()))continue;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(when)||!Number.isFinite(parsedDate)
     ||parsedDate>Date.now()||parsedDate<Date.parse("1800-01-01")
     ||(scope==="current"&&!when.startsWith(String(currentYear)+"-"))
     ||(scope==="origin"&&(!/\b(found(?:ed|ing)?|incorporat(?:e(?:d|s)?|ing|ion)|establish(?:ed|ment)|began as|begins as|first (?:store|operation|business|restaurant|location)|open(?:s|ed)?\s+(?:the\s+)?first|launch(?:es|ed)\s+at\s+(?:harvard|a university|university|college))\b/i.test(title)
       ||(existingRows.length>0&&parsedDate>=Math.min(...existingRows.map((row:any)=>Date.parse(String(row.event_at||"")))))))
     ||!categories.includes(e?.category)||title.length<4||title.length>100
     ||summary.length<60||summary.length>500||!primary||!checked[index]){
     rejected++;continue;
    }
    const goodBrief=points.length===2&&!points.some((p:string)=>p.length<20||p.length>200)
     &&why.length>=20&&why.length<=200;
    if(!goodBrief)briefIncomplete++;
    titleKeys.add(title.toLowerCase());
    accepted.push({date:when,category:e.category,title,summary,source_url:primary,
     points:goodBrief?points:null,why:goodBrief?why:null,image_url:null,image_credit:null});
    newAccepted++;
   }
   return newAccepted;
  }

  const baseInstructions=[
   "Research factual, important historical milestones for the specified PUBLIC COMPANY. This is an illustrated company history, not investor advice or a rating.",
   "Use live web search and PRIMARY sources only: official company history or heritage pages, company newsroom or investor relations, and SEC EDGAR. Start with the company's official historical timeline if one exists, particularly for companies founded before 2006. Verify original event dates; no blogs, social opinions or invented events.",
   "Aim for ten distinct sourced milestones across the company's FULL HISTORY, from founding (not before 1800) through today. For long-established companies spread milestones across early history, middle decades and recent decades. If earlier milestones exist, research only those missing. Prioritize founding, foundational products, manufacturing innovations, international expansion, acquisitions, financial turning points, leadership changes and legal events.",
   "Do not claim an announcement is realized revenue, and distinguish announcements from completion. Use each event's actual date (YYYY-MM-DD), not the article access date.",
   "Include a genuine direct HTTPS URL from an original source supporting EACH item. Do not guess URLs or copy sources from a different company. Do not reuse an unverified link.",
   "Treat each timeline milestone like a major sourced news item: clear and compelling, not sensational. Headlines must be 6–90 characters, describe WHAT happened and why it is significant, and lead with a concrete fact when available. Never inflate results or imply outcomes that are only plans.",
   "Write a 90–330 character plain-English summary that gives who, what, and one concrete verified detail. Supply exactly two concise informative points, 35–160 characters each, that add facts not already repeated in the summary. Add one short why-it-matters sentence, 40–160 characters, explaining the business or technological significance. Every detail must be supported by the original source.",
   "Numbers, performance claims, and comparisons must be attributed to their announcement when not independently established. Clearly differentiate projections, announced plans, launches, and completed deals. Do not fabricate figures or rely on marketing hype.",
   "Return enough distinct events to bring the total toward TEN, in chronological order, no more than ten new events. Never repeat existing milestone titles. A verified company history page can support multiple distinct dated events. Find an original-source page directly supporting each new event. Avoid concentrating events in just one decade. If original-source evidence is insufficient, return fewer rather than fabricating.",
   "Output structured JSON only. Do not generate image URLs. Timeline photography is selected separately."
  ].join(" ");
  const targetedInstructions=[
   "TARGETED COMPANY HISTORY SEARCH. Find the authentic founding or incorporation event before the earliest saved event, or fill the requested missing historical events.",
   "Review the existing event titles, years, and original-source URLs. Focus on an unrepresented major historical era, not another recent minor update.",
   "Find dated evidence on the company's OFFICIAL corporate history, heritage, press release or investor pages, or SEC EDGAR. Each candidate needs a direct HTTPS source that supports the actual event and date.",
   "Do not reuse any supplied title; do not invent an event, year, original company source, or direct link.",
   "Return no more events than the requested missing_milestones number. Do not substitute an old event for a current-year request. If there is no substantiated new event, return an empty milestones array.",
   "Return structured JSON only. Provide summary, two source-backed facts and a short why-it-matters note. No photos, stock ratings or forecasts."
  ].join(" ");

  const currentInstructions=[
   "Research ONLY the specified current calendar year, from period_start through as_of_date, inclusive. Do not research founding, old history, or a half-year window.",
   "Find one material corporate announcement or completed event for this public company using live web search. Use company newsroom, investor relations or SEC EDGAR originals only. Search the supplied official source hosts, including alternate corporate hosts.",
   "Verify the actual event date. An announcement is itself an event: distinguish announced plans from completed deals and never imply projections are realized results. Reject future events, unsupported dates, blogs and invented URLs. Quote numerical claims only when explicitly stated by the source; never calculate totals or derive new amounts from individual figures.",
   "Return up to three supported candidates in order of business significance so validation can select one. Never repeat existing events. If no evidence is available return an empty milestones array.",
   "Use the required JSON schema. Write a 90–330 character summary, exactly two source-backed facts of 35–160 characters each, and a 40–160 character why-it-matters sentence. No images, ratings or forecasts."
  ].join(" ");
  async function researchBatch(targeted:boolean,alreadySaved:any[]):Promise<any[]>{
   const missing=Math.max(0,remainingAtStart-accepted.length);
   if(!missing)return [];
   const input=JSON.stringify({
    ticker,company_name:stock.company_name,official_website:official,
    as_of_date:asOf,current_year:currentYear,
    period_start:scope==="current"?String(currentYear)+"-01-01":null,
    official_source_hosts:official.includes("meta.com")?["meta.com","about.fb.com","investor.atmeta.com","sec.gov"]:[official,"sec.gov"],
    research_scope:scope,founding_or_current_year_requirement:
     scope==="origin"?"Find a real early founding/incorporation event predating existing events":
     scope==="current"?"Find a material corporate event actually occurring from "+currentYear+"-01-01 through "+asOf:
     "Find material events across company history",
    target_total:scope==="history"?10:null,missing_milestones:missing,
    research_period:scope==="current"?currentYear+"-01-01 through "+asOf:"1800 onward, across the full company history",
    existing_events:[...existingEvents,...alreadySaved.map((e:any)=>({
     date:e.date,title:e.title,source_url:e.source_url
    }))],
    excluded_titles:[...titleKeys]
   });
   const providerBody={
    model,store:false,reasoning:{effort:"low"},
    instructions:scope==="current"?currentInstructions:targeted?baseInstructions+" "+targetedInstructions:baseInstructions,
    input,
    include:["web_search_call.action.sources"],
    tools:[{type:"web_search",search_context_size:targeted?"low":"medium"}],
    // Limit provider work BEFORE spending, including the shared click remainder.
    // Allow room for input/search context as well as billed output tokens.
    max_tool_calls:Math.max(1,Math.min(targeted?2:5,Math.floor((costCeiling-(targeted?0.012:0.032))/0.018))),
    max_output_tokens:targeted?2100:6500,
    text:{format:{type:"json_schema",name:"orca_company_history_v1",strict:true,schema}}
   };
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),targeted?30000:85000);
   let response:Response;
   try{
    response=await fetch("https://api.openai.com/v1/responses",{
     method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
     body:JSON.stringify(providerBody),signal:controller.signal
    });
   }finally{clearTimeout(timer)}
   if(!response.ok)throw Error("provider_"+response.status);
   const result=await response.json();
   tokensIn+=Number(result.usage?.input_tokens||0);
   tokensOut+=Number(result.usage?.output_tokens||0);
   searchCalls+=(result.output||[]).filter((x:any)=>x.type==="web_search_call"&&x.status==="completed").length;
   cost=Number(((tokensIn*.75+tokensOut*4.5)/1000000+searchCalls*.01).toFixed(5));
   if(cost>costCeiling)throw Error("cost_envelope_exceeded");
   for(const item of result.output||[]){
    for(const source of item.action?.sources||[]){
     const verified=safeSource(String(source.url||""),official);
     if(verified){observedSources.add(verified);observedKeys.add(sourceKey(verified));}
    }
    for(const part of item.content||[])for(const citation of part.annotations||[]){
     const verified=safeSource(String(citation.url||""),official);
     if(verified){observedSources.add(verified);observedKeys.add(sourceKey(verified));}
    }
   }
   if(result.status==="incomplete")throw Error("provider_incomplete_"+String(result.incomplete_details?.reason||"unknown"));
   const parsed=parseOutput(result);
   diagnostics.push({provider_status:result.status||null,incomplete_details:result.incomplete_details||null,
    candidates:(parsed.milestones||[]).map((e:any)=>({date:e.date,title:e.title,source_url:e.source_url,
     allowed_source:!!safeSource(String(e.source_url||""),official)}))});
   console.log(JSON.stringify({diagnostic:"timeline_candidates_v2",run_id:run,ticker,scope,diagnostics,estimated_usd:cost}));
   if(!Array.isArray(parsed.milestones))throw Error("invalid_provider_output");
   return parsed.milestones;
  }

  const initiallyTargeted=scope!=="history"||remainingAtStart<=2;
  if(initiallyTargeted){targetedAttempted=true;targetedStatus="started";}
  const first=await researchBatch(initiallyTargeted,[]);
  const firstAdded=await acceptCandidateMilestones(first);
  if(initiallyTargeted){targetedAccepted=firstAdded;targetedStatus=firstAdded?"accepted":"no_new_primary_sources";}

  if(scope==="history"&&shouldTargetFollowup(existingRows.length,accepted.length,cost)){
   targetedAttempted=true;targetedStatus="started";
   try{
    const additional=await researchBatch(true,accepted);
    targetedAccepted=await acceptCandidateMilestones(additional);
    targetedStatus=targetedAccepted?"accepted":"no_new_primary_sources";
   }catch(error){
    // Never discard already validated milestones because a SECOND, optional
    // near-completion search failed. Keep the cost tally truthful.
    targetedStatus=String(error instanceof Error?error.message:"targeted_search_failed").slice(0,65);
   }
  }else if(!initiallyTargeted&&existingRows.length+accepted.length>=8&&existingRows.length+accepted.length<10){
   targetedStatus="deferred_budget_or_not_eligible";
  }
  if(!accepted.length)throw Error("no_acceptable_primary_source_milestones");
  const saved=await finish(accepted.slice(0,remainingAtStart),null);
  return reply(200,{state:saved?.state||"unknown",added:saved?.added||0,
   total_cached:(existing?.length||0)+(saved?.added||0),research_scope:scope,starter_goal:10,
   targeted_search_attempted:targetedAttempted,targeted_added:targetedAccepted,
   targeted_status:targetedStatus,web_search_calls:searchCalls,
   missing_after_run:scope==="history"?Math.max(0,10-((existing?.length||0)+(saved?.added||0))):0,estimated_usd:cost,
   diagnostics,reserved_usd:reservation.reserve_usd,rejected,reduced_briefs:briefIncomplete,milestone_sources:"company_and_sec_originals"});
 }catch(e){
  const message=String(e instanceof Error?e.message:e).slice(0,80);
  try{await finish([],message)}catch{}
  return reply(503,{error:"Milestone discovery deferred. Existing sourced events are unchanged.",
   code:message,estimated_usd:cost,reserved_usd:reservation.reserve_usd,diagnostics,research_scope:scope});
 }
});
