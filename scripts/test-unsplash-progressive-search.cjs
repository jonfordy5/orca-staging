const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const src=fs.readFileSync(__dirname+'/../supabase/functions/orca-timeline-photo-fill/index.ts','utf8').replace(/^import .*\n/gm,'');
const make=(id)=>({id,width:1500,height:1000,urls:{regular:'https://images.unsplash.com/photo-'+id,raw:'https://images.unsplash.com/photo-'+id},links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},user:{name:'Creator',links:{html:'https://unsplash.com/@creator'}}});
const queries=['oil refinery','oil rig','pipeline','pumpjack'];
async function run(pools,needed,{usedIds=[],usedUrls=[],broken=[],status=200}={}){
 const searches=[],downloads=[],saves=[];
 const context={isVerifiedOrcaBrowserToken:()=>true,createClient:()=>({}),Deno:{env:{get:()=>''},serve:()=>{}},URL,URLSearchParams,Response,AbortSignal,console,
 fetch:async(url,opts)=>{
  const u=new URL(url);
  if(opts?.method==='HEAD')return new Response(null,{status:broken.includes(u.pathname)?404:200,headers:{'content-type':'image/jpeg'}});
  if(u.pathname.endsWith('/download')){downloads.push(u.pathname);return new Response('{}')}
  const q=u.searchParams.get('query');searches.push(q);
  return new Response(JSON.stringify({results:(pools[q]||[])}),{status,headers:{'X-Ratelimit-Remaining':'40'}});
 }};
 vm.createContext(context);vm.runInContext(stripTypeScriptTypes(src)+'\nglobalThis.select=selectPhotos;',context);
 const result=await context.select('test',queries,needed,new Set(usedIds),new Set(usedUrls),async p=>{saves.push(p);return true});
 return {result,searches,downloads,saves};
}
(async()=>{
 let r=await run({'oil refinery':Array.from({length:30},(_,i)=>make(i))},10);
 assert.equal(r.searches.length,1);assert.equal(r.saves.length,10);assert.equal(r.downloads.length,10);
 console.log('PASS first broad search stops immediately at ten unique covers and tracks downloads');
 r=await run({'oil refinery':[make('a'),make('a')],'oil rig':[make('b'),make('c')]},3);
 assert.equal(r.searches.length,2);assert.equal(r.saves.length,3);
 console.log('PASS only missing covers trigger related search; repeated IDs never selected');
 const variant={...make('different-id'),urls:make('a').urls};
 r=await run({'oil refinery':[make('a'),variant,make('b'),make('c')]},2,{usedUrls:['https://images.unsplash.com/photo-a'],broken:['/photo-b']});
 assert.equal(r.saves.length,1);assert.equal(r.saves[0].id,'c');assert.equal(r.searches.length,4);
 console.log('PASS existing original URLs, alternate IDs and broken CDN images are skipped');
 r=await run({},5,{status:429});assert.equal(r.searches.length,1);assert.equal(r.result.provider_http_status,429);
 r=await run({},5);assert.equal(r.searches.length,4);assert.equal(r.saves.length,0);
 console.log('PASS provider rate limit stops immediately; four broad searches maximum');
})().catch(e=>{console.error(e);process.exitCode=1});
