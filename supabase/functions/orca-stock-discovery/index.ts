import { isVerifiedOrcaBrowserToken } from "../_shared/orca-browser-token.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const ORIGIN="https://jonfordy5.github.io";
const ROOT="https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main";
const SOURCES=["nasdaq","nyse","amex"].map(x=>ROOT+"/"+x+"/"+x+"_full_tickers.json");
const BACKUP="https://raw.githubusercontent.com/ebokai/improved_us_stock_symbols/main/all/all_full_tickers.json";
const TICKER=/^[A-Z][A-Z0-9.]{0,9}$/;
const SERVICE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(SERVICE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let cached=new Map<string,string>(),lastLoaded=0,inflight:Promise<void>|null=null;
const cooling=new Map<string,{count:number,start:number}>();
function cors(origin:string|null){return {"Access-Control-Allow-Origin":origin===ORIGIN?ORIGIN:ORIGIN,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store","Content-Type":"application/json"};}
function respond(code:number,data:unknown,origin:string|null){return new Response(JSON.stringify(data),{status:code,headers:cors(origin)});}
function normal(s:unknown){return String(s||"").trim().toUpperCase();}
function eligible(name:string){
 return name.length>1&&name.length<=180&&!/\b(warrants?|rights|preferred stock|preferred shares|preferred units|notes due|depositary shares representing preferred|debentures|ETNs?|exchange traded funds?|units? comprised of|units? consisting of)\b/i.test(name);
}
async function fetchList(url:string){
 const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"ORCA-staging-symbol-lookup"},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error("upstream unavailable");
 const list=await response.json();if(!Array.isArray(list))throw new Error("invalid upstream format");
 const result=new Map<string,string>();
 for(const item of list){
  const ticker=normal(item?.symbol),name=String(item?.name||"").trim().slice(0,180);
  if(TICKER.test(ticker)&&eligible(name))result.set(ticker,name);
 }
 return result;
}
async function ensureCatalog(){
 if(cached.size>=500&&Date.now()-lastLoaded<6*3600000)return;
 if(inflight)return inflight;
 inflight=(async()=>{
  const attempts=await Promise.allSettled(SOURCES.map(fetchList));
  const combined=new Map<string,string>();
  // Source: nightly Nasdaq-based exchange listings, not financial quote data.
  for(const attempt of attempts)if(attempt.status==="fulfilled")for(const [t,n] of attempt.value)combined.set(t,n);
  if(combined.size<1000){try{const fallback=await fetchList(BACKUP);for(const [t,n] of fallback)if(!combined.has(t))combined.set(t,n);}catch{/* Retain previous good cache */}}
  if(combined.size>=500){cached=combined;lastLoaded=Date.now();}
  else if(!cached.size)throw new Error("symbol directory temporarily unavailable");
 })();
 try{await inflight;}finally{inflight=null;}
}
function matches(q:string,limit=8){
 const items:Array<{ticker:string,company_name:string}>=[];
 for(const [ticker,name] of cached){
  if(ticker===q||ticker.startsWith(q)||name.toUpperCase().includes(q))items.push({ticker,company_name:name});
 }
 items.sort((a,b)=>Number(b.ticker===q)-Number(a.ticker===q)||Number(b.ticker.startsWith(q))-Number(a.ticker.startsWith(q))||a.ticker.localeCompare(b.ticker));
 return items.slice(0,limit);
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("Origin");
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
 const url=new URL(req.url);
 if(req.method==="GET"){
  const q=normal(url.searchParams.get("q"));
  if(q.length<2||q.length>70)return respond(400,{error:"Enter at least two letters to search."},origin);
  try{await ensureCatalog();return respond(200,{matches:matches(q),catalog_size:cached.size,source:"public US exchange symbol directory; not live market quotes"},origin);}
  catch{return respond(503,{error:"Stock directory temporarily unavailable. Registered stocks still work."},origin);}
 }
 if(req.method!=="POST")return respond(405,{error:"Unsupported request"},origin);
 if(origin!==ORIGIN)return respond(403,{error:"Open ORCA staging to register a stock"},origin);
 const raw=req.headers.get("Authorization")||"";
 const token=raw.startsWith("Bearer ")?raw.slice(7):"";
 if(token.split(".").length!==3)return respond(401,{error:"Sign in to your ORCA account first"},origin);
 const {data:{user},error:authError}=await admin.auth.getUser(token);
 if(authError||!user)return respond(401,{error:"Session expired; sign in again"},origin);
 if(!isVerifiedOrcaBrowserToken(token,user.id))return respond(403,{error:"Linked AI clients cannot register stocks through this website endpoint"},origin);
 const {data:profile,error:profileError}=await admin.from("agent_profiles").select("id,opted_in").eq("owner_id",user.id).maybeSingle();
 if(profileError||!profile?.opted_in)return respond(403,{error:"Create your agent profile and enable research permission before starting a new stock"},origin);
 let body:unknown;try{body=await req.json();}catch{return respond(400,{error:"Invalid request"},origin);}
 const ticker=normal((body as {ticker?:string})?.ticker);
 if(!TICKER.test(ticker))return respond(400,{error:"Invalid ticker"},origin);
 const {data:existing}=await admin.from("stocks").select("ticker,company_name").eq("ticker",ticker).maybeSingle();
 if(existing)return respond(200,{ticker:existing.ticker,company_name:existing.company_name,existing:true},origin);
 const now=Date.now(),entry=cooling.get(user.id)||{count:0,start:now};
 if(now-entry.start>3600000){entry.start=now;entry.count=0;}
 if(entry.count>=5)return respond(429,{error:"Please limit new stock registrations to five per hour while testing"},origin);
 try{await ensureCatalog();}catch{return respond(503,{error:"Cannot verify the stock listing right now"},origin);}
 const company=cached.get(ticker);
 if(!company)return respond(404,{error:"Ticker was not found in the exchange listing directory"},origin);
 const {count,error:countError}=await admin.from("stocks").select("ticker",{count:"exact",head:true});
 if(countError||count===null)return respond(503,{error:"Unable to check the staging stock registry"},origin);
 if(count>=150)return respond(429,{error:"Staging catalog capacity reached; contact ORCA admin"},origin);
 entry.count++;cooling.set(user.id,entry);
 const {error}=await admin.from("stocks").upsert({ticker,company_name:company},{onConflict:"ticker",ignoreDuplicates:true});
 if(error)return respond(503,{error:"Unable to register stock. Please retry."},origin);
 return respond(200,{ticker,company_name:company,existing:false},origin);
});