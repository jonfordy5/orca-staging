// Exercise the actual click handler with saved-data refreshes and provider responses.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../orca-living-timeline.js','utf8');
const handler=source.slice(source.indexOf(' async function maybePopulateCompanyHistory(){'),source.indexOf(' // Display cached history immediately;'));
const origins=source.match(/const isOrigin=e=>[\s\S]*?;\n/)[0];
const y=new Date().getUTCFullYear();
const historical=(title,i)=>({id:'old'+i,title,event_at:'2004-02-04',source_url:'https://www.meta.com/about/company-info/'});
const history=(origin='Facebook launches at Harvard')=>Array.from({length:10},(_,i)=>historical(i?'Historical milestone '+i:origin,i));
async function run({rows=[],failCurrent=false,historyCost=.06}={}){
 let saved=[...rows],requests=[],feedback='',photoCalls=0,missing=0;
 const ctx={Set,Number,Date,Math,ticker:'TEST',getUser:()=>({id:'u'}),checkHistoryPermission:async()=>true,
  rail:{querySelector:()=>null},frame:{querySelector:()=>null},
  showResearchFeedback:message=>feedback=message,
  loadEvents:async()=>{ctx.allVerified=[...saved]},
  updateCompleteAction(){},
  photoMount:{refresh:async()=>({missing,duplicates:0}),fillMissing:async()=>{photoCalls++;missing=0;return {added:1}}},
  sb:{functions:{invoke:async(name,{body})=>{
   requests.push(body);
   if(body.scope==='history'){
    saved=history();ctx.photoMissing=missing=10;
    return {data:{state:'ready',added:10,estimated_usd:historyCost}};
   }
   if(body.scope==='current'){
    if(failCurrent)return {error:{context:new Response(JSON.stringify({code:'no_acceptable_primary_source_milestones',estimated_usd:.02}))}};
    saved.push({...historical('Verified current year event',10),event_at:y+'-02-04'});ctx.photoMissing=++missing;
    return {data:{state:'ready',added:1,estimated_usd:.025}};
   }
   throw Error('Unnecessary scope '+body.scope);
  }}},Response,
  allVerified:[...saved],photoMissing:0,discoveryPending:false,researchFeedback:''};
 vm.createContext(ctx);
 vm.runInContext(`const year=()=>new Date().getUTCFullYear();\n${origins}
 const hasOrigin=()=>allVerified.some(isOrigin);
 const hasCurrentYear=()=>allVerified.some(e=>new Date(e.event_at).getUTCFullYear()===year());
 const initialHistoryGoal=10;
 const researchNeed=()=>!allVerified.length?'history':!hasCurrentYear()?'current':!hasOrigin()?'origin':allVerified.length<10?'history':'none';
 const mayRequestHistory=()=>!discoveryPending&&(researchNeed()!=='none'||photoMissing>0);
 ${handler}
 globalThis.complete=maybePopulateCompanyHistory;`,ctx);
 await ctx.complete();
 return {requests,saved,feedback,photoCalls};
}
(async()=>{
 let r=await run({rows:history()});
 assert.deepEqual(r.requests.map(x=>x.scope),['current']);assert.equal(r.saved.length,11);assert.equal(r.photoCalls,1);assert(r.feedback.includes('Timeline complete.'));
 console.log('PASS META: only current-year research, existing Harvard founding reused, new photo filled in same click');
 for(const origin of ['McDonald brothers open the first McDonald’s','Intel incorporates to pursue continuous innovation']){
  r=await run({rows:[...history(origin),{...historical('Current bulletin',10),event_at:y+'-02-04'}]});
  assert.equal(r.requests.length,0);assert.equal(r.photoCalls,0);assert.equal(r.saved.length,11);
 }
 console.log('PASS MCD/INTC: complete saved histories require no research or photo requests');
 r=await run();
 assert.deepEqual(r.requests.map(x=>x.scope),['history','current']);
 assert.equal(r.requests[0].max_budget_usd,.075);
 assert(r.requests[1].max_budget_usd>=.05);assert.equal(r.saved.length,11);assert.equal(r.photoCalls,1);
 assert(r.feedback.includes('Timeline complete.'));
 console.log('PASS empty stock: history followed by current-year research and photos in one click; current-year budget protected');
 r=await run({rows:history(),failCurrent:true});
 assert.equal(r.saved.length,10);assert(r.feedback.includes('Timeline incomplete:'));assert(r.feedback.includes('no verified '+y+' event'));assert(!r.feedback.includes('Timeline complete.'));
 console.log('PASS unavailable evidence reports incomplete and preserves all existing milestones');
})().catch(e=>{console.error(e);process.exitCode=1});
