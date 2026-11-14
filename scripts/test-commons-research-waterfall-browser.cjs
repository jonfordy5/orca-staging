// Offline Chromium regression against the real Join Research HTML and task renderer.
// No Supabase network connection, researcher identity changes or new findings.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'join-research.html'),'utf8');
const start=source.indexOf('function taskStatus(t)');
const end=source.indexOf('function renderMembers(rows)');
assert(start>0&&end>start,'Must exercise actual research metric renderer from Join Research');
const logic=source.slice(start,end);
const fixtureScript=[
 'const $=id=>document.getElementById(id);',
 logic,
 'const tasks=fiveResearchMetrics.map((m,i)=>({research_area:m.area,status:i===1?"claimed":"open",',
 ' research_question:"Investigate this metric with primary evidence and cite the original dated source "+(i+1),',
 ' updated_at:"2026-11-13T14:00:00Z"}));',
 'const findings=fiveResearchMetrics.map((m,i)=>({research_area:m.area,contributor_alias:"Test researcher "+(i+1),',
 ' published_at:"2026-11-13T14:00:00Z",summary:"Long published research summary "+(i+1)+',
 ' ". Existing evidence is retained and source-backed; this text is only a browser fixture. ".repeat(5)}));',
 'const cycle={state:"ready",cycle_number:2,completed_count:1,completed_metric_keys:["fundamentals.valuation"]};',
 'showResearchCycle(cycle,tasks,findings);renderTasks(tasks,findings,cycle);',
 'window.waterfallReady=true;'
].join('\n');
const fixture=source.replace(/<script type="module">[\s\S]*?<\/script>/,
 '<script>'+fixtureScript.replace(/<\/script/gi,'<\\/script')+'</script>');
assert.notEqual(fixture,source,'Must replace live module with offline fixture');
const server=http.createServer((req,res)=>{
 const file=new URL(req.url,'http://127.0.0.1').pathname;
 if(file==='/'){
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);
 }
 if(file==='/orca-commons-theme.css'){
  res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync(path.join(root,'orca-commons-theme.css')));
 }
 res.writeHead(404);res.end();
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  for(const width of [1440,393,320]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(url);await page.waitForFunction(()=>window.waterfallReady);
   const info=await page.evaluate(()=>{
    const panel=document.querySelector('#activity-card'),viewport=document.querySelector('#tasks');
    const primary=viewport.querySelector('.orca-waterfall-stack:not(.orca-waterfall-clone)');
    const clone=viewport.querySelector('.orca-waterfall-clone');
    const controls=document.querySelector('#activity-card .controls');
    return {panelHeight:panel.getBoundingClientRect().height,
     viewportHeight:viewport.getBoundingClientRect().height,
     viewportBackground:getComputedStyle(viewport).backgroundImage,
     panelBackground:getComputedStyle(panel).backgroundImage,
     originalCards:primary?.querySelectorAll('.task').length,
     cloneCards:clone?.querySelectorAll('.task').length,
     duplicateAccessible:clone?.getAttribute('aria-hidden'),
     duplicateInert:clone?.inert,
     buttonVisible:getComputedStyle(document.querySelector('#waterfall-toggle')).display!=='none',
     controlsBelow:controls.getBoundingClientRect().top>=viewport.getBoundingClientRect().bottom,
     horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
     originalText:primary?.querySelector('.task .row strong')?.textContent};
   });
   console.log('WATERFALL DIMENSIONS',width,JSON.stringify(info));
   assert(info.panelHeight<740,'Research area must be compact instead of growing with every metric');
   assert(info.viewportHeight>=275&&info.viewportHeight<=330,'Waterfall must have a short fixed viewport');
   assert.match(info.viewportBackground,/gradient/,'Translucent glass background stays visible');
   assert.match(info.panelBackground,/gradient/,'Legends dark panel replaces old white card');
   assert.equal(info.originalCards,5,'All five real metric categories remain available');
   assert.equal(info.cloneCards,5,'A second visual copy creates the continuous waterfall');
   assert.equal(info.duplicateAccessible,'true','Screen reader only encounters original five cards');
   assert.equal(info.duplicateInert,true,'Duplicated visual cards cannot capture focus');
   assert(info.buttonVisible,'Users can pause motion');
   assert(info.controlsBelow,'Research buttons are not trapped inside the moving viewport');
   assert.equal(info.originalText,'SEC Filings & Catalysts','Original research labels are preserved');
   assert.equal(info.horizontalOverflow,false,'No horizontal page scrolling');
   const before=await page.locator('#tasks').evaluate(el=>el.scrollTop);
   await page.waitForTimeout(1100);
   const after=await page.locator('#tasks').evaluate(el=>el.scrollTop);
   assert(after>before+16,'The waterfall moves without user interaction');
   await page.locator('#waterfall-toggle').click();
   assert.equal(await page.locator('#waterfall-toggle').getAttribute('aria-pressed'),'true');
   const paused=await page.locator('#tasks').evaluate(el=>el.scrollTop);
   await page.waitForTimeout(420);
   const pausedAfter=await page.locator('#tasks').evaluate(el=>el.scrollTop);
   assert(Math.abs(pausedAfter-paused)<2,'Pause flow stops the automatic motion');
   await page.locator('#waterfall-toggle').click();
   const resumed=await page.locator('#tasks').evaluate(el=>el.scrollTop);
   await page.waitForTimeout(650);
   assert((await page.locator('#tasks').evaluate(el=>el.scrollTop))>resumed+8,'Resume flow restarts motion');
   await page.locator('#tasks').hover();
   const hovered=await page.locator('#tasks').evaluate(el=>el.scrollTop);
   await page.waitForTimeout(300);
   assert(Math.abs((await page.locator('#tasks').evaluate(el=>el.scrollTop))-hovered)<2,'Hover pauses to let visitors read');
   await page.mouse.wheel(0,115);
   await page.waitForTimeout(120);
   assert((await page.locator('#tasks').evaluate(el=>el.scrollTop))>hovered+40,'Wheel browsing continues to work');
   assert.deepEqual(errors,[],'No script errors');
   console.log('PASS waterfall '+width+'px: compact dark glass, continuous motion, accessible duplicate, pause, hover, manual scroll and controls');
   await context.close();
  }
  const context=await browser.newContext({viewport:{width:393,height:851},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto(url);await page.waitForFunction(()=>window.waterfallReady);
  assert.equal(await page.locator('.orca-waterfall-stack:not(.orca-waterfall-clone) .task').count(),5);
  assert.equal(await page.locator('.orca-waterfall-clone').count(),0,'Reduced motion never creates duplicate visual cards');
  assert.equal(await page.locator('#waterfall-toggle').isVisible(),false);
  const before=await page.locator('#tasks').evaluate(el=>el.scrollTop);
  await page.waitForTimeout(450);
  assert.equal(await page.locator('#tasks').evaluate(el=>el.scrollTop),before);
  await page.locator('#tasks').evaluate(el=>el.scrollTop=160);
  assert((await page.locator('#tasks').evaluate(el=>el.scrollTop))>=150,'Reduced-motion visitors can still manually scroll');
  await context.close();
  console.log('PASS reduced motion: no animation or duplicate, full manual list available');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});