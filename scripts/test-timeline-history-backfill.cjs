const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../supabase/functions/orca-timeline-discovery/index.ts'),'utf8')
  .replace(/^import .*\n/,'');
function event(i,override={}){
 return {date:'19'+String(20+i).padStart(2,'0')+'-06-15',category:'product',title:'Verified Ford milestone '+i,
  summary:'Ford Motor Company announced a documented historical event with evidence from its official corporate heritage records and dated materials.',
  source_url:'https://corporate.ford.com/articles/history/verified-event-'+i+'/',
  points:['A detailed original source supports this historical milestone','The specific development changed the company during this era'],
  why:'This development had enduring significance for Ford Motor Company.',...override};
}
async function run({existing=9,batches=[[event(90)]],usage=[{input_tokens:1000,output_tokens:1200,searches:1}],postStatus=200}={}){
 let handler,apiRequests=[],finished=[],reserves=0;
 const history=Array.from({length:existing},(_,i)=>({
  id:'old'+i,title:'Existing milestone '+i,event_at:'19'+String(20+i).padStart(2,'0')+'-06-15',
  source_url:'https://corporate.ford.com/articles/history/existing-'+i+'/'
 }));
 const admin={
  auth:{getUser:async()=>({data:{user:{id:'u1'}},error:null})},
  rpc:async(name,args)=>{
   if(name==='orca_timeline_reserve_generation'){reserves++;return {data:{state:'reserved',run_id:'r1'},error:null}}
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
     {data:{state:'ready',usage:{official_website:'https://corporate.ford.com'}},error:null}:
     {data:null,error:null})},
    then(ok,bad){return Promise.resolve(table==='orca_timeline_annotations'?{data:history,error:null}:{data:null,error:null}).then(ok,bad)}
   };
   return q;
  }
 };
 const ctx={
  createClient:()=>admin,
  Deno:{env:{get:key=>key==='OPENAI_API_KEY'?'test-only-key':'ignored'},serve:fn=>handler=fn},
  URL,Request,Response,AbortController,setTimeout,clearTimeout,Date,console,
  fetch:async(url,opts)=>{
   assert.equal(url,'https://api.openai.com/v1/responses');
   const req=JSON.parse(opts.body);
   apiRequests.push(req);
   const i=apiRequests.length-1;
   const v=usage[i]||usage[usage.length-1];
   return new Response(JSON.stringify({
    output_text:JSON.stringify({milestones:batches[i]||[]}),
    usage:{input_tokens:v.input_tokens,output_tokens:v.output_tokens},
    output:Array.from({length:v.searches},()=>({type:'web_search_call',status:'completed'}))
   }),{status:postStatus,headers:{'Content-Type':'application/json'}});
  }
 };
 vm.createContext(ctx);
 vm.runInContext(stripTypeScriptTypes(source),ctx);
 const response=await handler(new Request('https://project.test/functions/v1/orca-timeline-discovery',{
  method:'POST',headers:{Authorization:'Bearer fake', 'Content-Type':'application/json'},
  body:JSON.stringify({ticker:'F'})
 }));
 return {status:response.status,body:await response.json(),requests:apiRequests,finished,reserves};
}
(async()=>{
 let t=await run({existing:9,batches:[[event(90)]]});
 assert.equal(t.status,200);assert.equal(t.requests.length,1);assert.equal(t.requests[0].max_tool_calls,1);
 assert.equal(t.requests[0].input.includes('missing_milestones":1'),true);
 assert.equal(t.finished[0].p_events.length,1);assert.equal(t.body.total_cached,10);
 assert.equal(t.body.targeted_search_attempted,true);
 console.log('PASS 9/10: one focused search completes 10 without rewriting old sources');

 t=await run({existing:7,batches:[[event(90)],[event(91)]]});
 assert.equal(t.status,200);assert.equal(t.requests.length,2);assert.equal(t.requests[0].max_tool_calls,5);
 assert.equal(t.requests[1].max_tool_calls,1);
 assert.equal(t.body.total_cached,9);assert.equal(t.finished[0].p_events.length,2);
 assert.equal(t.body.targeted_added,1);
 console.log('PASS 7/10: broad run at 8 followed by one targeted completion attempt');

 t=await run({existing:7,batches:[[event(90)],[event(90,{title:'Different words, same source'})]]});
 assert.equal(t.status,200);assert.equal(t.requests.length,2);assert.equal(t.body.total_cached,8);
 assert.equal(t.finished[0].p_events.length,1);
 console.log('PASS duplicate source is rejected and first accepted event is preserved');

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

 console.log('ALL TARGETED TIMELINE TESTS PASSED');
})().catch(e=>{console.error(e);process.exitCode=1});
