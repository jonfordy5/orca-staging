// ORCA R6 Guild Hall: isolated browser coverage of real HTML/JS/CSS with
// deterministic owner-bound fixtures. No real accounts, Supabase calls or writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const mockSupabase=`
export function createClient(){
 const fx=window.__GUILD_FIXTURE||{},calls=window.__GUILD_CALLS||[];
 const user=fx.user?{id:'user-owner-1'}:null;
 const profile={id:'profile-1',display_name:'Orca Test Researcher',opted_in:true,independent_publish_enabled:true};
 const teams=[{ticker:'RKLB',display_name:'Rocket Lab Researcher',joined_at:'2026-11-01T00:00:00Z'},
              {ticker:'NVDA',display_name:'NVIDIA Researcher',joined_at:'2026-10-30T00:00:00Z'}];
 function query(table){
  const qb={filters:[],options:{},
   select(fields,opts){this.fields=fields;this.options=opts||{};return this},
   eq(k,v){this.filters.push([k,v]);return this},
   order(){return this},limit(){return this},
   maybeSingle(){return Promise.resolve(result(table,this))},
   then(done,fail){return Promise.resolve(result(table,this)).then(done,fail)}
  };return qb
 }
 function result(table,q){
  calls.push({type:'select',table,fields:q.fields,filters:q.filters});
  if(fx.failProfile&&table==='agent_profiles')return {data:null,error:{message:'Profile RLS unavailable'}};
  if(fx.failFindings&&table==='commons_research_findings')return {data:null,error:{message:'Owner record unavailable'},count:null};
  if(table==='agent_profiles')return {data:profile,error:null};
  if(table==='stock_research_memberships')return {data:teams,error:null};
  if(table==='commons_research_findings')return {data:[
    {id:'a1',ticker:'RKLB',research_area:'News & Market Sentiment',published_at:'2026-11-10T23:00:00Z'},
    {id:'b2',ticker:'NVDA',research_area:'Technical Analysis',published_at:'2026-11-09T23:00:00Z'}
  ],count:2,error:null};
  if(table==='agent_sessions')return {data:[{status:'connected',lease_expires_at:new Date(Date.now()+3600000).toISOString()}],error:null};
  throw Error('Unexpected database query '+table);
 }
 return {auth:{getUser:async()=>({data:{user},error:null})},
  from(table){return query(table)},
  rpc:async(name,args)=>{
   calls.push({type:'rpc',name,args});
   if(name==='commons_my_claim'){
    if(args.p_ticker==='NVDA')return {data:null,error:null};
    return {data:{id:'claimed-task-1',ticker:'RKLB',research_area:'News & Market Sentiment',
      research_question:'Independently investigate market sentiment with dated sources.',
      claimed_until:new Date(Date.now()+3600000).toISOString()},error:null}
   }
   if(name==='orca_my_assigned_board')return {data:{
    task_id:'claimed-task-1',board_key:'execution',board_label:'Management',
    metric:'News & Market Sentiment',cycle_number:3
   },error:null};
   throw Error('Unexpected RPC '+name)
  }
 }
}
`;
const server=http.createServer((req,res)=>{
 const loc=new URL(req.url,'http://localhost');
 if(!loc.pathname.startsWith('/orca-staging/')){res.writeHead(404);res.end();return}
 const resource=loc.pathname.slice('/orca-staging/'.length);
 if(resource==='index.html'){res.setHeader('Content-Type','text/html');res.end('<a href="guild-hall.html">Guild Hall</a>');return}
 if(!/^(?:guild-hall\.html|orca-guild-hall\.js|orca-guild-hall\.css|orca-commons-theme\.css|orca-staging-config\.js|orca-metric-labels\.js|assets\/orca-world-(?:management|earnings|positioning)\.webp)$/.test(resource)){res.writeHead(404);res.end();return}
 try{
  const asset=fs.readFileSync(path.join(root,resource));
  const mime=resource.endsWith('.html')?'text/html':resource.endsWith('.css')?'text/css':resource.endsWith('.js')?'text/javascript':'image/webp';
  res.setHeader('Content-Type',mime);res.end(asset);
 }catch{res.writeHead(404);res.end()}
});
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{})});
  const site='http://127.0.0.1:'+server.address().port+'/orca-staging/';
  for(const width of [1440,393,320]){
   const context=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
   await context.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:mockSupabase}));
   const signedOut=await context.newPage();
   const errors=[];
   signedOut.on('pageerror',e=>errors.push(e.message));
   await signedOut.addInitScript(()=>{window.__GUILD_FIXTURE={user:false};window.__GUILD_CALLS=[]});
   await signedOut.goto(site+'guild-hall.html');
   await signedOut.locator('#guild-locked').waitFor({state:'visible'});
   assert.equal(await signedOut.locator('#guild-dashboard').isVisible(),false);
   assert.match(await signedOut.locator('#guild-sign-in').getAttribute('href'),/returnTo=guild-hall.html/);
   assert.deepEqual(await signedOut.evaluate(()=>window.__GUILD_CALLS),[],'signed-out view must not query owner records');
   assert.equal(errors.length,0,errors.join(';'));
   await signedOut.close();

   const page=await context.newPage(),problems=[];
   page.on('pageerror',e=>problems.push(e.message));
   await page.addInitScript(()=>{window.__GUILD_FIXTURE={user:true};window.__GUILD_CALLS=[]});
   await page.goto(site+'guild-hall.html');
   await page.locator('#guild-status[data-kind="success"]').waitFor();
   assert.equal(await page.locator('header.orca-site-header .orca-global-nav a').count(),5);
   assert.match(await page.locator('#guild-profile-name').innerText(),/Orca Test Researcher/);
   assert.match(await page.locator('#guild-consent').innerText(),/ON/);
   assert.match(await page.locator('#guild-connected').innerText(),/Active lease/);
   assert.equal(await page.locator('#guild-team-count').innerText(),'2 teams');
   assert.equal(await page.locator('#guild-count-publications').innerText(),'2');
   assert.equal(await page.locator('#guild-evidence-list li').count(),2);
   assert.match(await page.locator('#guild-mission-title').innerText(),/War Drums/);
   assert.match(await page.locator('#guild-mission-realm').innerText(),/The King.s Keep/);
   assert.match(await page.locator('#guild-mission-question').innerText(),/Independently investigate/);
   assert.match(await page.locator('#guild-mission-deadline').innerText(),/\d/);
   assert.match(await page.locator('#guild-launch-work').getAttribute('href'),/connect-work.html\?ticker=RKLB/);
   const allCalls=await page.evaluate(()=>window.__GUILD_CALLS);
   assert(allCalls.some(c=>c.type==='rpc'&&c.name==='commons_my_claim'&&c.args.p_ticker==='RKLB'));
   assert(allCalls.some(c=>c.type==='rpc'&&c.name==='orca_my_assigned_board'&&c.args.p_task_id==='claimed-task-1'));
   assert(allCalls.some(c=>c.type==='select'&&c.table==='commons_research_findings'&&c.filters.some(([k,v])=>k==='contributor_id'&&v==='user-owner-1')));
   assert(allCalls.every(c=>c.type==='select'||c.name==='commons_my_claim'||c.name==='orca_my_assigned_board'),'No mutation calls allowed');
   await page.locator('#guild-ticker').selectOption('NVDA');
   await page.locator('#guild-mission-empty').waitFor({state:'visible'});
   assert.match(await page.locator('#guild-mission-empty').innerText(),/No active assignment/);
   assert.match(await page.locator('#guild-open-workspace').getAttribute('href'),/ticker=NVDA/);
   const overflow=await page.evaluate(()=>({page:document.documentElement.scrollWidth>innerWidth,hero:document.querySelector('.guild-hero').getBoundingClientRect().width}));
   assert.equal(overflow.page,false,'Guild Hall horizontal overflow '+width);
   assert(overflow.hero>100);
   for(const src of ['management','earnings','positioning']){
    const img=page.locator('img[src$="orca-world-'+src+'.webp"]');
    await img.scrollIntoViewIfNeeded();
    await img.evaluate(x=>x.decode());
    assert(await img.evaluate(x=>x.naturalWidth>0),src+' approved realm image missing');
   }
   assert.equal(problems.length,0,problems.join(';'));
   await page.close();

   const fallback=await context.newPage();
   await fallback.addInitScript(()=>{window.__GUILD_FIXTURE={user:true,failProfile:true,failFindings:true};window.__GUILD_CALLS=[]});
   await fallback.goto(site+'guild-hall.html');
   await fallback.locator('#guild-status[data-kind="success"]').waitFor();
   assert.match(await fallback.locator('#guild-profile-name').innerText(),/unavailable/);
   assert.equal(await fallback.locator('#guild-count-publications').innerText(),'—');
   assert.match(await fallback.locator('#guild-published-status').innerText(),/unavailable/);
   assert.equal(await fallback.locator('#guild-mission-data').isVisible(),true,'partial data errors should not suppress a verified mission');
   await fallback.close();
   await context.close();
   console.log('PASS Guild Hall '+width+'px: sign-out privacy, real owner read contracts, mission Board RPC, source-backed counts, empty mission, partial failures and mobile geometry');
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
run().catch(err=>{console.error(err);process.exitCode=1});
