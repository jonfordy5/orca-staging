// ORCA R6 Guild Hall: isolated browser coverage of real HTML/JS/CSS with
// deterministic owner-bound fixtures. No real accounts, Supabase calls or writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const mockSupabase=`
export function createClient(){
 const fx=window.__GUILD_FIXTURE||{},calls=window.__GUILD_CALLS||[];
 const defaultTeams=[{ticker:'RKLB',display_name:'Rocket Lab Researcher',joined_at:'2026-11-01T00:00:00Z'},
              {ticker:'NVDA',display_name:'NVIDIA Researcher',joined_at:'2026-10-30T00:00:00Z'}];
 const delay=(value,ms)=>new Promise(resolve=>setTimeout(()=>resolve(value),ms||0));
 function query(table){
  const qb={filters:[],options:{},
   select(fields,opts){this.fields=fields;this.options=opts||{};return this},
   eq(k,v){this.filters.push([k,v]);return this},
   order(){return this},limit(){return this},range(from,to){this.range=[from,to];return this},
   maybeSingle(){return delay(result(table,this),fx.delayTable===table?150:0)},
   then(done,fail){return delay(result(table,this),fx.delayTable===table?150:0).then(done,fail)}
  };return qb
 }
 function result(table,q){
  calls.push({type:'select',table,fields:q.fields,filters:q.filters,options:q.options,range:q.range});
  if(fx.failProfile&&table==='agent_profiles')return {data:null,error:{message:'Profile RLS unavailable'}};
  if(fx.failTeams&&table==='stock_research_memberships')return {data:null,error:{message:'Team records unavailable'}};
  if(fx.failFindings&&table==='commons_research_findings')return {data:null,error:{message:'Owner record unavailable'},count:null};
  if(table==='agent_profiles')return {data:fx.noProfile?null:{id:'profile-1',display_name:fx.profileName||'Orca Test Researcher',opted_in:fx.permissionOff?false:true,independent_publish_enabled:!fx.permissionOff},error:null};
  if(table==='stock_research_memberships'){
   const teams=fx.teams||defaultTeams;
   return {data:teams.slice(q.range[0],q.range[1]+1),count:teams.length,error:null};
  }
  if(table==='commons_research_findings')return {data:fx.noFindings?[]:[
    {id:'a1',ticker:'RKLB',research_area:'News & Market Sentiment',published_at:'2026-11-10T23:00:00Z'},
    {id:'b2',ticker:'NVDA',research_area:'Technical Analysis',published_at:'2026-11-09T23:00:00Z'}
  ],count:fx.missingCount?null:fx.noFindings?0:fx.findingCount??2,error:null};
  if(table==='agent_sessions')return {data:[{status:'connected',lease_expires_at:new Date(Date.now()+(fx.expiredSession?-3600000:fx.leaseMs||3600000)).toISOString()}],error:fx.failSessions?{message:'Session unavailable'}:null};
  throw Error('Unexpected database query '+table);
 }
 return {auth:{
  getUser:async()=>({data:{user:fx.user?{id:fx.owner||'user-owner-1'}:null},error:fx.authError?{name:'AuthError'}:null}),
  onAuthStateChange(callback){window.__GUILD_AUTH_EVENT=(event,nextOwner)=>{
   fx.user=event!=='SIGNED_OUT';if(nextOwner)fx.owner=nextOwner;
   callback(event,fx.user?{user:{id:fx.owner||'user-owner-1'}}:null);
  };return {data:{subscription:{unsubscribe(){}}}}}
 },
  from(table){return query(table)},
  rpc:async(name,args)=>{
   calls.push({type:'rpc',name,args});
   if(name==='commons_my_claim'){
    if(args.p_ticker==='NVDA'||fx.noClaim)return {data:null,error:null};
    const response={data:{id:'claimed-task-1',ticker:fx.wrongClaimTicker?'OTHER':'RKLB',research_area:'News & Market Sentiment',
      research_question:'Independently investigate market sentiment with dated sources.',
      claimed_until:new Date(Date.now()+(fx.expiredClaim?-3600000:fx.leaseMs||3600000)).toISOString()},error:null};
    return delay(response,fx.delayClaim?150:0);
   }
   if(name==='orca_my_assigned_board')return {data:{
    task_id:fx.wrongBoardTask?'someone-elses-task':'claimed-task-1',board_key:fx.noBoardKey?null:'execution',board_label:'Management',
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
   assert.equal(await signedOut.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Signed-out Guild Hall horizontal overflow '+width);
   await signedOut.keyboard.press('Tab');
   assert.equal(await signedOut.evaluate(()=>document.activeElement.className),'guild-skip');
   assert(await signedOut.locator('.guild-skip').evaluate(el=>el.getBoundingClientRect().top>=0),'Skip link is visible on keyboard focus');
   await signedOut.keyboard.press('Enter');
   assert.equal(await signedOut.evaluate(()=>document.activeElement.id),'guild-hall');
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
   assert.equal(await page.locator('.guild-work-steps li').count(),3);
   assert.deepEqual(await page.locator('.guild-work-steps strong').allTextContents(),['Prepare','Copy & open','Verify & research']);
   assert.match(await page.locator('.guild-source-note').innerText(),/never claims an assignment or starts AI research/);
   await page.locator('#guild-ticker').focus();
   assert.equal(await page.locator('#guild-ticker').evaluate(el=>getComputedStyle(el).outlineStyle),'solid','Team selector must have visible keyboard focus');
   const allCalls=await page.evaluate(()=>window.__GUILD_CALLS);
   assert(allCalls.some(c=>c.type==='rpc'&&c.name==='commons_my_claim'&&c.args.p_ticker==='RKLB'));
   assert(allCalls.some(c=>c.type==='rpc'&&c.name==='orca_my_assigned_board'&&c.args.p_task_id==='claimed-task-1'));
   for(const [table,column,owner] of [['agent_profiles','owner_id','user-owner-1'],['stock_research_memberships','user_id','user-owner-1'],['commons_research_findings','contributor_id','user-owner-1'],['agent_sessions','agent_profile_id','profile-1']]){
    assert(allCalls.some(c=>c.table===table&&c.filters.some(([k,v])=>k===column&&v===owner)),table+' must be bound to validated owner/profile');
   }
   assert(allCalls.find(c=>c.table==='commons_research_findings').options.count==='exact');
   assert(allCalls.find(c=>c.table==='stock_research_memberships').options.count==='exact');
   assert(!allCalls.some(c=>/token|owner_id/.test(c.fields||'')),'No credentials or owner UUIDs selected for display');
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
  const context=await browser.newContext({viewport:{width:393,height:850}});
  await context.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:mockSupabase}));
  const open=async(fixture,query='')=>{
   const targetContext=fixture.clock?await browser.newContext({viewport:{width:393,height:850}}):context;
   if(fixture.clock)await targetContext.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:mockSupabase}));
   const page=await targetContext.newPage();
   if(fixture.clock)await page.clock.install();
   await page.addInitScript(fx=>{window.__GUILD_FIXTURE=fx;window.__GUILD_CALLS=[]},fixture);
   await page.goto(site+'guild-hall.html'+query);
   await page.locator('#guild-status[data-kind="success"],#guild-status[data-kind="error"],#guild-locked:not([hidden])').first().waitFor();
   return page;
  };
  for(const [fixture,check] of [
   [{user:true,teams:[],noFindings:true,noProfile:true},async p=>{
    assert.equal(await p.locator('#guild-count-teams').innerText(),'0');
    assert.equal(await p.locator('#guild-count-publications').innerText(),'0');
    assert.match(await p.locator('#guild-profile-name').innerText(),/No agent profile/);
    assert.match(await p.locator('#guild-mission-empty').innerText(),/No research team selected/);
    assert(!(await p.evaluate(()=>window.__GUILD_CALLS)).some(c=>c.type==='rpc'||c.table==='agent_sessions'));
   }],
   [{user:true,failTeams:true},async p=>{
    assert.equal(await p.locator('#guild-count-teams').innerText(),'—');
    assert.match(await p.locator('#guild-ticker').innerText(),/unavailable/);
    assert.match(await p.locator('#guild-mission-empty').innerText(),/could not be verified/);
    assert(!(await p.evaluate(()=>window.__GUILD_CALLS)).some(c=>c.type==='rpc'));
   }],
   [{user:true,permissionOff:true},async p=>{
    assert.match(await p.locator('#guild-consent').innerText(),/OFF/);
    assert.match(await p.locator('#guild-publish-permission').innerText(),/OFF/);
    assert.match(await p.locator('#guild-connected').innerText(),/Not connected/);
    assert(!(await p.evaluate(()=>window.__GUILD_CALLS)).some(c=>c.table==='agent_sessions'));
   }],
   [{user:true,expiredSession:true},async p=>assert.match(await p.locator('#guild-connected').innerText(),/Not connected/)],
   [{user:true,failSessions:true},async p=>assert.match(await p.locator('#guild-connected').innerText(),/Unavailable/)],
   [{user:true,expiredClaim:true},async p=>{
    assert.equal(await p.locator('#guild-mission-data').isVisible(),false);
    assert.match(await p.locator('#guild-mission-empty').innerText(),/lease is not current/);
   }],
   ...['wrongBoardTask','noBoardKey','wrongClaimTicker'].map(flag=>[{user:true,[flag]:true},async p=>{
    assert.equal(await p.locator('#guild-mission-data').isVisible(),false);
    assert.match(await p.locator('#guild-mission-empty').innerText(),/could not verify/);
   }]),
   [{user:true,findingCount:37},async p=>{
    assert.equal(await p.locator('#guild-count-publications').innerText(),'37');
    assert.equal(await p.locator('#guild-evidence-list li').count(),2,'Total must use exact count, not sample length');
   }],
   [{user:true,missingCount:true},async p=>assert.equal(await p.locator('#guild-count-publications').innerText(),'—')],
   [{user:true,authError:true},async p=>{
    assert.equal(await p.locator('#guild-dashboard').isVisible(),false);
    assert.deepEqual(await p.evaluate(()=>window.__GUILD_CALLS),[]);
   }],
   [{user:true,profileName:'<img src=x onerror="window.untrustedExecuted=true">'},async p=>{
    assert.match(await p.locator('#guild-profile-name').innerText(),/<img/);
    assert.equal(await p.locator('#guild-profile-name img').count(),0);
    assert.equal(await p.evaluate(()=>!!window.untrustedExecuted),false);
   }],
  ]){
   const page=await open(fixture);await check(page);await page.close();
  }
  const roster=Array.from({length:101},(_,n)=>({ticker:'T'+n,display_name:'Team '+n,joined_at:'2026-11-01T00:00:00Z'}));
  const many=await open({user:true,teams:roster});
  assert.equal(await many.locator('#guild-count-teams').innerText(),'101');
  assert.equal(await many.locator('#guild-ticker option').count(),101);
  assert.equal((await many.evaluate(()=>window.__GUILD_CALLS)).filter(c=>c.table==='stock_research_memberships').length,2);
  await many.close();

  const expiring=await open({user:true,clock:true});
  await expiring.clock.fastForward(3601000);
  assert.match(await expiring.locator('#guild-connected').innerText(),/Lease expired/);
  assert.equal(await expiring.locator('#guild-mission-data').isVisible(),false);
  assert.match(await expiring.locator('#guild-mission-empty').innerText(),/lease has expired/);
  await expiring.context().close();

  const longLease=await open({user:true,clock:true,leaseMs:2147483647+3600000});
  // Playwright also accepts signed 32-bit durations; advance in two parts.
  await longLease.clock.fastForward(2000000000);
  await longLease.clock.fastForward(147484647);
  assert.match(await longLease.locator('#guild-connected').innerText(),/Active lease/,'Long leases must not expire at the browser timeout limit');
  assert.equal(await longLease.locator('#guild-mission-data').isVisible(),true);
  await longLease.clock.fastForward(3600000);
  assert.match(await longLease.locator('#guild-connected').innerText(),/Lease expired/);
  assert.equal(await longLease.locator('#guild-mission-data').isVisible(),false);
  await longLease.context().close();

  const longAlias=await open({user:true,teams:[{ticker:'RKLB',display_name:'A'.repeat(200),joined_at:'2026-11-01T00:00:00Z'}]});
  await longAlias.setViewportSize({width:320,height:850});
  assert.equal(await longAlias.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Unbroken team alias must fit the 320px layout');
  await longAlias.close();

  const requested=await open({user:true},'?ticker=NOTJOINED');
  assert.equal(await requested.locator('#guild-ticker').inputValue(),'RKLB');
  assert(!(await requested.evaluate(()=>window.__GUILD_CALLS)).some(c=>c.args?.p_ticker==='NOTJOINED'));
  await requested.close();

  const race=await open({user:true});
  await race.evaluate(()=>{window.__GUILD_FIXTURE.delayClaim=true});
  await race.locator('#guild-ticker').selectOption('NVDA');
  await race.locator('#guild-ticker').selectOption('RKLB');
  await race.locator('#guild-ticker').selectOption('NVDA');
  await race.waitForTimeout(200);
  assert.equal(await race.locator('#guild-mission-data').isVisible(),false,'Late response must not replace current team');
  assert.match(await race.locator('#guild-open-workspace').getAttribute('href'),/ticker=NVDA/);
  await race.evaluate(()=>window.__GUILD_AUTH_EVENT('SIGNED_OUT'));
  assert.equal(await race.locator('#guild-dashboard').isVisible(),false);
  assert.equal(await race.locator('#guild-profile-name').innerText(),'—');
  assert.equal(await race.locator('#guild-evidence-list li').count(),0);
  await race.close();

  const pending=await context.newPage();
  await pending.addInitScript(()=>{window.__GUILD_FIXTURE={user:true,delayTable:'agent_profiles'};window.__GUILD_CALLS=[]});
  await pending.goto(site+'guild-hall.html');
  await pending.waitForFunction(()=>window.__GUILD_CALLS.some(c=>c.table==='agent_profiles'));
  await pending.evaluate(()=>window.__GUILD_AUTH_EVENT('SIGNED_OUT'));
  await pending.waitForTimeout(200);
  assert.equal(await pending.locator('#guild-dashboard').isVisible(),false,'Pending owner data cannot reopen signed-out view');
  assert.equal(await pending.locator('#guild-profile-name').innerText(),'—','Late owner response must not repopulate private DOM');
  assert.equal(await pending.locator('#guild-count-publications').innerText(),'—','Late owner responses must not repopulate totals');
  await pending.close();

  const switched=await context.newPage();
  await switched.addInitScript(()=>{window.__GUILD_FIXTURE={user:true,delayTable:'agent_profiles',profileName:'Previous owner'};window.__GUILD_CALLS=[]});
  await switched.goto(site+'guild-hall.html');
  await switched.waitForFunction(()=>window.__GUILD_CALLS.some(c=>c.table==='agent_profiles'));
  await switched.evaluate(()=>{window.__GUILD_FIXTURE.profileName='Current owner';window.__GUILD_AUTH_EVENT('SIGNED_IN','user-owner-2')});
  await switched.locator('#guild-status[data-kind="success"]').waitFor();
  assert.equal(await switched.locator('#guild-profile-name').innerText(),'Current owner','Account changes must ignore the previous profile response');
  const changedCalls=await switched.evaluate(()=>window.__GUILD_CALLS);
  for(const [table,column] of [['agent_profiles','owner_id'],['stock_research_memberships','user_id'],['commons_research_findings','contributor_id']]){
   assert(changedCalls.some(c=>c.table===table&&c.filters.some(([k,v])=>k===column&&v==='user-owner-2')));
  }
  await switched.close();
  await context.close();
  console.log('PASS Guild Hall edge cases: complete team pagination, owner totals, missing data, rejected assignments, permissions, expired leases, untrusted text, query selection and sign-out/race privacy');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
run().catch(err=>{console.error(err);process.exitCode=1});
