// R5 ORCA Commons: exercise the actual homepage, shared nav and safe search routing.
// Supabase and external dependencies are stubbed in-memory. No auth actions or writes.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const pages=['index.html','account.html','agent-profile.html','join-research.html','connect-work.html','participation.html','research-workspace.html'];
const documents=new Map(pages.map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]));
const authIDs={
 'account.html':['auth-form','email','password','signin-tab','signup-tab','back-link'],
 'agent-profile.html':['profile-form','display-name','independent-publish','save'],
 'join-research.html':['commons-workspace-link','stock-link','back-link','sign-in-link'],
 'connect-work.html':['copy-prompt','back-to-workspace','account-action','setup-form'],
 'participation.html':[],
 'research-workspace.html':['team-link','chart-frame','timeline-frame','collective-market-outlook','company-profile','research-question','research-answer','publish']
};
const mockSupabase=`export function createClient(){
 return {
 from(table){
  if(table!=='stocks')throw Error('Only public stocks lookup allowed');
  const q={select(){return q},order(){return q},limit(){return Promise.resolve({data:[
   {ticker:'RKLB',company_name:'Rocket Lab Corporation'},
   {ticker:'NVDA',company_name:'NVIDIA Corporation'}],error:null})}};return q;
 },
 auth:{getSession:async()=>({data:{session:null},error:null})}
 };
}`;
function serve(name){return fs.readFileSync(path.join(root,name))}
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/orca-staging/')){res.writeHead(404);res.end();return}
 const name=decodeURIComponent(url.pathname.slice('/orca-staging/'.length))||'index.html';
 if(name==='research-workspace-staging.html'){res.setHeader('Content-Type','text/html');res.end('<title>Verified stock workspace redirect</title><p id="redirect-stub">Offline workspace target</p>');return}
 if(!/^(?:[A-Za-z0-9.-]+\.(?:html|js|css)|assets\/orca-world-(?:management|earnings|positioning)\.webp|assets\/orca-legends-trailer-poster\.svg)$/.test(name)){res.writeHead(404);res.end();return}
 if(name==='index.html' || name===''){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(documents.get('index.html'));return
 }
 const ext=path.extname(name),mime=ext==='.css'?'text/css':ext==='.js'?'text/javascript':ext==='.html'?'text/html':ext==='.svg'?'image/svg+xml':'image/webp';
 res.setHeader('Content-Type',mime);
 try{
  const html=documents.get(name);
  // Static subpage tests keep the exact markup and stylesheet but avoid
  // running authentication and team scripts without the user's account.
  res.end(ext==='.html'?html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''):serve(name));
 }catch{res.writeHead(404);res.end()}
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 for(const width of [1440,393,320]){
  const ctx=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
  await ctx.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:mockSupabase}));
  await ctx.route('https://vbziibatnejoswsdggga.supabase.co/**',route=>route.abort());
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/orca-staging/index.html');
  await page.locator('#orca-stock-query-stock-search').waitFor();
  assert.equal(await page.locator('h1#orca-hero-title').count(),1);
  assert.match(await page.locator('h1').innerText(),/ORCA COMMONS/);
  assert.equal(await page.locator('.realm').count(),3);
  assert.equal(await page.locator('.journey-step').count(),4);
  assert.equal(await page.locator('.orca-global-nav a').count(),5);
  await page.locator('.realm').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('.realm img')].every(img=>img.complete&&img.naturalWidth>0));
  const imageInfo=await page.locator('.realm img').evaluateAll(els=>els.map(x=>({loaded:x.complete&&x.naturalWidth>0,alt:x.alt})));
  assert(imageInfo.every(x=>x.loaded&&x.alt),'approved realm images must load with descriptive alt');
  const metrics=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   columns:getComputedStyle(document.querySelector('.realm-grid')).gridTemplateColumns.split(' ').length,
   background:getComputedStyle(document.body).backgroundImage,
   header:getComputedStyle(document.querySelector('header')).backgroundColor
  }));
  assert.equal(metrics.overflow,false,'Homepage must not cause horizontal overflow at '+width);
  assert.equal(metrics.columns,width>620?3:1);
  assert.match(metrics.background,/gradient/);
  assert.equal(errors.length,0,'Homepage script errors: '+errors.join(';'));
  assert.match(await page.locator('.orca-lookup-status').innerText(),/2 research workspaces already registered/);
  const input=page.locator('#orca-stock-query-stock-search');
  await input.focus();await page.locator('.orca-stock-result').first().click();
  await page.getByRole('button',{name:'Open workspace'}).click();
  await page.waitForURL(/research-workspace-staging\.html\?ticker=NVDA.*environment=orca-staging|research-workspace-staging\.html\?ticker=RKLB.*environment=orca-staging/);
  assert.equal(await page.locator('#redirect-stub').count(),1);
  // Test static navigation and form IDs on the actual HTML, with auth scripts
  // disabled — never submit or impersonate a real owner.
  for(const name of Object.keys(authIDs)){
   await page.goto(origin+'/orca-staging/'+name);
   assert.equal(await page.locator('header.orca-site-header').count(),1,name+' has unified header');
   assert.equal(await page.locator('header.orca-site-header .orca-global-nav a').count(),5,name+' has five usable nav links');
   assert.match(await page.locator('header.orca-site-header').innerText(),/ORCA\s+COMMONS/);
   for(const id of authIDs[name])assert.equal(await page.locator('#'+id).count(),1,name+' preserves '+id);
   // Auth screens preserve their original forms/ids and remain visually readable.
   const state=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth>innerWidth,
    headerVisible:document.querySelector('header').getBoundingClientRect().height>60,
    navInBounds:[...document.querySelectorAll('.orca-global-nav a')].every(a=>a.getBoundingClientRect().left>=0&&a.getBoundingClientRect().right<=innerWidth+2)
   }));
   assert.equal(state.overflow,false,name+' overflow at '+width);
   assert(state.headerVisible&&state.navInBounds,name+' nav clip at '+width);
  }
  // Browser direct ticker shortcut used to throw because 'supported' was
  // missing in the stock-search return value. It now uses registered.
  await page.goto(origin+'/orca-staging/index.html?ticker=RKLB');
  await page.waitForURL(/research-workspace-staging\.html\?ticker=RKLB&environment=orca-staging/);
  console.log('PASS ORCA Commons R5 '+width+'px: homepage, imagery, registered stock routing, four-step journey, shared navigation and preserved auth controls');
  await ctx.close();
 }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
