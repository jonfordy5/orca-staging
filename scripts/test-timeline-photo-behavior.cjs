const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const root=require('node:path').resolve(__dirname,'..');
const source=fs.readFileSync(root+'/supabase/functions/orca-timeline-photo-fill/index.ts','utf8').replace(/^import .*\n/,'');
let handler;
let requests=0;
let photoCount=300;
let providerStatus=200;
let providerRemaining='49';
let providerLimit='50';
let providerKeyEnabled=false;
const admin={auth:{getUser:async()=>({data:{user:{id:'test'}}})},from(table){
 let result;
 const query={select(columns,opts){
  if(table==='agent_profiles')result={data:[{id:'test'}]};
  if(table==='orca_timeline_photo_selections')result=opts?.head?{count:photoCount}:columns==='created_at'?{data:[{created_at:'2026-11-05T03:00:00Z'}]}:{data:[]};
  if(table==='orca_timeline_annotations')result={data:[{id:'event',title:'DG Fresh',ticker:'DG'}]};
  if(table==='stocks')result={data:{company_name:'Dollar General'}};
  if(table==='orca_ai_company_profiles')result={data:null};
  return query;
 },eq(){return query},gte(){return query},is(){return query},order(){return query},limit(){return query},range(){return query},maybeSingle(){return query},then(resolve){resolve(result)}};
 return query;
}};
const ctx={createClient:()=>admin,Deno:{env:{get:name=>name==='UNSPLASH_ACCESS_KEY'&&providerKeyEnabled?'test':'',},serve:fn=>handler=fn},URL,Response,Request,Date,AbortSignal,fetch:async()=>{requests++;return new Response(providerStatus===200?JSON.stringify({results:[{id:'photo'}]}):'',{status:providerStatus,headers:{'Content-Type':'application/json','X-Ratelimit-Limit':providerLimit,'X-Ratelimit-Remaining':providerRemaining}})}};
vm.createContext(ctx);
vm.runInContext(stripTypeScriptTypes(source)+ '\nglobalThis.api={companyTheme,eventVisualPlan,visualQueries,eventCandidateScore,pickCandidate,companyPhotoIdentity,photoVenue,eventContextMatch,candidateFromUnsplash,numericHeader,providerMeta,providerMeaning,storedMatchType};',ctx);
const {companyTheme,eventVisualPlan,visualQueries,eventCandidateScore,pickCandidate,companyPhotoIdentity,photoVenue,eventContextMatch,candidateFromUnsplash,numericHeader,providerMeta,providerMeaning,storedMatchType}=ctx.api;
const dg=companyTheme('DG','Dollar General','discount retailer');
const nvda=companyTheme('NVDA','NVIDIA','semiconductors');
const ulta=companyTheme('ULTA','Ulta Beauty','beauty retail');
const unknown=companyTheme('NEW','New Restaurant','restaurant');

const ford=companyTheme('F','Ford Motor Company Common Stock','automotive manufacturer');
assert.equal(ford.brand,'ford');
assert.equal(ford.theme,'automotive');
assert.equal(Array.from(visualQueries(ford,[]))[0],'ford');
testFordSource();
function testFordSource(){
 const scenic={id:'ford-test-001',
  urls:{small:'https://images.unsplash.com/photo-001',regular:'https://images.unsplash.com/photo-001'},
  user:{name:'Automotive Author',links:{html:'https://unsplash.com/@author'}},
  links:{html:'https://unsplash.com/photos/ford-mustang-test',download_location:'https://api.unsplash.com/photos/ford-test-001/download'},
  alt_description:'Ford Mustang sports car on highway',description:'',slug:'ford-mustang-sports-car',tags:[]};
 const model=eventVisualPlan({title:"Mustang debuts at New York World's Fair"},ford);
 const company=candidateFromUnsplash(scenic,'ford',0,ford,[model]);
 assert(company,'Plain Ford search should accept a real photographed Mustang');
 assert.equal(company.company_match,true);
 const old=eventVisualPlan({title:'Ford Model T reaches its first customer'},ford);
 assert.equal(old.kind,'ford_vintage');
 assert.equal(model.kind,'ford_mustang');
 assert(eventCandidateScore(company,model)>eventCandidateScore(company,old));
 const unrelated={...scenic,id:'ford-failure',alt_description:'Ford theater with people in a hallway',description:'',slug:'ford-theater-building'};
 assert.equal(candidateFromUnsplash(unrelated,'ford',0,ford,[model]),null);
 console.log('PASS Ford search accepts multiple car models and rejects non-car Ford names');
}

let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name)}
const candidate=(title,query='',score=40)=>({id:title,title,query,score,photographer:'Example',company_match:companyPhotoIdentity(title,dg),venue:photoVenue(title)});
const listing=eventVisualPlan({title:'Returned to public trading on NYSE'},dg);
test('DG uses seven distinct short queries in deterministic order',()=>{
 const titles=['Merger','New York stock exchange listing','Leadership CEO appointment','DG Fresh grocery distribution','pOpshelf home goods','Mexico international expansion','New stores'];
 const q=Array.from(visualQueries(dg,titles.map(title=>({title}))));
 assert.deepEqual(q,[
  'dollar general','convenience store','retail storefront',
  'new york stock exchange','meeting boardroom',
  'grocery supermarket refrigerated','mexico grocery supermarket']);
 assert.equal(new Set(q).size,q.length);
});
test('Short search phrases still map to event-appropriate subjects',()=>{
 assert.equal(Array.from(eventVisualPlan({title:'Dollar General launches DG Fresh'},dg).queries)[0],'grocery supermarket refrigerated');
 assert.equal(Array.from(eventVisualPlan({title:'Dollar General returns to NYSE'},dg).queries)[0],'new york stock exchange');
 assert.equal(Array.from(eventVisualPlan({title:'First Mexican store opening'},dg).queries)[0],'mexico grocery supermarket');
});
test('Retail photo candidate is safely evaluated without undeclared const',()=>{
 const fake={id:'short-query-test',urls:{small:'https://images.unsplash.com/photo-123',regular:'https://images.unsplash.com/photo-123'},
  user:{name:'Photo Author',links:{html:'https://unsplash.com/@example'}},
  links:{html:'https://unsplash.com/photos/example-123',download_location:'https://api.unsplash.com/photos/example-123/download'},
  alt_description:'convenience store interior shelves',description:'',slug:'convenience-store-interior',tags:[]};
 const plan=eventVisualPlan({title:'Dollar General launched pOpshelf'},dg);
 const got=candidateFromUnsplash(fake,'convenience store',1,dg,[plan]);
 assert(got);
 assert.equal(got.retail_illustration,true);
});
test('Database photo match types remain within the live SQL constraint',()=>{
 const allowed=new Set(['exact_event','exact_subject','contextual','rejected']);
 const branded=storedMatchType({...candidate('dollar general store'),company_match:true});
 const illustrative=storedMatchType({...candidate('convenience store interior'),company_match:false,retail_illustration:true});
 assert.equal(branded,'exact_subject');
 assert.equal(illustrative,'contextual');
 assert(allowed.has(branded));
 assert(allowed.has(illustrative));
});
test('Query alone cannot approve an unrelated image',()=>assert.equal(eventCandidateScore(candidate('beach sunset',listing.queries[0],1000),listing),-Infinity));
test('Listing chooses stock exchange over higher-scoring grocery',()=>assert.equal(pickCandidate([candidate('grocery store shelves','',1000),candidate('new york stock exchange')],new Set(),new Map(),listing).title,'new york stock exchange'));
test('Metadata, not query, determines contextual eligibility',()=>{
 const plan=eventVisualPlan({title:'DG Fresh'},dg);
 assert.equal(eventContextMatch('supermarket refrigerated food section',plan),true);
 assert.equal(eventContextMatch('dollar general storefront at night',plan),false);
});
const grocery=eventVisualPlan({title:'DG Fresh refrigerated distribution'},dg);
const restaurantPlan=eventVisualPlan({title:'New Restaurant product launch'},unknown);
test('Event captions qualify independently from search strings',()=>{
 const contextual={...candidate('grocery supermarket refrigerated section'),context_kinds:['grocery']};
 assert(Number.isFinite(eventCandidateScore(contextual,grocery)));
 assert.equal(eventCandidateScore(contextual,listing),-Infinity);
});
test('Company image that actually matches the topic beats generic company fallback',()=>{
 const related={...candidate('dollar general grocery refrigerated shelves'),context_kinds:['grocery']};
 const generic=candidate('dollar general store at night');
 assert.equal(pickCandidate([generic,related],new Set(),new Map(),grocery).id,related.id);
});
test('Unrelated scene does not qualify another company',()=>{
 const wrong={...candidate('beach at sunset'),context_kinds:['merchandise']};
 assert.equal(eventCandidateScore(wrong,restaurantPlan),-Infinity);
});
test('No eligible image produces no selection',()=>assert.equal(pickCandidate([candidate('grocery store shelves')],new Set(),new Map(),listing),null));
test('Reserved image is not selected again',()=>assert.equal(pickCandidate([candidate('stock exchange')],new Set(['stock exchange']),new Map(),listing),null));
test('Convenience keyword expands Dollar General retrieval',()=>{
 const p=companyTheme('DG','Dollar General','discount retailer');
 assert(p.queries.some(q=>q.includes('convenience store interior')));
 assert(p.terms.includes('convenience store'));
});
test('Convenience interiors qualify only matching retail milestone subjects',()=>{
 const grocery=eventVisualPlan({title:'DG Fresh grocery distribution'},dg);
 const leadership=eventVisualPlan({title:'CEO leadership appointment'},dg);
 assert.equal(eventContextMatch('convenience store interior shelves',grocery),true);
 assert.equal(eventContextMatch('convenience store interior shelves',leadership),false);
});
test('Other sectors never inherit DG convenience-store searches',()=>{
 assert(!nvda.queries.some(q=>q.includes('convenience')));
 assert(!ulta.queries.some(q=>q.includes('convenience')));
});
test('A generic convenience store image may fill a DG illustration, not a factual event photo',()=>{
 const plan=eventVisualPlan({title:'Dollar General named Todd Vasos CEO'},dg);
 const convenience={...candidate('convenience store interior shelves'),retail_illustration:true};
 assert(Number.isFinite(eventCandidateScore(convenience,plan)));
 assert(eventCandidateScore(candidate('dollar general company storefront'),plan)>eventCandidateScore(convenience,plan));
});
test('Generic convenience images do not leak into other company sectors',()=>{
 const plan=eventVisualPlan({title:'NVIDIA named new CEO'},nvda);
 const standalone={...candidate('convenience store interior shelves'),retail_illustration:false};
 assert.equal(eventCandidateScore(standalone,plan),-Infinity);
});
test('DG Fresh selects food context',()=>assert.equal(eventVisualPlan({title:'Dollar General launches DG Fresh'},dg).kind,'grocery'));
for(const [name,profile] of [['NVDA',nvda],['ULTA',ulta],['future restaurant',unknown]])test(name+' expansion retains sector context',()=>{
 const p=eventVisualPlan({title:'International expansion overseas'},profile);
 assert.equal(p.queries.join('|'),profile.queries.slice(0,2).join('|'));
 assert(!p.queries.join(' ').includes('mexico'));
});
test('DG Mexico retains grocery context',()=>assert(eventVisualPlan({title:'First Mexican store'},dg).queries[0].includes('grocery')));
test('Cached photo without subject metadata cannot be approved',()=>assert.equal(eventCandidateScore(candidate(''),listing),-Infinity));
for(const title of ["mercadona supermarket storefront with orange brick building","waller's market storefront with red brick building","dixie grocery store with trees and sky","yellow beach shop storefront with outdoor seating","business meeting boardroom","grocery store shelves"]){
 test('Reject unrelated context: '+title,()=>assert.equal(pickCandidate([candidate(title)],new Set(),new Map(),eventVisualPlan({title:'DG store expansion'},dg)),null));
}
test('Real DG photo is an honest company fallback',()=>assert.equal(pickCandidate([candidate('dollar general store at night')],new Set(),new Map(),eventVisualPlan({title:'Todd Vasos named CEO'},dg)).company_match,true));
test('NYSE cannot fill a grocery event',()=>assert.equal(pickCandidate([candidate('new york stock exchange')],new Set(),new Map(),eventVisualPlan({title:'DG Fresh'},dg)),null));
test('Apple fruit does not establish company identity',()=>assert.equal(companyPhotoIdentity('apple on a table',companyTheme('AAPL','Apple Inc','consumer electronics')),false));
test('Full company phrase prevents dollar/general token collision',()=>assert.equal(companyPhotoIdentity('dollar bills in general circulation',dg),false));
test('Provider error codes are not conflated with rate limit',()=>{
 assert.equal(providerMeaning(200),'ok');
 assert.equal(providerMeaning(401),'invalid_key');
 assert.equal(providerMeaning(402),'payment_required');
 assert.equal(providerMeaning(403),'forbidden');
 assert.equal(providerMeaning(429),'rate_limited');
 assert.equal(providerMeaning(503),'provider_error');
});
test('Missing or malformed rate headers stay unknown',()=>{
 assert.equal(numericHeader(null),null);
 assert.equal(numericHeader('not a number'),null);
 assert.equal(numericHeader('-1'),null);
 assert.equal(numericHeader('0'),0);
});
(async()=>{
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://jonfordy5.github.io',Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({ticker:'DG'})}));
 const payload=await response.json();
 test('Exhausted shared cap returns a specific state and retry time',()=>{assert.equal(response.status,429);assert.equal(payload.state,'daily_limit');assert.equal(payload.limit,300);assert.equal(payload.retry_at,'2026-11-06T03:00:00.000Z');assert.equal(requests,0)});
 const client=fs.readFileSync(root+'/orca-timeline-photos.js','utf8');
 const frontend={};vm.createContext(frontend);
 vm.runInContext(client.split('// Optional visual layer')[0].replace('export function','function')+'\nglobalThis.message=photoFailureMessage;',frontend);
 test('Daily limit is explained to the user',()=>assert.match(frontend.message(payload),/shared 300-photo daily allowance/));
 test('Sign-in error stays actionable',()=>assert.match(frontend.message({error:'Invalid sign-in'}),/Sign in again/));
 for(const count of [24,299,300,301]){
  photoCount=count;
  const result=await handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://jonfordy5.github.io',Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({ticker:'DG'})}));
  const body=await result.json();
  test('Development quota boundary at '+count,()=>{
   if(count>=300){assert.equal(result.status,429);assert.equal(body.limit,300)}
   else{assert.equal(result.status,503);assert.equal(body.error,'Unsplash access key is not configured')}
  });
 }
 test('UI uses limit returned by server',()=>assert.match(frontend.message({state:'daily_limit',limit:450}),/shared 450-photo/));
 providerKeyEnabled=true;
 for(const status of [200,401,402,403,429]){
  const previous=requests;
  providerStatus=status;
  const result=await handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://jonfordy5.github.io',Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({ticker:'DG',diagnostic:true})}));
  const data=await result.json();
  test('One request, no writes and distinct provider status '+status,()=>{
   assert.equal(result.status,200);
   assert.equal(requests-previous,1);
   assert.equal(data.http_status,status);
   assert.equal(data.requests_made,1);
   assert.equal(data.rate_limit,50);
   assert.equal(data.rate_remaining,49);
   assert.equal(data.photo_records_changed,0);
   assert.equal(data.meaning,providerMeaning(status));
  });
 }
 console.log(checks+' behavioral checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
