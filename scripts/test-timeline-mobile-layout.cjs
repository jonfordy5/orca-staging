// Browser regression for the actual shared CSS and timeline modules. All data
// and images are local fixtures: this never calls Supabase or paid research.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const workspace=fs.readFileSync(path.join(root,'research-workspace.html'),'utf8');
const css=workspace.match(/<style>([\s\S]*?)<\/style>/)[1];
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body><main><section class="card" id="chart-section"><div class="chart-frame">Market chart unchanged</div>
<div id="timeline-frame" class="orca-timeline-frame"></div><p id="living-status"></p></section><div style="height:1000px"></div></main>
<script type="module">
import {mountLivingTimeline} from './orca-living-timeline.js';
const params=new URLSearchParams(location.search),count=Number(params.get('count')??10);
const authorized=params.has('authorized'),statusFail=params.has('statusFail');
let rows=Array.from({length:count},(_,i)=>({id:'event-'+i,event_at:(1990+i)+'-01-01',category:'product',
 title:i?'Company opens a significant new facility and expands its original business':'Company opens its first restaurant',
 ai_summary:'A verified milestone with a readable summary. Select this card to read the full original source and photograph credits.',
 source_url:'https://example.com/history/'+i,quick_brief:{}}));
const photos=params.has('noPhotos')?[]:rows.map((r,i)=>({event_id:r.id,photo_id:'photo-'+i,
 image_url:location.origin+'/image-'+i+'.svg',full_image_url:location.origin+'/image-'+i+'.svg',
 photographer:'Test photographer',photographer_url:'https://unsplash.com/@test',photo_url:'https://unsplash.com/photos/'+i,
 needs_review:false,strategy_version:13,source_type:'unsplash',match_type:'contextual'}));
window.paidCalls=0;window.apiCalls=[];
const sb={from(table){
 const result={data:table==='orca_timeline_annotations'?rows:
  table==='orca_timeline_photo_selections'?photos:
  table==='agent_profiles'&&authorized?[{id:'owned-researcher'}]:[]};
 const q={select(){return q},eq(){return q},is(){return q},order(){return q},
  range(){return Promise.resolve(result)},limit(){return Promise.resolve(result)}};return q;
},functions:{async invoke(name,{body}){
 window.apiCalls.push({name,scope:body?.scope||null});
 if(name==='orca-timeline-discovery'&&body?.scope==='status')return statusFail?
  {error:{message:'Temporary authenticated status outage'}}:
  {data:{stopped:{},photo_brand_pending:false}};
 if(name==='orca-timeline-discovery'&&body?.scope==='current'){
  window.paidCalls++;
  rows.push({id:'event-current',event_at:new Date().getUTCFullYear()+'-03-14',
   category:'product',title:'Company opens a new facility this year',
   ai_summary:'Verified current year development',quick_brief:{},
   source_url:'https://example.com/history/current'});
  return {data:{state:'ready',added:1,run_id:'test-current',estimated_usd:.02}};
 }
 if(name==='orca-timeline-photo-fill'){window.paidCalls++;return {data:{state:'rate_limited',added:0,remaining:1}}}
 throw Error('Unexpected API request: '+name+' / '+body?.scope);
}}};
await mountLivingTimeline({sb,ticker:'TEST',getUser:()=>authorized?{id:'owned-user'}:null});
window.timelineReady=true;
</script></body></html>`;

async function metrics(page){
 return page.evaluate(()=>{
  const rail=document.querySelector('.orca-timeline-events'),frame=document.querySelector('#timeline-frame');
  const r=rail.getBoundingClientRect(),f=frame.getBoundingClientRect();
  return {railWidth:r.width,railHeight:r.height,scrollLeft:rail.scrollLeft,maxScroll:rail.scrollWidth-rail.clientWidth,
   frameHeight:f.height,track:!!document.querySelector('.orca-history-track'),
    trackPath:document.querySelector('.orca-history-track-base')?.getAttribute('d')||'',
   hint:getComputedStyle(document.querySelector('.orca-timeline-mobile-progress')).display,
   cards:[...document.querySelectorAll('.orca-timeline-event')].map(card=>{
    const b=card.getBoundingClientRect();return {x:b.left-r.left,y:b.top-r.top,width:b.width,height:b.height,
     visible:b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top&&b.bottom<=r.bottom,
     stem:getComputedStyle(card.parentElement.querySelector('.orca-history-stem')).display};
   })};
 });
}

async function showCard(page,i){
 await page.evaluate(i=>{
  const rail=document.querySelector('.orca-timeline-events'),stop=rail.querySelectorAll('.orca-history-stop')[i];
  rail.scrollTo({left:stop.offsetLeft,behavior:'instant'});
 },i);
 await page.waitForFunction(i=>document.querySelector('.orca-timeline-mobile-progress').textContent.includes((i+1)+' of '),i);
 const m=await metrics(page);
 assert(m.cards[i].visible,'Complete card '+i+' must fit inside the mobile rail');
 assert(Math.abs(m.cards[i].x-6)<1,'No blank slide or padding before card '+i);
 return m;
}

async function swipe(page,direction){
 const box=await page.locator('.orca-timeline-events').boundingBox();
 const cdp=await page.context().newCDPSession(page);
 const y=Math.min(box.y+box.height/2,page.viewportSize().height-25);
 const start=box.x+box.width*(direction==='left'?.82:.18);
 const end=box.x+box.width*(direction==='left'?.18:.82);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
 for(let i=1;i<=12;i++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+(end-start)*i/12,y}]});
  await page.waitForTimeout(20);
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await cdp.detach();
 await page.waitForTimeout(650);
}

(async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/') {res.setHeader('Content-Type','text/html');return res.end(fixture)}
  if(/^\/image-\d+\.svg$/.test(url.pathname)){
   res.setHeader('Content-Type','image/svg+xml');
   return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#275875"/></svg>');
  }
  if(['/orca-living-timeline.js','/orca-timeline-photos.js'].includes(url.pathname)){
   res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,url.pathname)));
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const sizes=[{width:320,height:740},{width:393,height:851},{width:430,height:932},{width:851,height:393},{width:932,height:430}];
  for(const size of sizes){
   const context=await browser.newContext({viewport:size,hasTouch:true,isMobile:true,reducedMotion:'reduce'});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);await page.waitForFunction(()=>window.timelineReady);
   assert.equal(await page.locator('.orca-photo-image:not(.orca-generated-art)').count(),10);
   await page.locator('#timeline-frame').scrollIntoViewIfNeeded();
   let m=await metrics(page);
   assert.equal(m.track,false);assert.equal(m.hint,'block');assert(m.cards[0].visible);assert.equal(m.scrollLeft,0);
    assert.equal(await page.locator('.orca-timeline-generate,.orca-history-refill-action,.orca-history-year-once').count(),0);
   if(size.height<600)assert(m.frameHeight<=size.height,'The complete phone landscape frame fits the viewport height');
   assert(m.cards.every(c=>c.y===m.cards[0].y&&c.stem==='none'),'All cards occupy one row; no desktop positions leak into mobile');
   for(let i=0;i<10;i++)m=await showCard(page,i);
   assert(Math.abs(m.scrollLeft-m.maxScroll)<1,'Last card ends at the scroll boundary without future space');
   await page.evaluate(()=>document.querySelector('.orca-timeline-events').scrollLeft=1e6);
   assert.equal((await metrics(page)).scrollLeft,m.scrollLeft);
   await showCard(page,0);
   if(size.width===393){
    await swipe(page,'left');assert((await metrics(page)).scrollLeft>0,'Native touch swipe advances the timeline');
    await page.waitForFunction(()=>/2 of 10/.test(document.querySelector('.orca-timeline-mobile-progress').textContent));
    assert((await metrics(page)).cards[1].visible,'Touch swipe snaps to a fully visible card');
    await swipe(page,'right');assert((await metrics(page)).cards[0].visible,'Reverse swipe returns to the complete first card');
    await showCard(page,5);
    await page.setViewportSize({width:851,height:393});
    await page.waitForFunction(()=>document.querySelectorAll('.orca-timeline-event')[5].getBoundingClientRect().left>=document.querySelector('.orca-timeline-events').getBoundingClientRect().left);
    await page.waitForTimeout(100);
    assert((await metrics(page)).cards[5].visible,'Rotation retains the current complete card');
    await page.setViewportSize(size);await page.waitForTimeout(100);
    assert((await metrics(page)).cards[5].visible,'Returning to portrait retains the card');
    await showCard(page,0);
    const scrollY=await page.evaluate(()=>window.scrollY);
    const box=await page.locator('.orca-timeline-events').boundingBox();
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.7}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height*.2}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
    await page.waitForTimeout(300);
    assert(await page.evaluate(()=>window.scrollY)>scrollY,'Vertical page scrolling remains available over the carousel');
   }
   await page.locator('.orca-timeline-event').first().click();
   assert(await page.locator('.orca-history-popover').isVisible());
   assert(await page.locator('.orca-history-popover a[href="https://example.com/history/0"]').count());
   assert.match(await page.locator('.orca-photo-attribution').innerText(),/Test photographer/);
   await page.keyboard.press('Escape');assert(!(await page.locator('.orca-history-popover').isVisible()));
   assert.equal(await page.evaluate(()=>window.paidCalls),0);assert.deepEqual(errors,[]);
   console.log('PASS mobile '+size.width+'×'+size.height+': all 10 framed cards, boundaries, sources and credits');
   await context.close();
  }
  for(const size of [{width:1440,height:1000},{width:1024,height:768},{width:800,height:600},{width:701,height:900}]){
   const context=await browser.newContext({viewport:size,reducedMotion:'reduce'}),page=await context.newPage();
   await page.goto(url);await page.waitForFunction(()=>window.timelineReady);await page.waitForTimeout(100);
   const m=await metrics(page);
   assert(m.frameHeight>=298&&m.frameHeight<=306,'Compact desktop frame is about 302px, not 570px');
   assert.equal(m.hint,'none');assert(m.track);
   assert(m.cards.every(c=>c.width===202&&c.height===178));
   assert(m.cards.every(c=>Math.abs(c.y-m.cards[0].y)<1),'All cards are on the same row');
   assert.equal(m.cards[1].x-m.cards[0].x,210);assert(m.cards[4].visible);
   const coords=[...m.trackPath.matchAll(/[ML]\s+([\d.]+)\s+([\d.]+)/g)]
    .map(match=>[Number(match[1]),Number(match[2])]);
   assert.equal(coords.length,10,'One track point per milestone');
   assert(coords.every(([x,y])=>Math.abs(y-coords[0][1])<1),'No zigzag');
   assert.equal(await page.locator('.orca-timeline-generate,.orca-history-year-once').count(),0);
   assert.equal(await page.evaluate(()=>window.paidCalls),0,'Anonymous views make no paid request');
   assert(await page.locator('.orca-timeline-navigation').isVisible());
   for(const [label,i] of [['Jump to earliest event',0],['Jump to latest event',9]]){
    await page.getByRole('button',{name:label}).click();
    await page.waitForFunction(i=>{
     const rail=document.querySelector('.orca-timeline-events').getBoundingClientRect(),card=document.querySelectorAll('.orca-timeline-event')[i].getBoundingClientRect();
     return card.left>=rail.left&&card.right<=rail.right;
    },i);
   }
   console.log('PASS desktop '+size.width+'×'+size.height+': compact straight rail, no manual button and navigation');
   await context.close();
  }
  // Earlier coverage checked only reduced-motion layouts, not moving light.
  {
   const motionContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
   const motionPage=await motionContext.newPage();
   const motionErrors=[];motionPage.on('pageerror',error=>motionErrors.push(error.message));
   await motionPage.goto(url);await motionPage.waitForFunction(()=>window.timelineReady);
   await motionPage.waitForFunction(()=>{
    const beam=document.querySelector('.orca-history-track-beam');
    return beam?.getAttribute('d')?.length>30&&beam.getBBox().width>15;
   },null,{timeout:5000});
   const first=await motionPage.evaluate(()=>{
    const beam=document.querySelector('.orca-history-track-beam');
    return {x:beam.getBBox().x,d:beam.getAttribute('d'),stroke:getComputedStyle(beam).strokeWidth,
     filter:getComputedStyle(beam).filter,
     trackLength:document.querySelector('.orca-history-track-base').getTotalLength()};
   });
   await motionPage.waitForTimeout(850);
   const second=await motionPage.evaluate(()=>{
    const beam=document.querySelector('.orca-history-track-beam');
    return {x:beam.getBBox().x,d:beam.getAttribute('d'),width:beam.getBBox().width};
   });
   assert(first.trackLength>900,'Long straight rail has room for the comet');
   assert(first.stroke.startsWith('5.3'),'White-blue tracer is visibly thicker than the base');
   assert.notEqual(first.filter,'none','Tracer has a neon glow');
   assert(second.x+second.width>first.x+25,'The comet leading edge advances across the straight rail');
   assert.notEqual(first.d,second.d,'Comet shape updates as it advances');
   await motionPage.setViewportSize({width:393,height:851});
   await motionPage.waitForFunction(()=>!document.querySelector('.orca-history-track'));
   assert.equal(await motionPage.locator('.orca-history-track-beam').count(),0,
    'Mobile remains swipe-only even when motion is enabled');
   assert.deepEqual(motionErrors,[]);
   await motionContext.close();
   console.log('PASS visible animated comet travels on desktop; mobile remains swipe-only');
   const reduceContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
   const reducePage=await reduceContext.newPage();
   await reducePage.goto(url);await reducePage.waitForFunction(()=>window.timelineReady);
   assert.equal(await reducePage.locator('.orca-history-track-beam').getAttribute('d'),null,
    'Reduced motion keeps a static luminous rail instead of moving light');
   await reduceContext.close();
   console.log('PASS reduced-motion visitors retain a static glowing rail');
  }
  const context=await browser.newContext({viewport:{width:360,height:800},hasTouch:true,isMobile:true}),page=await context.newPage();
  for(const query of ['?count=1','?count=6&noPhotos','?count=0']){
   await page.goto(url+query);await page.waitForFunction(()=>window.timelineReady);
   const count=Number(new URL(url+query).searchParams.get('count'));
   assert.equal(await page.locator('.orca-timeline-event').count(),count);
   assert.equal(await page.locator('.orca-generated-art').count(),query.includes('noPhotos')?count:0);
   if(count){for(let i=0;i<count;i++)await showCard(page,i)}
   else {assert(await page.locator('.orca-timeline-empty').isVisible());assert(!(await page.locator('.orca-timeline-mobile-progress').isVisible()))}
   assert.equal(await page.evaluate(()=>window.paidCalls),0);
  }
  console.log('PASS anonymous one-card, missing-photo and empty timelines without billable calls');
  await page.goto(url+'?authorized');await page.waitForFunction(()=>window.timelineReady);
  await page.waitForFunction(()=>window.apiCalls.some(x=>x.scope==='current'),null,{timeout:5000});
  await page.waitForFunction(()=>document.querySelectorAll('.orca-timeline-event').length===11);
  assert.equal(await page.locator('.orca-timeline-generate,.orca-history-refill-action').count(),0);
  assert.equal(await page.evaluate(()=>window.apiCalls.filter(x=>x.scope==='current').length),1);
  assert(await page.evaluate(()=>window.paidCalls)>=1,'Authorized opted-in researcher auto-generates missing current-year milestone');
  console.log('PASS authorized first page load runs unchanged current-year API once');
  await page.goto(url+'?authorized&statusFail');await page.waitForFunction(()=>window.timelineReady);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.paidCalls),0,'Backend status failure blocks paid generation');
  assert.equal(await page.locator('.orca-timeline-generate').count(),0);
  console.log('PASS failed backend status blocks automatic paid history research');
  await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
