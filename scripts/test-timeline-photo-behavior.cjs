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
vm.runInContext(stripTypeScriptTypes(source)+ '\nglobalThis.api={companyTheme,eventVisualPlan,visualQueries,eventCandidateScore,pickCandidate,companyPhotoIdentity,photoVenue,eventContextMatch,candidateFromUnsplash,numericHeader,providerMeta,providerMeaning,storedMatchType,fromCommons,chooseCommons};',ctx);
const {companyTheme,eventVisualPlan,visualQueries,eventCandidateScore,pickCandidate,companyPhotoIdentity,photoVenue,eventContextMatch,candidateFromUnsplash,numericHeader,providerMeta,providerMeaning,storedMatchType,fromCommons,chooseCommons}=ctx.api;
const dg=companyTheme('DG','Dollar General','discount retailer');
const nvda=companyTheme('NVDA','NVIDIA','semiconductors');
const ulta=companyTheme('ULTA','Ulta Beauty','beauty retail');
const unknown=companyTheme('NEW','New Restaurant','restaurant');

let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name)}
const amazon=companyTheme('AMZN','Amazon.com Inc. Common Stock','online stores, AWS cloud');
const wholeFoodsPlan=eventVisualPlan({title:'Amazon completes Whole Foods acquisition'},amazon);
const souqPlan=eventVisualPlan({title:'Amazon closes Souq Group acquisition'},amazon);
const amazonCompanyPlan=eventVisualPlan({title:'Amazon reports third-quarter revenue'},amazon);
test('Amazon searches its own company and acquired brand names',()=>{
 assert.equal(amazon.brand,'amazon');
 assert.equal(amazon.theme,'amazon commerce');
 assert.equal(wholeFoodsPlan.kind,'amazon_whole_foods');
 assert.equal(souqPlan.kind,'amazon_souq');
 assert.deepEqual(Array.from(visualQueries(amazon,[])).slice(0,4),[
  'amazon','amazon delivery','whole foods market','amazon whole foods']);
});
const photoMock=(id,description)=>({
 id,urls:{small:'https://images.unsplash.com/photo-'+id,regular:'https://images.unsplash.com/photo-'+id},
 user:{name:'Mock Photographer',links:{html:'https://unsplash.com/@mock'}},
 links:{html:'https://unsplash.com/photos/mock-'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
 alt_description:description,description:'',slug:description.toLowerCase().replace(/\s+/g,'-'),tags:[]
});
test('Amazon rejects unrelated store brands even with storefront query',()=>{
 for(const d of ['Waller’s Market storefront red brick building',
                 'Mercadona supermarket storefront orange brick building',
                 'Acme Maison storefront wooden beams']){
  const c=candidateFromUnsplash(photoMock('bad',d),'retail storefront exterior',4,amazon,[wholeFoodsPlan]);
  assert.equal(c,null,d);
 }
});
test('Amazon accepts a Whole Foods photo on its acquisition event',()=>{
 const c=candidateFromUnsplash(photoMock('wholefoods','Whole Foods Market grocery store sign'),
  'whole foods market',2,amazon,[wholeFoodsPlan]);
 assert(c,'Actual Whole Foods Market photo should qualify');
 assert(Number.isFinite(eventCandidateScore(c,wholeFoodsPlan)));
 assert.equal(c.company_match,false);
 assert.equal(eventCandidateScore(c,amazonCompanyPlan),-Infinity);
});
test('Amazon accepts a recognizable corporate photo but not false company identity',()=>{
 const c=candidateFromUnsplash(photoMock('amazonlogo','Amazon logo on delivery warehouse building'),
  'amazon',0,amazon,[amazonCompanyPlan]);
 assert(c);
 assert.equal(c.company_match,true);
 const bad=candidateFromUnsplash(photoMock('forest','Amazon rainforest canopy in Brazil'),
  'amazon',0,amazon,[amazonCompanyPlan]);
 assert.equal(bad,null);
});


const rklb=companyTheme('RKLB','Rocket Lab Corporation','launch vehicles and satellite services');
const rklbEvents=Array.from({length:11},(_,i)=>({title:'Rocket Lab mission '+i}));
const rklbPlan=eventVisualPlan(rklbEvents[0],rklb);
test('Rocket Lab searches rocket first and accepts unique generic rocket launches',()=>{
 assert.equal(visualQueries(rklb,rklbEvents)[0],'rocket');
 assert.equal(rklbPlan.kind,'rocket_illustration');
 const pool=Array.from({length:11},(_,i)=>candidateFromUnsplash(
  photoMock('rocket-'+i,'A rocket launch lifting off from launchpad '+i),
  'rocket',0,rklb,[rklbPlan]));
 assert(pool.every(Boolean),'Generic rocket photos should not require Rocket Lab branding');
 const reserved=new Set();
 for(let i=0;i<11;i++){
  const picked=pickCandidate(pool,reserved,new Map(),rklbPlan);
  assert(picked&&!reserved.has(picked.id));
  reserved.add(picked.id);
 }
 assert.equal(reserved.size,11);
 assert.equal(candidateFromUnsplash(photoMock('toy','Toy rocket illustration graphic'),'rocket',0,rklb,[rklbPlan]),null);
 assert.equal(candidateFromUnsplash(photoMock('salad','Rocket salad arugula leaves'),'rocket',0,rklb,[rklbPlan]),null);
});
const aap=companyTheme('AAP','Advance Auto Parts Inc.','automotive aftermarket parts retailer');
const aapAcquisition=eventVisualPlan({title:'Advance acquires Carquest and Worldpac parent in 2014'},aap);
const aapDiehard=eventVisualPlan({title:'Advance acquires the DieHard brand for $200 million'},aap);
const aapOrdinary=eventVisualPlan({title:'Advance Auto Parts filed its 2005 annual report'},aap);
test('AAP searches branded and broad automotive component photos',()=>{
 assert.equal(aap.theme,'auto parts retail');
 assert.equal(aapAcquisition.kind,'aap_carquest');
 assert.equal(aapDiehard.kind,'aap_diehard');
 assert.deepEqual(Array.from(visualQueries(aap,[])).slice(0,5),
  ['advance auto parts store','car engine','car parts','automotive brake pads','car battery']);
});
test('AAP generic engine and component photos fill every milestone without duplicates',()=>{
 const subjects=['car engine bay','automotive brake pads','car alternator','car oil filter','car battery','car piston','spark plugs','radiator car part','vehicle transmission','car wheel bearings'];
 const pool=subjects.map((subject,i)=>candidateFromUnsplash(photoMock('aap-'+i,subject),'car parts',1,aap,
  [aapOrdinary,aapAcquisition,aapDiehard])).filter(Boolean);
 assert.equal(pool.length,10);
 const used=new Set();
 for(const event of [aapOrdinary,aapAcquisition,aapDiehard,...Array.from({length:7},()=>aapOrdinary)]){
  const candidate=pickCandidate(pool,used,new Map(),event);
  assert(candidate,'Every AAP event should have a parts photo');
  assert(!used.has(candidate.id),'Photo reused across events');
  used.add(candidate.id);
 }
 assert.equal(used.size,10);
});
test('AAP acquired brands qualify only for their own events',()=>{
 const parts=candidateFromUnsplash(photoMock('parts','auto parts store shelves and car batteries'),'auto parts store',1,aap,[aapOrdinary,aapAcquisition,aapDiehard]);
 const carquest=candidateFromUnsplash(photoMock('carquest','Carquest auto parts retail storefront'),'carquest auto parts',1,aap,[aapOrdinary,aapAcquisition,aapDiehard]);
 const diehard=candidateFromUnsplash(photoMock('diehard','DieHard automotive battery on shelf'),'diehard car battery',1,aap,[aapOrdinary,aapAcquisition,aapDiehard]);
 assert(parts);
 assert(carquest);
 assert(diehard);
 assert(Number.isFinite(eventCandidateScore(carquest,aapAcquisition)));
 assert(Number.isFinite(eventCandidateScore(diehard,aapDiehard)));
 assert.equal(eventCandidateScore(carquest,aapOrdinary),-Infinity);
 assert.equal(eventCandidateScore(diehard,aapOrdinary),-Infinity);
 assert.equal(candidateFromUnsplash(photoMock('competitor','AutoZone retail parts store'),'auto parts store',1,aap,[aapOrdinary]),null);
 assert.equal(candidateFromUnsplash(photoMock('scrap','scrapyard car wreckage and spare parts'),'auto parts store',1,aap,[aapOrdinary]),null);
});


const commonsMock=(id,name,license='CC BY-SA 4.0')=>({
 pageid:id,title:'File:'+name+'.jpg',imageinfo:[{
  thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/photo.jpg/900px-photo.jpg',
  url:'https://upload.wikimedia.org/wikipedia/commons/a/aa/photo.jpg',
  descriptionurl:'https://commons.wikimedia.org/wiki/File:'+name.replace(/\s+/g,'_')+'.jpg',
  user:'Contributor',extmetadata:{LicenseShortName:{value:license},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'},Artist:{value:'Test Photographer'}}
 }]
});
test('Commons photos require a verified reuse license and relevant company subject',()=>{
 const good=fromCommons(commonsMock(1,'Rocket Lab Electron rocket launch'),'RKLB','Rocket Lab Electron');
 assert(good&&good.source_type==='wikimedia_commons');
 assert.equal(good.license_name,'CC BY-SA 4.0');
 assert.equal(fromCommons(commonsMock(2,'Rocket Lab Electron rocket launch','CC BY-NC 4.0'),'RKLB','Rocket Lab Electron'),null);
 assert.equal(fromCommons(commonsMock(3,'Random beach sunset'),'RKLB','Rocket Lab'),null);
 assert.equal(fromCommons(commonsMock(4,'Ulta Beauty retail store'),'ULTA','Ulta Beauty store')?.id,'commons:4');
});
test('Commons selection keeps every timeline photo ID unique',()=>{
 const pool=Array.from({length:11},(_,i)=>fromCommons(commonsMock(10+i,'Rocket Lab Electron launch '+i),'RKLB','Rocket Lab Electron'));
 assert(pool.every(Boolean));
 const used=new Set();
 for(let i=0;i<11;i++){
  const p=chooseCommons(pool,{title:'Rocket Lab Electron launch'},used);
  assert(p);assert(!used.has(p.id));used.add(p.id);
 }
 assert.equal(used.size,11);
 assert.equal(chooseCommons(pool,{title:'Rocket Lab launch'},used),null);
});

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
