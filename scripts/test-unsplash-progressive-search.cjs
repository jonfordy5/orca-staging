const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {stripTypeScriptTypes}=require('node:module');
const src=fs.readFileSync(path.join(__dirname,'../supabase/functions/orca-timeline-photo-fill/index.ts'),'utf8').replace(/^import .*\n/,'');
const calls=[],responses=new Map();
const photo=(id,label)=>({
 id,urls:{small:'https://images.unsplash.com/photo-'+id,regular:'https://images.unsplash.com/photo-'+id},
 user:{name:'Test photographer',links:{html:'https://unsplash.com/@test'}},
 links:{html:'https://unsplash.com/photos/test-'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
 alt_description:label,description:'',slug:label.toLowerCase().replace(/[^a-z0-9]+/g,'-'),tags:[]
});
const ctx={
 createClient:()=>({}),Deno:{env:{get:()=>''},serve:()=>{}},
 URL,Response,Date,AbortSignal,console,
 fetch:async url=>{
  const query=new URL(url).searchParams.get('query');
  calls.push(query);
  return new Response(JSON.stringify({results:responses.get(query)||[]}),{status:200,
   headers:{'Content-Type':'application/json','X-Ratelimit-Limit':'50','X-Ratelimit-Remaining':'11'}});
 }
};
vm.createContext(ctx);
vm.runInContext(stripTypeScriptTypes(src)+'\nglobalThis.testAPI={companyTheme,eventVisualPlan,visualQueries,findUnsplashCandidates,maxSearchRequestsPerFill,unfilledAfterPreview};',ctx);
const {companyTheme,eventVisualPlan,visualQueries,findUnsplashCandidates,maxSearchRequestsPerFill,unfilledAfterPreview}=ctx.testAPI;
const ford=companyTheme('F','Ford Motor Company','automotive manufacturer');
const events=[{id:'a',title:'Ford launches the Mustang'},{id:'b',title:'Ford launches F-150 pickup truck'}];
const plans=events.map(e=>eventVisualPlan(e,ford));
const queries=visualQueries(ford,events);
async function search(data){
 calls.length=0;responses.clear();
 for(const [k,v] of data)responses.set(k,v);
 const r=await findUnsplashCandidates('unused',queries,ford,plans,events,new Set(),new Map());
 assert(r.requests_made<=3,'Three-search ceiling must hold');
 assert.deepEqual(Array.from(r.queries_tried),calls);
 assert.equal(calls[0],'ford','Brand must be searched first');
 return r;
}
(async()=>{
 assert.equal(maxSearchRequestsPerFill,3);
 let r=await search([['ford',[photo('mustang','Ford Mustang sports car'),photo('pickup','Ford F150 pickup truck')]]]);
 assert.equal(r.requests_made,1);
 assert.equal(unfilledAfterPreview(events,r.candidates,new Set(),ford,new Map()).length,0);
 console.log('PASS one company search covers all with no extra calls');
 r=await search([['ford',[photo('mustang','Ford Mustang sports car')]],['ford truck',[photo('pickup','Ford F150 pickup truck')]]]);
 assert.equal(r.requests_made,2);
 assert.equal(unfilledAfterPreview(events,r.candidates,new Set(),ford,new Map()).length,0);
 console.log('PASS one missing event triggers one extra targeted search');
 r=await search([['ford',[photo('mustang','Ford Mustang sports car')]],['ford truck',[]],['ford f150',[photo('pickup','Ford F150 pickup truck')]]]);
 assert.equal(r.requests_made,3);
 assert.equal(unfilledAfterPreview(events,r.candidates,new Set(),ford,new Map()).length,0);
 console.log('PASS three-call maximum and targeted rescue');
 r=await search([['ford',[]]]);
 assert.equal(r.requests_made,3);
 console.log('PASS no fabrication when three allowed searches fail');
 console.log('All progressive Unsplash tests passed without a live API call.');
})().catch(e=>{console.error(e);process.exitCode=1});
