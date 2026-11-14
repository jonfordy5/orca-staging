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
const captureDir=process.env.ORCA_TIMELINE_CAPTURE_DIR;
if(captureDir)fs.mkdirSync(captureDir,{recursive:true});
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
  range(from,to){return Promise.resolve({...result,data:result.data.slice(from,to+1)})},limit(){return Promise.resolve(result)}};return q;
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


async function dustState(page){
 return page.evaluate(()=>({groups:[...document.querySelectorAll('.orca-history-dust-group')].map(group=>({
  index:Number(group.dataset.index),excitement:Number(group.dataset.excitement),
  particles:[...group.querySelectorAll('.orca-history-dust')].map(p=>({
   region:p.dataset.region,anchorX:Number(p.dataset.anchorX),anchorY:Number(p.dataset.anchorY),
   x:Number(p.getAttribute('cx')),y:Number(p.getAttribute('cy')),opacity:Number(p.getAttribute('opacity')),
  })),
 }))}));
}
function sumOpacity(group,region){return group.particles.filter(p=>!region||p.region===region).reduce((sum,p)=>sum+p.opacity,0)}
function assertBoundedDust(state,bound){
 assert(state.groups.every(g=>g.particles.every(p=>Math.abs(p.x-p.anchorX)<bound&&Math.abs(p.y-p.anchorY)<bound)),
  'Dust stays close to stationary anchors instead of sweeping along the rail');
}
async function particleTravel(page,index){
 let prior=(await dustState(page)).groups.find(g=>g.index===index),travel=0;
 for(let i=0;i<5;i++){
  await page.waitForTimeout(120);
  const current=(await dustState(page)).groups.find(g=>g.index===index);
  travel+=current.particles.reduce((sum,p,j)=>sum+Math.hypot(p.x-prior.particles[j].x,p.y-prior.particles[j].y),0);
  prior=current;
 }
 return travel;
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
   assert.equal(await page.locator('.orca-history-orbit').count(),0,'Mobile never mounts hover dust');
    assert.equal(await page.locator('.orca-timeline-generate,.orca-history-refill-action,.orca-history-year-once').count(),0);
   if(size.height<600)assert(m.frameHeight<=size.height,'The complete phone landscape frame fits the viewport height');
   assert(m.cards.every(c=>c.y===m.cards[0].y&&c.stem==='none'),'All cards occupy one row; no desktop positions leak into mobile');
   for(let i=0;i<10;i++)m=await showCard(page,i);
   assert(Math.abs(m.scrollLeft-m.maxScroll)<1,'Last card ends at the scroll boundary without future space');
   await page.evaluate(()=>document.querySelector('.orca-timeline-events').scrollLeft=1e6);
   assert.equal((await metrics(page)).scrollLeft,m.scrollLeft);
   await showCard(page,0);
   if(size.width===393){
    if(captureDir)await page.locator('#timeline-frame').screenshot({path:path.join(captureDir,'ambient-mobile.png')});
    // A pending mobile progress RAF must not latch its ID across BFcache.
    // Dispatch and hide in the same task, before that callback can run.
    await page.evaluate(()=>{
     document.querySelector('.orca-timeline-events').dispatchEvent(new Event('scroll'));
     window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
     window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    });
    await showCard(page,1);
    assert((await metrics(page)).cards[1].visible,'Mobile progress resumes after BFcache cancels a pending scroll frame');
    await showCard(page,0);
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
   assert(m.frameHeight>=380&&m.frameHeight<=386,'Desktop leaves room around the hovering card and halo');
   assert.equal(m.hint,'none');assert(m.track);
   assert(m.cards.every(c=>c.width===202&&c.height===178));
   assert(m.cards.every(c=>Math.abs(c.y-m.cards[0].y)<1),'All cards are on the same row');
   assert.equal(m.cards[1].x-m.cards[0].x,222);assert(m.cards[4].visible);
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
  // Ambient dust stays tied to fixed anchors: no leader, trail or global sweep.
  {
   const motionContext=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
   await motionContext.addInitScript(()=>{
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
    window.timelineFrames=new Set();window.timelineRafTicks=0;
    window.requestAnimationFrame=callback=>{
     const id=request(time=>{window.timelineFrames.delete(id);window.timelineRafTicks++;callback(time)});
     window.timelineFrames.add(id);return id;
    };
    window.cancelAnimationFrame=id=>{window.timelineFrames.delete(id);return cancel(id)};
   });
   const motionPage=await motionContext.newPage(),motionErrors=[];
   motionPage.on('pageerror',error=>motionErrors.push(error.message));
   await motionPage.goto(url);await motionPage.waitForFunction(()=>window.timelineReady);
   await motionPage.locator('#timeline-frame').scrollIntoViewIfNeeded();
   await motionPage.waitForFunction(()=>document.querySelectorAll('.orca-history-dust').length>0);
   await motionPage.waitForTimeout(100);
   const absent='.orca-history-track-beam,.orca-history-sparkle-head,.orca-history-sparkle-halo,.orca-history-track-glow';
   assert.equal(await motionPage.locator(absent).count(),0,'There is no comet, moving head, halo or sweeping beam');
   const first=await dustState(motionPage);
   assert(first.groups.length>0&&first.groups.length<=18,'Only a bounded viewport pool is mounted');
   assert(first.groups.every(g=>g.particles.length===32),'Each pool has a fixed particle budget');
   for(const group of first.groups){
    for(const region of ['rail','connector','card']){
     assert(group.particles.some(p=>p.region===region&&p.opacity>0),'Ambient dust surrounds '+region+' for milestone '+group.index);
    }
   }
   const total=first.groups.reduce((sum,g)=>sum+g.particles.length,0);
   if(captureDir)await motionPage.locator('#timeline-frame').screenshot({path:path.join(captureDir,'ambient-rest.png')});
   const palette=await motionPage.evaluate(()=>{
    const heading=document.querySelector('.orca-timeline-heading strong'),card=document.querySelector('.orca-timeline-event');
    return {heading:getComputedStyle(heading).color,headingText:heading.textContent,
     border:getComputedStyle(card).borderTopColor,base:getComputedStyle(document.querySelector('.orca-history-track-base')).stroke,
     date:getComputedStyle(card.querySelector('small')).color};
   });
   assert.equal(palette.heading,'rgb(244, 219, 154)');assert.equal(palette.base,'rgb(187, 146, 85)');
   assert(['rgb(199, 164, 108)','rgb(221, 188, 128)'].includes(palette.border));
   assert.equal(palette.date,'rgb(248, 251, 255)');assert.match(palette.headingText,/History of TEST/);
   await motionPage.waitForTimeout(850);
   const second=await dustState(motionPage);
   assert.deepEqual(second.groups.map(g=>g.particles.map(p=>[p.anchorX,p.anchorY])),
    first.groups.map(g=>g.particles.map(p=>[p.anchorX,p.anchorY])),'Particle anchors never progress along the rail');
   assert(second.groups.some((g,i)=>g.particles.some((p,j)=>p.x!==first.groups[i].particles[j].x||p.y!==first.groups[i].particles[j].y)),
    'Dust gently drifts in the resting field');
   assertBoundedDust(second,8);
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),1,'One animation frame loop serves the complete dust field');

   const card=motionPage.locator('.orca-timeline-event[data-index="4"]');
   const cardBefore=await card.boundingBox();
   const borderBefore=await card.evaluate(el=>getComputedStyle(el).boxShadow);
   const calm=(await dustState(motionPage)).groups.find(g=>g.index===4);
   const calmMotion=await particleTravel(motionPage,4);
   await card.hover();
   await motionPage.waitForFunction(()=>Number(document.querySelector('.orca-history-dust-group[data-index="4"]')?.dataset.excitement)>.9);
   await motionPage.waitForTimeout(300);
   const excited=await dustState(motionPage),local=excited.groups.find(g=>g.index===4);
   await motionPage.waitForFunction(()=>Number(document.querySelector('.orca-history-orbit')?.dataset.excitement)>.92);
   const orbitBefore=await motionPage.evaluate(()=>{
    const orbit=document.querySelector('.orca-history-orbit');
    const cards=[...document.querySelectorAll('.orca-timeline-event')].map(el=>el.getBoundingClientRect());
    const motes=[...orbit.querySelectorAll('.orca-history-orbit-mote')].map(el=>{
     const rect=el.getBoundingClientRect();
     return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,
      opacity:Number(el.getAttribute('opacity')),hue:el.dataset.hue,region:el.dataset.region,
      cx:el.getAttribute('cx'),cy:el.getAttribute('cy')};
    });
    const visible=motes.filter(p=>p.opacity>.09),c=cards[4];
    const on=(p,r)=>p.x>r.left&&p.x<r.right&&p.y>r.top&&p.y<r.bottom;
    return {count:motes.length,red:visible.filter(p=>p.hue==='red').length,
     green:visible.filter(p=>p.hue==='green').length,
     above:visible.filter(p=>p.y<c.top).length,below:visible.filter(p=>p.y>c.bottom).length,
     left:visible.filter(p=>p.x<c.left).length,right:visible.filter(p=>p.x>c.right).length,
     acrossLeft:visible.filter(p=>on(p,cards[3])).length,
     acrossRight:visible.filter(p=>on(p,cards[5])).length,
     leftGap:visible.filter(p=>p.region==='left-gap'&&p.x>cards[3].right+0.5&&
      p.x<c.left-0.5&&p.y>c.top&&p.y<c.bottom).length,
     rightGap:visible.filter(p=>p.region==='right-gap'&&p.x>c.right+0.5&&
      p.x<cards[5].left-0.5&&p.y>c.top&&p.y<c.bottom).length,
     pointer:getComputedStyle(orbit).pointerEvents,
     z:Number(getComputedStyle(orbit).zIndex),
     cardZ:Number(getComputedStyle(document.querySelector('.orca-timeline-event[data-index="4"]')).zIndex),
     leftZ:Number(getComputedStyle(document.querySelector('.orca-timeline-event[data-index="3"]')).zIndex),
     rightZ:Number(getComputedStyle(document.querySelector('.orca-timeline-event[data-index="5"]')).zIndex),
     isolated:getComputedStyle(document.querySelector('.orca-history-spine')).isolation==='isolate',
     parent:orbit.parentElement===document.querySelector('.orca-history-spine'),
     nodes:motes.slice(0,8).map(p=>[p.cx,p.cy,p.opacity])};
   });
   assert.equal(orbitBefore.count,168,'The single bounded orbit reuses 112 halo and 56 side motes');
   assert(orbitBefore.parent&&orbitBefore.pointer==='none'&&orbitBefore.isolated,
    'The orbit is attached to an isolated background layer, not the hovered card');
   assert(orbitBefore.z<orbitBefore.cardZ&&orbitBefore.z<orbitBefore.leftZ&&orbitBefore.z<orbitBefore.rightZ,
    'Every photo card paints above the dust, including both neighbors');
   assert(orbitBefore.above>3&&orbitBefore.below>3&&orbitBefore.left>3&&orbitBefore.right>3,
    'Shimmer wraps all four sides of the chosen card');
   assert(orbitBefore.acrossLeft>1&&orbitBefore.acrossRight>1,
    'The dust field reaches behind neighboring photos without painting on them');
   assert(orbitBefore.leftGap>=10&&orbitBefore.rightGap>=10,
    'Dense moving motes visibly fill both narrow gaps beside the enlarged card');
   assert(orbitBefore.red>=1&&orbitBefore.green>=1,'A few red and green sparks complement gold');
   await motionPage.waitForTimeout(180);
   const orbitAfter=await motionPage.evaluate(()=>[...document.querySelectorAll('.orca-history-orbit-mote')].slice(0,8)
    .map(m=>[m.getAttribute('cx'),m.getAttribute('cy'),Number(m.getAttribute('opacity'))]));
   assert.notDeepEqual(orbitAfter,orbitBefore.nodes,'Hover field shimmers and drifts');
   const cardAfter=await card.boundingBox();
   assert(cardAfter.width>cardBefore.width*1.025&&cardAfter.width<cardBefore.width*1.05,'Hovered card enlarges slightly');
   assert.notEqual(await card.evaluate(el=>getComputedStyle(el).boxShadow),borderBefore,'Hover adds a tasteful local border glow');
   assert(excited.groups.filter(g=>g.index!==4).every(g=>g.excitement===0),'Neighbor dust remains calm');
   assert(sumOpacity(local)>sumOpacity(calm)*1.5,'Hovered milestone dust becomes brighter');
   assert(local.particles.filter(p=>p.opacity>.2).length>calm.particles.filter(p=>p.opacity>.2).length,
    'More of the fixed pool sparkles visibly on hover');
   for(const region of ['rail','connector','card']){
    assert(sumOpacity(local,region)>sumOpacity(calm,region)*1.4,'Hover energizes the local '+region+' dust');
   }
   const excitedMotion=await particleTravel(motionPage,4);
   assert(excitedMotion>calmMotion*1.3,'Hovered dust moves more energetically within its local field');
   assertBoundedDust(await dustState(motionPage),16);
   const spacing=await motionPage.evaluate(()=>{
    const cards=[...document.querySelectorAll('.orca-timeline-event')].map(c=>c.getBoundingClientRect());
    const rail=document.querySelector('.orca-timeline-events').getBoundingClientRect(),card=cards[4];
    const stem=document.querySelectorAll('.orca-history-stem')[4].getBoundingClientRect();
    return {left:card.left-cards[3].right,right:cards[5].left-card.right,top:card.top-rail.top,
     bottom:rail.bottom-stem.bottom,connectorGap:stem.top-card.bottom};
   });
   assert(spacing.left>8&&spacing.right>8,'Scaled card keeps comfortable separation from its neighbors');
   assert(spacing.top>=0&&spacing.bottom>5,'Hover and dust fit inside the frame without clipping');
   assert(Math.abs(spacing.connectorGap)<2,'Bottom-origin scaling keeps card and connector joined');
   if(captureDir)await motionPage.locator('#timeline-frame').screenshot({path:path.join(captureDir,'ambient-hover.png')});
   await motionPage.mouse.move(0,0);
   await motionPage.waitForFunction(()=>Number(document.querySelector('.orca-history-dust-group[data-index="4"]')?.dataset.excitement)<.01);
   await motionPage.waitForTimeout(300);
   assert(Math.abs((await card.boundingBox()).width-cardBefore.width)<.1,'Card smoothly returns to its original size');
   assert.equal(await motionPage.locator('.orca-history-excited').count(),0);
   await motionPage.waitForFunction(()=>document.querySelectorAll('.orca-history-orbit').length===0);
   assert.equal(await motionPage.locator('.orca-history-dust').count(),total,'Hover reuses particles instead of accumulating them');
   // Entering empty connector space must not masquerade as card hover.
   const stemBox=await motionPage.locator('.orca-history-stem').nth(4).boundingBox();
   await motionPage.mouse.move(stemBox.x+stemBox.width/2,stemBox.y+stemBox.height/2);
   await motionPage.waitForTimeout(120);
   assert.equal(await motionPage.locator('.orca-history-excited').count(),0,'Only the card activates dust');
   await motionPage.mouse.move(0,0);

   // Hidden pages stop work and restart one clean field; no stale pools remain.
   await motionPage.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
   });
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),0,'Hidden document cancels animation');
   const hiddenTicks=await motionPage.evaluate(()=>window.timelineRafTicks);
   await motionPage.waitForTimeout(150);
   assert.equal(await motionPage.evaluate(()=>window.timelineRafTicks),hiddenTicks);
   await motionPage.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    document.dispatchEvent(new Event('visibilitychange'));
   });
   await motionPage.waitForTimeout(100);
   assert.equal(await motionPage.locator('.orca-history-track').count(),1);assert.equal(await motionPage.locator('.orca-history-dust').count(),total);
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),1);

   // BFcache pauses work, then restores a single field and live preference listeners.
   await motionPage.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),0,'BFcache entry pauses animation');
   await motionPage.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await motionPage.waitForTimeout(100);
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),1,'BFcache restoration restarts exactly one loop');
   assert.equal(await motionPage.locator('.orca-history-track').count(),1);

   // Changing the OS setting while mounted freezes dust and card enlargement.
   await card.hover();
   await motionPage.waitForFunction(()=>Number(document.querySelector('.orca-history-dust-group[data-index="4"]')?.dataset.excitement)>.5);
   await motionPage.emulateMedia({reducedMotion:'reduce'});await motionPage.waitForTimeout(100);
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),0,'Reduced motion cancels the active RAF immediately');
   assert.equal(await motionPage.locator('.orca-history-excited').count(),0,'Preference change clears excitation');
   assert.equal(await motionPage.locator('.orca-history-orbit').count(),0,'Reduced motion removes the hover orbit');
   const frozen=await dustState(motionPage);await motionPage.waitForTimeout(350);
   assert.deepEqual(await dustState(motionPage),frozen,'Reduced motion retains perfectly static ambient dust');
   assert(Math.abs((await card.boundingBox()).width-cardBefore.width)<.1,'Reduced motion suppresses enlargement');
   await motionPage.emulateMedia({reducedMotion:'no-preference'});await motionPage.mouse.move(0,0);await motionPage.waitForTimeout(100);
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),1,'Motion can be enabled again without duplicate loops');

   // Long histories recycle local pools as the user scrolls; nodes stay bounded.
   await motionPage.goto(url+'?count=120');await motionPage.waitForFunction(()=>window.timelineReady);
   const poolCount=await motionPage.locator('.orca-history-dust').count();
   assert(poolCount>0&&poolCount<=18*32,'Long history has a strict SVG particle budget');
   for(const position of [0,1,0.35,0.8,0]){
    await motionPage.evaluate(fraction=>{
     const rail=document.querySelector('.orca-timeline-events');rail.scrollTo({left:fraction*(rail.scrollWidth-rail.clientWidth),behavior:'instant'});
    },position);
    await motionPage.waitForTimeout(100);
    const state=await dustState(motionPage);
    assert.equal(await motionPage.locator('.orca-history-track').count(),1);
    assert(state.groups.reduce((sum,g)=>sum+g.particles.length,0)<=18*32);
    assert.equal(new Set(state.groups.map(g=>g.index)).size,state.groups.length,'No duplicate local pools after scroll');
    const covered=await motionPage.evaluate(()=>{
     const r=document.querySelector('.orca-timeline-events').getBoundingClientRect();
     const groups=new Set([...document.querySelectorAll('.orca-history-dust-group')].map(g=>Number(g.dataset.index)));
     return [...document.querySelectorAll('.orca-timeline-event')].every(c=>{
      const b=c.getBoundingClientRect();return b.right<=r.left||b.left>=r.right||groups.has(Number(c.dataset.index));
     });
    });
    assert(covered,'Every viewed milestone receives its own rail and connector dust');
   }
   await motionPage.setViewportSize({width:1024,height:900});await motionPage.waitForTimeout(100);
   assert.equal(await motionPage.locator('.orca-history-track').count(),1);
   assert((await motionPage.locator('.orca-history-dust').count())<=18*32);
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),1,'Resizing replaces, rather than duplicates, the frame loop');
   await motionPage.setViewportSize({width:393,height:851});
   await motionPage.waitForFunction(()=>!document.querySelector('.orca-history-track'));
   assert.equal(await motionPage.locator(absent).count(),0);assert.equal(await motionPage.locator('.orca-history-dust').count(),0);
   await motionPage.locator('.orca-timeline-event').first().dispatchEvent('pointerenter',{pointerType:'mouse'});
   assert.equal(await motionPage.locator('.orca-history-excited').count(),0,'Phone carousel never acquires desktop hover state');
   await motionPage.waitForTimeout(100);assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),0);
   await motionPage.setViewportSize({width:1440,height:1000});await motionPage.waitForTimeout(100);
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),1);
   await motionPage.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));
   assert.equal(await motionPage.evaluate(()=>window.timelineFrames.size),0,'Final page exit cancels the dust loop');
   assert.deepEqual(motionErrors,[]);await motionContext.close();
   console.log('PASS ambient rail/connector dust, local card hover, static reduced motion, visibility cleanup and bounded long-history pools');

   const touchContext=await browser.newContext({viewport:{width:1024,height:800},hasTouch:true,reducedMotion:'no-preference'});
   const touchPage=await touchContext.newPage();await touchPage.goto(url);await touchPage.waitForFunction(()=>window.timelineReady);
   assert(await touchPage.locator('.orca-history-dust').count()>0,'Touch tablets keep resting dust around the desktop rail');
   const touchCard=touchPage.locator('.orca-timeline-event[data-index="4"]'),touchBefore=await touchCard.boundingBox();
   await touchCard.dispatchEvent('pointerenter',{pointerType:'touch'});await touchPage.waitForTimeout(300);
   assert.equal(await touchPage.locator('.orca-history-excited').count(),0,'Touch contact does not latch hover excitement');
   assert.equal((await touchCard.boundingBox()).width,touchBefore.width,'Touch card does not enlarge');
   assert((await dustState(touchPage)).groups.every(g=>g.excitement===0));
   await touchContext.close();console.log('PASS coarse-pointer resting magic without sticky hover');
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
