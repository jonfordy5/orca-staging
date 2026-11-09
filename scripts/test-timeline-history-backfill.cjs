const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../supabase/functions/orca-timeline-discovery/index.ts'),'utf8')
  .replace(/^import .*\n/,'');
function event(i,override={}){
 return {date:String(1900+i)+'-06-15',category:'product',title:'Verified Ford milestone '+i,
  summary:'Ford Motor Company announced a documented historical event with evidence from its official corporate heritage records and dated materials.',
  source_url:'https://corporate.ford.com/articles/history/verified-event-'+i+'/',
  points:['A detailed original source supports this historical milestone','The specific development changed the company during this era'],
  why:'This development had enduring significance for Ford Motor Company.',...override};
}
async function run({existing=9,batches=[[event(90)]],usage=[{input_tokens:1000,output_tokens:1200,searches:1}],postStatus=200,verifiedUrls=[],budget,scope='history',official='https://corporate.ford.com',ticker='F',historyRows}={}){
 let handler,apiRequests=[],finished=[],reserves=0;
 const history=historyRows||Array.from({length:existing},(_,i)=>({
  id:'old'+i,title:'Existing milestone '+i,event_at:'19'+String(20+i).padStart(2,'0')+'-06-15',
  source_url:'https://corporate.ford.com/articles/history/existing-'+i+'/'
 }));
 const admin={
  auth:{getUser:async()=>({data:{user:{id:'u1'}},error:null})},
  rpc:async(name,args)=>{
   if(['orca_timeline_reserve_generation','orca_timeline_reserve_scoped_generation'].includes(name)){reserves++;return {data:{state:'reserved',run_id:'r1'},error:null}}
   if(name==='orca_timeline_finish_generation'){
    finished.push(args);
    return {data:{state:args.p_error_code?'failed':'ready',added:args.p_events.length},error:null};
   }
   throw Error('Unexpected RPC '+name);
  },
  from(table){
   const state={};
   const q={
    select(){return q},eq(){return q},neq(){return q},is(){return q},limit(){return q},order(){return q},
    single(){return Promise.resolve(table==='stocks'?{data:{company_name:'Ford Motor Company'},error:null}:{data:null,error:null})},
    maybeSingle(){return Promise.resolve(table==='orca_ai_company_profiles'?
     {data:{state:'ready',usage:{official_website:official}},error:null}:
     {data:null,error:null})},
    then(ok,bad){return Promise.resolve(table==='orca_timeline_annotations'?{data:history,error:null}:{data:null,error:null}).then(ok,bad)}
   };
   return q;
  }
 };
 const ctx={
  createClient:()=>admin,
  Deno:{env:{get:key=>key==='OPENAI_API_KEY'?'test-only-key':'ignored'},serve:fn=>handler=fn},
  URL,Request,Response,AbortController,setTimeout,clearTimeout,Date,console:{log(){},warn(){},error:console.error},
  fetch:async(url,opts)=>{
   if(url!=='https://api.openai.com/v1/responses'){
    const allowed=verifiedUrls.includes(url);
    return new Response(allowed?'Verified official company archival page':'Not found',{
     status:allowed?200:404,headers:{'content-type':'text/html'}});
   }
   const req=JSON.parse(opts.body);
   apiRequests.push(req);
   const i=apiRequests.length-1;
   const v=usage[i]||usage[usage.length-1];
   return new Response(JSON.stringify({
    output_text:JSON.stringify({milestones:batches[i]||[]}),
    usage:{input_tokens:v.input_tokens,output_tokens:v.output_tokens},
    output:Array.from({length:v.searches},()=>({type:'web_search_call',status:'completed',action:{sources:(batches[i]||[]).filter(e=>!e.unobserved).map(e=>({url:e.source_url}))}}))
   }),{status:postStatus,headers:{'Content-Type':'application/json'}});
  }
 };
 vm.createContext(ctx);
 vm.runInContext(stripTypeScriptTypes(source),ctx);
 const response=await handler(new Request('https://project.test/functions/v1/orca-timeline-discovery',{
  method:'POST',headers:{Authorization:'Bearer fake', 'Content-Type':'application/json'},
  body:JSON.stringify({ticker,scope,...(budget===undefined?{}:{max_budget_usd:budget})})
 }));
 return {status:response.status,body:await response.json(),requests:apiRequests,finished,reserves};
}
(async()=>{
 let t=await run({existing:9,batches:[[event(90)]]});
 assert.equal(t.status,200);assert.equal(t.requests.length,1);assert(t.requests[0].max_tool_calls<=2);
 assert.equal(t.requests[0].input.includes('missing_milestones":1'),true);
 assert.equal(t.finished[0].p_events.length,1);assert.equal(t.body.total_cached,10);
 assert.equal(t.body.targeted_search_attempted,true);
 console.log('PASS 9/10: one focused search completes 10 without rewriting old sources');

 t=await run({existing:7,batches:[[event(90)],[event(91)]]});
 assert.equal(t.status,200);assert.equal(t.requests.length,2);assert.equal(t.requests[0].max_tool_calls,5);
 assert(t.requests[1].max_tool_calls<=2);
 assert.equal(t.body.total_cached,9);assert.equal(t.finished[0].p_events.length,2);
 assert.equal(t.body.targeted_added,1);
 console.log('PASS 7/10: broad run at 8 followed by one targeted completion attempt');

 t=await run({existing:7,batches:[[event(90)],[event(90)]]});
 assert.equal(t.status,200);assert.equal(t.requests.length,2);assert.equal(t.body.total_cached,8);
 assert.equal(t.finished[0].p_events.length,1);
 console.log('PASS duplicate milestone is rejected and first accepted event is preserved');

 t=await run({existing:7,batches:[[event(90)],[event(91,{source_url:'https://example.org/forged'})]]});
 assert.equal(t.status,200);assert.equal(t.body.total_cached,8);
 console.log('PASS unrelated nonprimary domains rejected');

 t=await run({existing:7,batches:[[event(90)]],usage:[{input_tokens:100000,output_tokens:3000,searches:5}]});
 assert.equal(t.status,200);assert.equal(t.requests.length,1);
 assert.equal(t.body.targeted_search_attempted,false);
 assert.equal(t.body.total_cached,8);
 console.log('PASS no second request when insufficient budget headroom');

 t=await run({existing:10});
 assert.equal(t.status,200);assert.equal(t.reserves,0);assert.equal(t.requests.length,0);
 assert.equal(t.body.state,'cached');
 console.log('PASS full timeline does not reserve or spend');

 t=await run({existing:0,batches:[[event(1),event(2,{source_url:event(1).source_url})]]});
 assert.equal(t.body.total_cached,2);
 console.log('PASS one primary history page may support distinct milestones');
 t=await run({existing:0,batches:[[event(1,{unobserved:true})]]});
 assert.equal(t.status,503);assert.equal(t.finished[0].p_events.length,0);
 console.log('PASS invented or unobserved source URLs are rejected');
 t=await run({existing:0,batches:[[event(1,{unobserved:true})]],verifiedUrls:[event(1).source_url]});
 assert.equal(t.status,200);assert.equal(t.body.total_cached,1);
 console.log('PASS first-party source page accepted when citation metadata omitted but live URL verified');
 t=await run({existing:0,batches:[[event(1)]],usage:[{input_tokens:200000,output_tokens:3000,searches:5}]});
 assert.equal(t.status,503);assert.equal(t.finished[0].p_error_code,'cost_envelope_exceeded');
 console.log('PASS over-budget run cannot publish events');
 t=await run({existing:0,batches:[[event(1)]],budget:0.012});
 assert.equal(t.status,400);assert.equal(t.reserves,0);assert.equal(t.requests.length,0);
 console.log('PASS insufficient stage budget rejected before any reservation or provider spending');

 const y=new Date().getUTCFullYear();
 const metaEvent=event(1,{date:y+'-02-04',title:'Meta announces a material corporate development',
  source_url:'https://about.fb.com/news/'+y+'/02/verified-announcement/'});
 t=await run({scope:'current',ticker:'META',official:'https://www.meta.com/',existing:10,batches:[[metaEvent]]});
 assert.equal(t.status,200);assert.equal(t.finished[0].p_events.length,1);
 const input=JSON.parse(t.requests[0].input);
 assert.equal(input.current_year,y);assert.equal(input.period_start,y+'-01-01');
 assert.equal(input.as_of_date,new Date().toISOString().slice(0,10));
 assert(!t.requests[0].instructions.includes('FULL HISTORY'));
 assert(!t.requests[0].instructions.includes('unrepresented major historical era'));
 console.log('PASS Meta official newsroom and first-half calendar-year event accepted with explicit research dates');
 t=await run({scope:'current',official:'https://www.meta.com/',existing:10,batches:[[ {...metaEvent,source_url:'https://investor.atmeta.com/investor-news/press-release-details/'+y+'/release/default.aspx'} ]]});
 assert.equal(t.status,200);
 console.log('PASS Meta official investor relations alternate host accepted');
 for(const url of ['https://about.fb.com.evil.test/news/','https://evilatmeta.com/news/','https://investor.atmeta.com@evil.test/news/']){
  t=await run({scope:'current',official:'https://www.meta.com/',existing:10,batches:[[ {...metaEvent,source_url:url} ]]});
  assert.equal(t.status,503);assert.equal(t.finished[0].p_events.length,0);
 }
 for(const date of [(y-1)+'-12-31',(y+1)+'-01-01']){
  t=await run({scope:'current',official:'https://www.meta.com/',existing:10,batches:[[ {...metaEvent,date} ]]});
  assert.equal(t.status,503);
 }
 console.log('PASS unrelated hosts, old years and future events remain rejected');
 t=await run({scope:'origin',existing:0,batches:[[event(1,{title:'Facebook launches at Harvard'})]]});
 assert.equal(t.status,200);
 console.log('PASS backend founding validation matches legitimate launch-at-university event');
 console.log('ALL TARGETED TIMELINE TESTS PASSED');
})().catch(e=>{console.error(e);process.exitCode=1});
