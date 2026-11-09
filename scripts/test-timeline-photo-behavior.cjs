const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync(__dirname+'/../supabase/functions/orca-timeline-photo-fill/index.ts','utf8').replace(/^import .*\n/,'');
const photo=(id,alt='')=>({id,width:1600,height:1000,alt_description:alt,
 urls:{regular:'https://images.unsplash.com/photo-'+id+'?w=900',raw:'https://images.unsplash.com/photo-'+id},
 links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
 user:{name:'Photographer',links:{html:'https://unsplash.com/@photographer'}}});
function harness({signedIn=true,consent=true,locked=true,events=[],cached=[],job={queries:['oil refinery'],brand_search_version:13}}={}){
 let handler,network=0,unlocks=0;
 const admin={auth:{getUser:async()=>({data:{user:signedIn?{id:'owner'}:null}})},
 rpc:async()=>({data:locked}),from(table){
 let result={data:table==='agent_profiles'?(consent?[{id:'researcher'}]:[]):table==='orca_timeline_annotations'?events:table==='orca_timeline_photo_selections'?cached:table==='orca_timeline_photo_jobs'?job:null};
 const q={select(){return q},eq(){return q},is(){return q},neq(){return q},order(){return q},limit(){return q},range(){return q},
 single(){return Promise.resolve(result)},maybeSingle(){return Promise.resolve(result)},update(){unlocks++;return q},then(resolve){return Promise.resolve(result).then(resolve)}};return q;
 }};
 const ctx={createClient:()=>admin,Deno:{env:{get:()=>''},serve:f=>handler=f},URL,URLSearchParams,Response,Request,AbortSignal,crypto,console,
 fetch:async()=>{network++;throw Error('Unexpected provider call')}};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(source)+'\nglobalThis.api={candidate,originalUrl,businessQueries,brandMatch,commonsCandidate,recognizableName};',ctx);
 return {api:ctx.api,invoke:async()=>{
 const r=await handler(new Request('https://test',{method:'POST',headers:{Origin:'https://jonfordy5.github.io',Authorization:'Bearer test'},body:JSON.stringify({ticker:'CVX'})}));
 return {status:r.status,body:await r.json(),network,unlocks};
 }};
}
(async()=>{
 const {api}=harness();
 for(const subject of ['oil refinery','rocket launch','car parts','computer chip','makeup','hamburger','electric car','steak','supermarket','']){
  assert(api.candidate(photo('x',subject),'business subject'));
 }
 console.log('PASS business photos and sparse metadata need no company, era, or event match');
 assert.equal(api.candidate({...photo('x'),premium:true},'test'),null);
 assert.equal(api.candidate(photo('x','AI generated illustration'),'test'),null);
 assert.equal(api.candidate({...photo('x'),urls:{regular:'https://bad.example/x'}},'test'),null);
 assert.equal(api.originalUrl('https://images.unsplash.com/photo-a?w=200'),api.originalUrl('https://images.unsplash.com/photo-a?w=900'));
 console.log('PASS unusable/unlicensed assets rejected; original URL ignores crop variants');
 for(const opts of [{signedIn:false},{consent:false}]){
  const r=await harness(opts).invoke();assert([401,403].includes(r.status));assert.equal(r.network,0);
 }
 let r=await harness({locked:false}).invoke();assert.equal(r.body.state,'building');assert.equal(r.network,0);
 r=await harness().invoke();assert.equal(r.body.state,'history_required');assert.equal(r.network,0);assert.equal(r.unlocks,1);
 console.log('PASS authorization, in-flight duplicate guard and history-before-photos');
 for(const ticker of ['AAP','AAPL','AMZN','DG','F','MSFT','NVDA','RKLB','ULTA']){
  const events=Array.from({length:12},(_,i)=>({id:ticker+i}));
  const cached=events.map((e,i)=>({event_id:e.id,photo_id:String(i),image_url:'https://images.unsplash.com/photo-'+i,full_image_url:'https://images.unsplash.com/photo-'+i,needs_review:true}));
  r=await harness({events,cached}).invoke();assert.equal(r.body.state,'cached');assert.equal(r.network,0);
 }
 console.log('PASS all nine completed timelines retain cached covers, including old relevance flags');
 const front={};vm.createContext(front);
 vm.runInContext(fs.readFileSync(__dirname+'/../orca-timeline-photos.js','utf8').split('// Optional visual layer')[0].replaceAll('export function','function')+'\nglobalThis.art=timelineIllustration;',front);
 const art=Array.from({length:20},(_,i)=>front.art('CVX','event-'+i,i));assert.equal(new Set(art).size,20);
 console.log('PASS unique original artwork for every missing cover');
})().catch(e=>{console.error(e);process.exitCode=1});
module.exports={photo};
