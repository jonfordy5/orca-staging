// Offline layout and archive-routing regression: no backend or paid API calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const source=fs.readFileSync(path.join(__dirname,'../research-workspace.html'),'utf8');
const css=source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
assert(css,'Production CSS is present');
const start=source.indexOf('<div class="cols">\n  <div>\n    <section id="request-research"');
const end=source.indexOf('</details>\n</main><footer>',start);
assert(start>=0&&end>start,'Original assignment columns and findings exist');
const markup=source.slice(start,end);
const from=source.indexOf('function renderFindings(){');
const to=source.indexOf('function renderCollectiveDashboard(){',from);
assert(from>=0&&to>from,'Production findings renderer exists');
const render=source.slice(from,to);
assert(render.includes("archive.append(...ordered.slice(1).map(renderFinding))"),'History routes to archive');
assert(!render.includes("folded('Previous findings'"),'No duplicate history below latest');
const fixture=[
 '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>',css,
 '</style></head><body><main>',markup,'</main><script>',
 "const $=id=>document.getElementById(id);",
 "const keepOpen=root=>new Set([...root.querySelectorAll('details[data-fold-key][open]')].map(e=>e.dataset.foldKey));",
 "const restoreOpen=(root,keys)=>{for(const e of root.querySelectorAll('details[data-fold-key]'))e.open=keys.has(e.dataset.foldKey)};",
 "const recentFirst=(items,key)=>[...items].sort((a,b)=>String(b[key]).localeCompare(String(a[key])));",
 "let findings=[];",
 "function renderFinding(f){",
 "const el=document.createElement('article');el.className='finding';",
 "const title=document.createElement('strong');title.textContent=f.title;",
 "const paragraph=document.createElement('p');paragraph.textContent=f.summary;",
 "const time=document.createElement('small');time.textContent=f.published_at;",
 "const sources=document.createElement('details');sources.className='source-fold';sources.dataset.foldKey='finding:'+f.id;",
 "const summary=document.createElement('summary');summary.textContent='Source websites (1)';",
 "const link=document.createElement('a');link.href='https://example.com/'+f.id;link.textContent='Original source';",
 "sources.append(summary,link);el.append(title,paragraph,time,sources);return el;}",
 render,
 "window.showFindings=n=>{findings=Array.from({length:n},(_,i)=>({id:'finding-'+i,title:'Published finding '+i,summary:'Dated research and original source information. '.repeat(14),published_at:new Date(Date.UTC(2026,10,14,i)).toISOString()}));renderFindings();};",
 "$('request-research').classList.remove('hidden');window.showFindings(8);",
 '</script></body></html>'
].join('');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const size of [{width:1440,height:1000},{width:393,height:851},{width:320,height:740}]){
   const context=await browser.newContext({viewport:size});
   const page=await context.newPage();const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.setContent(fixture);
   assert.equal(await page.locator('#findings .finding').count(),1,'Latest is in the public board');
   assert.equal(await page.locator('#archive-findings .finding').count(),7,'Earlier entries are in archive once');
   assert.equal(await page.locator('#findings .history-fold').count(),0);
   assert.match(await page.locator('#research-archive-count').innerText(),/7 archived findings/);
   const layout=await page.evaluate(()=>{
    const rect=id=>document.getElementById(id).getBoundingClientRect();
    const claim=rect('request-research'),archive=rect('research-archive'),right=rect('myclaim'),box=rect('archive-findings');
    const el=document.getElementById('archive-findings');
    return {claim:{x:claim.x,bottom:claim.bottom},archive:{x:archive.x,top:archive.top,bottom:archive.bottom},
      right:{x:right.x,top:right.top},boxHeight:box.height,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight};
   });
   assert(Math.abs(layout.claim.x-layout.archive.x)<1,'Archive aligns under claim');
   assert(layout.archive.top>=layout.claim.bottom-1,'Archive follows claim');
   assert(layout.scrollHeight>layout.clientHeight,'Archive scrolls internally');
   assert(layout.boxHeight<=380,'Archive is a bounded-height window');
   if(size.width>760)assert(layout.right.x>layout.archive.x,'Assignment stays in right column');
   else assert(layout.right.top>=layout.archive.bottom-1,'Mobile stacks the panels');
   await page.locator('#archive-findings .source-fold').first().evaluate(el=>{el.open=true});
   await page.locator('#archive-findings').evaluate(el=>{el.scrollTop=140});
   await page.evaluate(()=>renderFindings());
   const after=await page.evaluate(()=>({
    top:document.getElementById('archive-findings').scrollTop,
    open:document.querySelector('#archive-findings .source-fold').open,
    latest:document.querySelector('#findings .finding strong').textContent,
    historical:[...document.querySelectorAll('#archive-findings .finding strong')].map(el=>el.textContent)
   }));
   assert(after.open,'Source accordion remains open after refresh');
   assert(after.top>0,'Scroll position persists after refresh');
   assert.equal(after.latest,'Published finding 7');
   assert.deepEqual(after.historical,Array.from({length:7},(_,i)=>'Published finding '+(6-i)));
   assert.equal(await page.locator('#archive-findings a[href^="https://example.com/"]').count(),7);
   await page.evaluate(()=>window.showFindings(1));
   assert.equal(await page.locator('#archive-findings .finding').count(),0);
   assert.match(await page.locator('#archive-findings').innerText(),/No earlier research findings/);
   await page.evaluate(()=>window.showFindings(0));
   assert.equal(await page.locator('#findings').innerText(),'No public research yet.');
   assert.deepEqual(errors,[]);
   console.log('PASS archive '+size.width+'px: single-copy findings, scroll, sources, refresh and layout');
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
