const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const src=fs.readFileSync(__dirname+'/../supabase/functions/orca-timeline-photo-fill/index.ts','utf8').replace(/^import .*\n/,'');
const unsplash=(id,title)=>({id,width:1600,height:1000,alt_description:title,
 urls:{regular:'https://images.unsplash.com/photo-'+id,raw:'https://images.unsplash.com/photo-'+id},
 links:{html:'https://unsplash.com/photos/'+id,download_location:'https://api.unsplash.com/photos/'+id+'/download'},
 user:{name:'Creator',links:{html:'https://unsplash.com/@creator'}}});
const commons=(id,title,license='CC BY-SA 4.0')=>({pageid:id,title:'File:'+title+'.jpg',index:id,
 imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/original-'+id+'.jpg',thumburl:'https://upload.wikimedia.org/wikipedia/commons/thumb-'+id+'.jpg',descriptionurl:'https://commons.wikimedia.org/wiki/File:photo-'+id+'.jpg',width:1600,height:1000,mediatype:'BITMAP',sha1:'hash'+id,
 extmetadata:{Artist:{value:'<a href="/wiki/User:Photographer">Real Photographer</a>'},ImageDescription:{value:title},LicenseShortName:{value:license},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}}]});
async function run({count=11,cachedCount=0,brand='Wendy’s',version=0,unsplashStatus=200,commonsStatus=200,empty=false}={}){
 let handler;const saved=[],searches=[],downloads=[];
 const events=Array.from({length:count},(_,i)=>({id:'e'+i}));
 const originals=events.slice(0,cachedCount).map((e,i)=>({event_id:e.id,ticker:'WEN',photo_id:'old'+i,image_url:'https://images.unsplash.com/photo-old'+i,full_image_url:'https://images.unsplash.com/photo-old'+i,match_type:'contextual',photographer:'Old credited creator',license_url:'https://unsplash.com/license'}));
 const cache=structuredClone(originals),job={queries:['hamburger','fries','fast food'],brand_search_version:version};
 const admin={auth:{getUser:async()=>({data:{user:{id:'u'}},error:null})},rpc:async()=>({data:true}),from(table){
  let changes=null;
  const value=()=>table==='agent_profiles'?[{id:'p'}]:table==='orca_timeline_annotations'?events:table==='orca_timeline_photo_selections'?cache:table==='orca_timeline_photo_jobs'?job:table==='orca_ai_company_profiles'?{company_name:'The '+brand+' Company',content:{overview:'A restaurant company serving food to customers.'}}:null;
  const finish=()=>{if(changes&&table==='orca_timeline_photo_jobs')Object.assign(job,changes);return {data:structuredClone(value()),error:null}};
  const q={select(){return q},eq(){return q},is(){return q},neq(){return q},order(){return q},limit(){return q},range(){return q},
   single:async()=>finish(),maybeSingle:async()=>finish(),update(v){changes=v;return q},
   upsert:async row=>{assert(!cache.some(p=>p.event_id!==row.event_id&&p.photo_id===row.photo_id));saved.push(row);const i=cache.findIndex(p=>p.event_id===row.event_id);if(i>=0)cache[i]=row;else cache.push(row);return {error:null}},
   then(ok,bad){return Promise.resolve(finish()).then(ok,bad)}};return q;
 }};
 const ctx={createClient:()=>admin,Deno:{env:{get:k=>k==='UNSPLASH_ACCESS_KEY'?'test':''},serve:fn=>handler=fn},URL,URLSearchParams,Request,Response,AbortSignal,crypto,console,
  fetch:async(url,opts)=>{
   const u=new URL(url);
   if(opts?.method==='HEAD')return new Response(null,{headers:{'content-type':'image/jpeg'}});
   if(u.pathname.endsWith('/download')){downloads.push(url);return new Response('{}')}
   if(u.hostname==='api.openai.com')throw Error('Cached business subjects must be reused');
   if(u.hostname==='commons.wikimedia.org'){
    searches.push({provider:'commons',query:u.searchParams.get('gsrsearch')});
    return new Response(JSON.stringify({query:{pages:empty?[]:[commons(1,brand+' restaurant storefront'),commons(2,brand+' restaurant exterior')]}}),{status:commonsStatus});
   }
   const query=u.searchParams.get('query');searches.push({provider:'unsplash',query});
   const results=empty?[]:query.includes('signage')?[unsplash('brand',brand+' restaurant signage'),unsplash('unrelated','Unrelated promotional software screenshot')]:query.includes('restaurant')?[unsplash('wrong','A restaurant with no identifiable brand')]:Array.from({length:20},(_,i)=>unsplash('food'+i,'A hamburger and fries on a plate'));
   return new Response(JSON.stringify({results}),{status:unsplashStatus,headers:{'X-Ratelimit-Remaining':'20'}});
  }};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(src)+'\nglobalThis.api={brandMatch,commonsCandidate,recognizableName};',ctx);
 const response=await handler(new Request('https://test',{method:'POST',headers:{Authorization:'Bearer test',Origin:'https://jonfordy5.github.io'},body:JSON.stringify({ticker:'WEN'})}));
 return {body:await response.json(),status:response.status,searches,downloads,saved,cache,originals,job,api:ctx.api};
}
(async()=>{
 let t=await run();assert.equal(t.status,200);assert.equal(t.cache.length,11);assert.equal(t.body.branded_photos,2);assert.equal(t.body.remaining,0);
 assert(t.searches.some(s=>s.provider==='unsplash'&&s.query.includes('restaurant')));
 assert(t.searches.some(s=>s.provider==='unsplash'&&s.query.includes('signage')));
 assert(t.searches.some(s=>s.provider==='commons'));
 assert.equal(t.downloads.length,t.saved.filter(p=>p.source_type==='unsplash_legacy').length);
 assert.equal(new Set(t.cache.map(p=>p.photo_id)).size,11);
 assert.equal(t.cache.filter(p=>p.match_type==='exact_subject').length,2);
 const cc=t.cache.find(p=>p.source_type==='wikimedia_commons');assert.equal(cc.license_name,'CC BY-SA 4.0');assert(cc.attribution_text.includes('Real Photographer'));assert(cc.license_url.startsWith('https://creativecommons.org/'));
 console.log('PASS two recognizable company images plus broad images: both providers searched, 11 unique cards, Commons rights and Unsplash tracking retained');
 t=await run({cachedCount:11});assert.equal(t.saved.length,2);assert.equal(t.cache.length,11);
 assert.equal(t.cache.filter(p=>p.photo_id.startsWith('old')).length,9);
 assert(t.saved.every(p=>p.previous_photo?.photographer==='Old credited creator'));
 assert.equal(t.job.brand_search_version,12);
 console.log('PASS WEN upgrade changes at most two covers and archives their complete original credits; nine good photos untouched');
 t=await run({count:10,cachedCount:7,brand:'Texas Roadhouse'});
 assert.equal(t.cache.length,10);assert.equal(t.saved.length,3);assert.equal(t.body.branded_photos,2);
 for(const p of t.originals)assert.deepEqual(t.cache.find(c=>c.event_id===p.event_id),p);
 console.log('PASS TXRH fills only three gaps with two branded photos and one business image; all seven steak photographs retained');
 t=await run({cachedCount:11,version:12});assert.equal(t.saved.length,0);assert.equal(t.searches.length,0);
 t=await run({cachedCount:11,empty:true});assert.equal(t.saved.length,0);assert.equal(t.job.brand_search_version,12);
 console.log('PASS completed hybrid search is cached; unavailable brand images do not force replacements or repeated searches');
 t=await run({unsplashStatus:429});assert.equal(t.searches.filter(s=>s.provider==='unsplash').length,1);
 assert.equal(t.body.branded_photos,2);assert(t.body.remaining>0); // Commons fixture contains only two usable originals.
 t=await run({commonsStatus:429});assert.equal(t.searches.filter(s=>s.provider==='commons').length,1);
 assert.equal(t.body.remaining,0);assert.equal(t.body.branded_photos,1);
 const {api}=t;
 assert.equal(api.recognizableName('The Wendy’s Company Common Stock'),"Wendy's");
 assert.equal(api.brandMatch('Wendy’s restaurant exterior',"Wendy's"),true);
 assert.equal(api.brandMatch('An abandoned Wendy’s restaurant',"Wendy's"),false);
 assert.equal(api.brandMatch('A generic hamburger',"Wendy's"),false);
 const bad=commons(9,'Wendy’s restaurant','CC BY-NC 4.0');assert.equal(api.commonsCandidate(bad,'Wendy’s'),null);
 const screenshot=commons(10,'Wendy’s promotional software screenshot');assert.equal(api.commonsCandidate(screenshot,'Wendy’s'),null);
 console.log('PASS rate limit respected, unrelated/abandoned/screenshots and unsupported licenses rejected without relevance scores');
})().catch(e=>{console.error(e);process.exitCode=1});
