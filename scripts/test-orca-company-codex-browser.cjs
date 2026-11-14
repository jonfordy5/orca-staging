// R4 Company Codex — actual shared renderer and CSS, with synthetic source-backed fixtures.
// This test deliberately uses NO Supabase session, paid AI, live requests, or publishing.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const workspace=fs.readFileSync(path.join(root,'research-workspace.html'),'utf8');
const css=workspace.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const start=workspace.indexOf('<section class="card company-profile');
const end=workspace.indexOf('<section class="card" id="chart-section">',start);
assert(start>=0&&end>start&&css,'Shared Company Codex section or CSS not found');
const companyHTML=workspace.slice(start,end);
const fixture=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main>${companyHTML}</main><script type="module">
import {renderUnifiedCompanyProfile} from '/orca-auto-company-profile.js';
window.mountCompany=(ticker,data)=>renderUnifiedCompanyProfile(document.getElementById('company-profile'),ticker,data);
window.codexReady=true;
</script></body></html>`;
const illustrated='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#213951"/><circle cx="760" cy="140" r="190" fill="#d9b977"/><path d="M100 560 L450 120 L850 560" stroke="#9cc6e9" fill="none" stroke-width="60"/></svg>');
const rocket={
 name:'Rocket Lab Corporation',description:'Rocket Lab operates orbital launch services, spacecraft manufacturing and satellite components.',
 mission:'Expand access to space.',missionHeading:'Mission',
 headquarters:'Long Beach, California, United States',founded:'2006',founderCEO:'Peter Beck',
 industry:'Aerospace',listing:'NASDAQ · RKLB',operations:'Rocket Lab supplies dedicated launches and space systems to commercial and government customers.',
 how:'Customers purchase launch services, spacecraft and satellite components.',
 businessLines:[{name:'Launch Services',detail:'Dedicated launch and test missions.'},{name:'Space Systems',detail:'Spacecraft and satellite components.'}],
 strengths:['Launch and space systems support more than one customer need.'],
 investorFocus:'Study launch cadence, delivery commitments and development spending.',
 risks:['Development spending and launch schedules can affect financial results.'],
 businessSource:'https://example.org/company-filing',businessSourceLabel:'Company filing',
 metrics:{employees:{value:2800,year:2025,source:'https://example.org/employees'}},
 logo:{url:illustrated,alt:'Rocket Lab source-backed logo'},
 photo:{url:illustrated,source:'https://example.org/source-photo',alt:'Rocket in flight',caption:'Launch photo',credit:'Company press'},
 links:[{label:'Company IR',url:'https://example.org/ir'},{label:'Unsafe link',url:'javascript:alert(1)'}],
 sourceUpdated:'2026-11-10',sourceNote:'Based on reported documents.'
};
async function main(){
 const server=http.createServer((req,res)=>{
  const uri=new URL(req.url,'http://localhost').pathname;
  if(uri==='/'){res.setHeader('Content-Type','text/html');return res.end(fixture)}
  if(['/orca-auto-company-profile.js','/orca-company-size.js','/orca-staging-config.js'].includes(uri)){
   res.setHeader('Content-Type','application/javascript');return res.end(fs.readFileSync(path.join(root,uri)));
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const origin='http://127.0.0.1:'+server.address().port;
  for(const viewport of [{width:1440,height:900},{width:393,height:851},{width:320,height:740}]){
   const ctx=await browser.newContext({viewport,reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[],external=[];
   page.on('pageerror',e=>errors.push(e.message));
   await ctx.route('**/*',route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/'))return route.continue();
    external.push(url);
    return route.abort();
   });
   await page.goto(origin);await page.waitForFunction(()=>window.codexReady);
   await page.evaluate(profile=>window.mountCompany('RKLB',profile),rocket);
   assert.equal(await page.locator('#company-profile .codex-title').innerText(),'The Company Codex');
   assert.equal(await page.locator('#company-profile .company-name').innerText(),'Rocket Lab Corporation');
   assert.equal(await page.locator('#company-profile .codex-insight').count(),4);
   assert.match(await page.locator('#company-profile .codex-insight').first().innerText(),/dedicated launches/i);
   assert.match(await page.locator('#company-profile .codex-insight').nth(1).innerText(),/customer need/i);
   assert.match(await page.locator('#company-profile .codex-insight').nth(0).innerText(),/REVENUE ENGINE CASH FLOW/);
   assert.match(await page.locator('#company-profile .codex-insight').nth(1).innerText(),/COMPANY CAPABILITIES/);
   assert.match(await page.locator('#company-profile .codex-insight').nth(2).innerText(),/THE WATCHTOWER/);
   assert.match(await page.locator('#company-profile .codex-insight').nth(3).innerText(),/VULNERABILITIES/);
   assert.match(await page.locator('#company-profile .codex-insight').nth(2).innerText(),/not yet been published/i);
   assert.equal(await page.locator('#company-profile .company-activity-photo img').count(),1);
   assert.equal(await page.locator('#company-profile .company-activity-photo > a').getAttribute('href'),'https://example.org/source-photo');
   assert.equal(await page.locator('#company-profile .codex-source-footer a[href="https://example.org/company-filing"]').count(),1);
   assert.equal(await page.locator('#company-profile a[href^="javascript:"]').count(),0);
   assert.equal(await page.locator('#company-profile .codex-dossier').count(),0,'No redundant dossier dropdown remains');
   const buttons=page.locator('#company-profile .codex-insight-trigger');
   assert.equal(await buttons.count(),4);
   await buttons.nth(0).click();
   assert.equal(await buttons.nth(0).getAttribute('aria-expanded'),'true');
   assert.match(await page.locator('#codex-chapter-detail').innerText(),/Launch Services|Dedicated launch/i);
   assert.match(await page.locator('#codex-chapter-detail').innerText(),/Employees \(2025\)/);
   await buttons.nth(1).click();
   assert.equal(await buttons.nth(0).getAttribute('aria-expanded'),'false','Switching chapters closes prior');
   assert.match(await page.locator('#codex-chapter-detail').innerText(),/Expand access to space/i);
   await page.evaluate(()=>{
    document.querySelector('#company-profile').applyCodexIntelligence([
     {chapter:'watchtower',status:'ready',summary:'Engine test results and launch commitments require verification.',
      analysis:['First report states specific verified test results.','A later disclosure provides measurable evidence.'],
      watch_items:['Confirm flight readiness against company documents.'],source_urls:['https://example.org/ir'],
      findings_count:3,generated_at:'2026-11-14T15:00:00Z'},
     {chapter:'watchtower',status:'ready',summary:'Earlier report on launch plans.',
      analysis:['Earlier launch schedule assessment.'],source_urls:['https://example.org/ir'],
      findings_count:1,generated_at:'2026-10-01T15:00:00Z'},
     {chapter:'vulnerabilities',status:'ready',summary:'Production delays and spending are risks.',
      analysis:['Current development spend and delays need documentary review.'],
      source_urls:['https://example.org/company-filing'],findings_count:2,generated_at:'2026-11-14T15:00:00Z'}
    ]);
   });
   assert.match(await buttons.nth(2).innerText(),/Engine test results/);
   await buttons.nth(2).click();
   assert.match(await page.locator('#codex-chapter-detail').innerText(),/First report states specific verified test results/);
   assert.match(await page.locator('#codex-chapter-detail .codex-chapter-meta').innerText(),/3 findings reviewed/);
   await page.locator('#codex-chapter-detail .codex-chapter-evidence summary').click();
   assert.equal(await page.locator('#codex-chapter-detail a[href="https://example.org/ir"]').count(),1);
   await page.locator('#codex-chapter-detail .codex-chapter-archive summary').click();
   assert.match(await page.locator('#codex-chapter-detail').innerText(),/Earlier report on launch plans/);
   await buttons.nth(2).click();
   assert.equal(await buttons.nth(2).getAttribute('aria-expanded'),'false','Chapter closes on second click');
   await buttons.nth(3).click();
   assert.match(await page.locator('#codex-chapter-detail').innerText(),/Current development spend/);
   const state=await page.evaluate(()=>{
    const root=document.querySelector('#company-profile'),cards=root.querySelector('.codex-insight-grid');
    const css=getComputedStyle(root);
    return {overflow:document.documentElement.scrollWidth>innerWidth,
      columns:getComputedStyle(cards).gridTemplateColumns.split(' ').length,
      dark:css.backgroundImage.includes('gradient'),photoHeight:root.querySelector('.company-activity-photo img').getBoundingClientRect().height,
      sourceLinks:[...root.querySelectorAll('a')].every(x=>x.getAttribute('rel')?.includes('noopener')&&x.getAttribute('target')==='_blank')};
   });
   assert.equal(state.overflow,false,'Codex must not overflow horizontally');
   assert(state.dark&&state.photoHeight>=200);
   assert(state.sourceLinks,'All source links retain external-link protections');
   assert.equal(state.columns,viewport.width<=520?1:2);
   // Re-render as an ordinary newly listed stock without optional supporting facts.
   await page.evaluate(()=>window.mountCompany('NVDA',{
    name:'Another Public Company',description:'Publicly sourced description is pending.',
    operations:'A independently sourced operating breakdown has not been confirmed.',
    sourceNote:'Public source availability is limited.',links:[]
   }));
   assert.equal(await page.locator('#company-profile .codex-title').count(),1);
   assert.equal(await page.locator('#company-profile .codex-insight').count(),4);
   assert.equal(await page.locator('#company-profile .company-activity-photo').count(),0);
   assert.equal(await page.locator('#company-profile .codex-photo-fallback').count(),1);
   assert.match(await page.locator('#company-profile .codex-insight').nth(1).innerText(),/capabilities and verified operating facts/i);
   assert.match(await page.locator('#company-profile .codex-insight').nth(3).innerText(),/not yet been published/i);
   assert.equal(await page.locator('#company-profile .codex-dossier').count(),0);
   assert.match(await page.locator('#company-profile .codex-source-footer').innerText(),/Verified company links are not yet available/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.deepEqual(errors,[]);
   console.log('PASS Company Codex '+viewport.width+'x'+viewport.height+': source attribution, interactive chapters, monthly cache, history, sparse fallback, safe links, responsive geometry');
   await ctx.close();
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
