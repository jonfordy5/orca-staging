const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const root=require('node:path').resolve(__dirname,'..');
const source=fs.readFileSync(root+'/supabase/functions/orca-timeline-photo-fill/index.ts','utf8').replace(/^import .*\n/,'');
let handler;
let requests=0;
const admin={auth:{getUser:async()=>({data:{user:{id:'test'}}})},from(table){
 let result;
 const query={select(columns,opts){
  if(table==='agent_profiles')result={data:[{id:'test'}]};
  if(table==='orca_timeline_photo_selections')result=opts?.head?{count:24}:columns==='created_at'?{data:[{created_at:'2026-11-05T03:00:00Z'}]}:{data:[]};
  if(table==='orca_timeline_annotations')result={data:[{id:'event',title:'DG Fresh',ticker:'DG'}]};
  if(table==='stocks')result={data:{company_name:'Dollar General'}};
  if(table==='orca_ai_company_profiles')result={data:null};
  return query;
 },eq(){return query},gte(){return query},is(){return query},order(){return query},limit(){return query},maybeSingle(){return query},then(resolve){resolve(result)}};
 return query;
}};
const ctx={createClient:()=>admin,Deno:{env:{get:()=>''},serve:fn=>handler=fn},URL,Response,Request,Date,AbortSignal,fetch:async()=>{requests++;throw Error('No provider request expected')}};
vm.createContext(ctx);
vm.runInContext(stripTypeScriptTypes(source)+ '\nglobalThis.api={companyTheme,eventVisualPlan,eventCandidateScore,pickCandidate};',ctx);
const {companyTheme,eventVisualPlan,eventCandidateScore,pickCandidate}=ctx.api;
const dg=companyTheme('DG','Dollar General','discount retailer');
const nvda=companyTheme('NVDA','NVIDIA','semiconductors');
const ulta=companyTheme('ULTA','Ulta Beauty','beauty retail');
const unknown=companyTheme('NEW','New Restaurant','restaurant');
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name)}
const candidate=(title,query='',score=40)=>({id:title,title,query,score,photographer:'Example'});
const listing=eventVisualPlan({title:'Returned to public trading on NYSE'},dg);
test('Query alone cannot approve an unrelated image',()=>assert.equal(eventCandidateScore(candidate('beach sunset',listing.queries[0],1000),listing),-Infinity));
test('Listing chooses stock exchange over higher-scoring grocery',()=>assert.equal(pickCandidate([candidate('grocery store shelves','',1000),candidate('new york stock exchange')],new Set(),new Map(),listing).title,'new york stock exchange'));
test('No eligible image produces no selection',()=>assert.equal(pickCandidate([candidate('grocery store shelves')],new Set(),new Map(),listing),null));
test('Reserved image is not selected again',()=>assert.equal(pickCandidate([candidate('stock exchange')],new Set(['stock exchange']),new Map(),listing),null));
test('DG Fresh selects food context',()=>assert.equal(eventVisualPlan({title:'Dollar General launches DG Fresh'},dg).kind,'grocery'));
for(const [name,profile] of [['NVDA',nvda],['ULTA',ulta],['future restaurant',unknown]])test(name+' expansion retains sector context',()=>{
 const p=eventVisualPlan({title:'International expansion overseas'},profile);
 assert.equal(p.queries.join('|'),profile.queries.slice(0,2).join('|'));
 assert(!p.queries.join(' ').includes('mexico'));
});
test('DG Mexico retains grocery context',()=>assert(eventVisualPlan({title:'First Mexican store'},dg).queries[0].includes('grocery')));
test('Cached photo without subject metadata cannot be approved',()=>assert.equal(eventCandidateScore(candidate(''),listing),-Infinity));
(async()=>{
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://jonfordy5.github.io',Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({ticker:'DG'})}));
 const payload=await response.json();
 test('Exhausted shared cap returns a specific state and retry time',()=>{assert.equal(response.status,429);assert.equal(payload.state,'daily_limit');assert.equal(payload.retry_at,'2026-11-06T03:00:00.000Z');assert.equal(requests,0)});
 const client=fs.readFileSync(root+'/orca-timeline-photos.js','utf8');
 const frontend={};vm.createContext(frontend);
 vm.runInContext(client.split('// Optional visual layer')[0].replace('export function','function')+'\nglobalThis.message=photoFailureMessage;',frontend);
 test('Daily limit is explained to the user',()=>assert.match(frontend.message(payload),/shared 24-photo daily allowance/));
 test('Sign-in error stays actionable',()=>assert.match(frontend.message({error:'Invalid sign-in'}),/Sign in again/));
 console.log(checks+' behavioral checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
