// Execute the actual click handler and persisted-status loader with staged replies.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../orca-living-timeline.js','utf8');
const handler=source.slice(source.indexOf(' async function maybePopulateCompanyHistory(){'),source.indexOf(' // Display cached history immediately;'));
const helpers=source.slice(source.indexOf(' let blockedScopes='),source.indexOf(' let discoveryPending='));
const origins=source.match(/const isOrigin=e=>[\s\S]*?;\n/)[0];
const y=new Date().getUTCFullYear();
const historical=(title,i)=>({id:'old'+i,title,event_at:'2004-02-04',source_url:'https://www.meta.com/about/company-info/'});
const history=(count=10,origin='Facebook launches at Harvard')=>Array.from({length:count},(_,i)=>historical(i?'Historical milestone '+i:origin,i));
const current=()=>({...historical('Verified current year event',10),event_at:y+'-02-04'});
async function run({rows=[],initial=10,failCurrent=false,gapLimit=10,historyCost=.04068,currentCost=.03109,gapCost=.024,stopped={}}={}){
 let saved=structuredClone(rows),requests=[],statusCalls=0,feedback='',photoCalls=0,missing=0,historyCalls=0;
 let stored=structuredClone(stopped);
 const ctx={Set,Number,Date,Math,Object,ticker:'TEST',getUser:()=>({id:'u'}),checkHistoryPermission:async()=>true,
  rail:{querySelector:()=>null},frame:{querySelector:()=>null},
  showResearchFeedback:message=>feedback=message,
  loadEvents:async()=>{ctx.allVerified=structuredClone(saved)},
  updateCompleteAction(){},
  photoMount:{refresh:async()=>({missing,duplicates:0}),fillMissing:async()=>{photoCalls++;missing=0;return {added:1}}},
  sb:{functions:{invoke:async(name,{body})=>{
   if(body.scope==='status'){statusCalls++;return {data:{stopped:stored}}}
   requests.push(body);
   if(body.scope==='history'){
    historyCalls++;
    const n=historyCalls===1&&!saved.length?initial:Math.min(gapLimit,10-saved.length);
    const added=Array.from({length:n},(_,i)=>historical(saved.length+i?'Gap milestone '+(saved.length+i):'Facebook launches at Harvard',saved.length+i));
    saved.push(...added);ctx.photoMissing=missing+=added.length;
    const reason=saved.length>=10?'target_reached':historyCalls===1?'budget_limit':gapLimit===0?'source_limit':'budget_limit';
    const details={reason,terminal:reason==='source_limit'||body.final_history_pass,followup_eligible:saved.length<10&&reason!=='source_limit'&&!body.final_history_pass};
    if(details.terminal)stored.history=details;
    return {data:{state:'ready',added:n,run_id:'r'+historyCalls,estimated_usd:historyCalls===1?historyCost:gapCost,completion_details:details}};
   }
   if(body.scope==='current'){
    if(failCurrent){stored.current={reason:'source_limit',terminal:true};return {error:{context:new Response(JSON.stringify({code:'no_acceptable_primary_source_milestones',estimated_usd:.02}))}}}
    saved.push(current());ctx.photoMissing=++missing;
    return {data:{state:'ready',added:1,run_id:'current',estimated_usd:currentCost}};
   }
   throw Error('Unnecessary scope '+body.scope);
  }}},Response,
  allVerified:structuredClone(saved),photoMissing:0,discoveryPending:false,researchFeedback:''};
 vm.createContext(ctx);
 vm.runInContext(`const year=()=>new Date().getUTCFullYear();\n${origins}
 const hasOrigin=()=>allVerified.some(isOrigin);
 const hasCurrentYear=()=>allVerified.some(e=>new Date(e.event_at).getUTCFullYear()===year());
 const initialHistoryGoal=10;
 const researchNeed=()=>!allVerified.length?'history':!hasCurrentYear()?'current':!hasOrigin()?'origin':allVerified.length<10?'history':'none';
 ${helpers}\n${handler}
 globalThis.bootstrap=loadCompletionStatus;
 globalThis.complete=maybePopulateCompanyHistory;
 globalThis.eligible=needsResearch;
 globalThis.limitations=limitationText;`,ctx);
 await ctx.bootstrap();await ctx.complete();
 return {requests,saved,feedback,photoCalls,statusCalls,stored,eligible:ctx.eligible(),limitations:ctx.limitations()};
}
(async()=>{
 let r=await run({rows:history()});
 assert.deepEqual(r.requests.map(x=>x.scope),['current']);assert.equal(r.saved.length,11);assert.equal(r.photoCalls,1);assert(r.feedback.includes('Timeline complete.'));
 console.log('PASS META: existing founding/history reused; current-year event and photo finish in one click');
 for(const origin of ['Facebook launches at Harvard','McDonald brothers open the first McDonald’s','Intel incorporates to pursue continuous innovation','Sam Walton opens first Walmart in Rogers']){
  r=await run({rows:[...history(10,origin),current()]});
  assert.equal(r.requests.length,0);assert.equal(r.photoCalls,0);assert.equal(r.saved.length,11);assert.equal(r.eligible,false);
 }
 console.log('PASS WMT/META/INTC/MCD: saved completion has no research calls, image calls or completion action');
 const teslaBefore=[...history(6,'Tesla is incorporated in Delaware'),current()];
 r=await run({rows:teslaBefore,historyCost:.03834});
 assert.deepEqual(r.requests.map(x=>x.scope),['history']);
 assert.equal(r.saved.length,10);assert.deepEqual(r.saved.slice(0,7),teslaBefore);
 assert.equal(r.photoCalls,1);assert.equal(r.eligible,false);
 console.log('PASS saved TSLA 6+1: one focused history stage fills three gaps without repeating current year, founding or existing history');
 for(const initial of [4,6,8,9,10]){
  r=await run({initial});
  assert.deepEqual(r.requests.map(x=>x.scope),initial<9?['history','current','history']:['history','current']);
  assert.equal(r.requests[0].max_budget_usd,.075);
  assert(r.requests[1].max_budget_usd>=.05);
  assert.equal(r.saved.length,initial===10?11:10);
  assert.equal(r.photoCalls,1);assert.equal(r.eligible,false);assert(r.feedback.includes('Timeline complete.'));
  if(initial<9)assert.equal(r.requests[2].final_history_pass,true);
  const costs=r.requests.map(x=>x.scope==='current'?.03109:x.final_history_pass?.024:.04068);
  let spent=0;for(let i=0;i<costs.length;i++){assert(costs[i]<=r.requests[i].max_budget_usd);spent+=costs[i]}
  assert(spent<=.15);assert.equal(new Set(r.saved.map(x=>x.id)).size,r.saved.length);
 }
 console.log('PASS 4/6/8/9/10 partial histories: all eligible stages run in one click with accurate shared allocations');
 r=await run({initial:6,gapLimit:0});
 assert.equal(r.saved.length,7);assert(r.feedback.includes('Timeline incomplete:'));assert.equal(r.eligible,false);
 assert(r.limitations.includes('no additional original-source evidence'));
 const reload=await run({rows:r.saved,stopped:r.stored});
 assert.equal(reload.requests.length,0);assert.equal(reload.eligible,false);
 console.log('PASS no verified gap evidence: credible history preserved, reason cached, refresh offers no repeated paid completion');
 r=await run({initial:4,historyCost:.074,currentCost:.045,gapCost:.03,gapLimit:2});
 assert.equal(r.saved.length,7);assert(r.feedback.includes('$0.149'));assert.equal(r.eligible,false);
 assert(r.limitations.includes('shared research budget used'));
 console.log('PASS budget-limited final history pass saves partial results, reports $0.149 and stops');
 r=await run({rows:history(),failCurrent:true});
 assert.equal(r.saved.length,10);assert(r.feedback.includes('no verified '+y+' event'));assert.equal(r.eligible,false);
 console.log('PASS unverifiable current-year evidence leaves an explicit cached limitation');
})().catch(e=>{console.error(e);process.exitCode=1});
