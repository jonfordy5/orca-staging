// Exercise actual Council HTML/CSS and render functions in isolated Chromium.
// No Supabase, external quotes, real owner sessions, AI calls or database writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'research-workspace.html'),'utf8');
function part(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+1);if(a<0||b<a)throw Error('Missing Council source: '+start);return source.slice(a,b)}
const css=part('<style>','</style>').replace('<style>','');
const html=part('<section class="card orca-council"','<section class="card" id="collective-research-dashboard"');
const balance=part('function renderOutlookBalance(view){','function researchDirectionalLean(');
const renderer=part('function renderOutlooks(){','async function loadResearchRatingTrack(){');
const question=part('function questionForFinding(f){','function plainResearchText(');
const plain=part('function plainResearchText(text){','function plainSummaryParts(');
const recent=part('function recentFirst(items,field){','function keepOpen(');
const helpers=part('function folded(title,items,key,css=','const investorQuestions=');
const fixture=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main>${html}</main>
<script type="module">
import { selectCouncilEvidence,councilLeadLabel } from '/orca-council.js';
import {metricDisplayText} from '/orca-metric-labels.js';
const $=id=>document.getElementById(id);
const time=t=>{const d=new Date(t);return isNaN(d)?'not provided':d.toLocaleString()};
const safeLink=x=>{try{const u=new URL(x);return u.protocol==='https:'||u.protocol==='http:'?u.href:null}catch{return null}};
${question}
${plain}
${recent}
${helpers}
const renderFinding=f=>{const div=document.createElement('div');div.className='finding';div.textContent=f.summary;sourceFold(div,f.source_urls,'archive:'+f.id);return div};
const compactFinding=renderFinding;
let findings=[],cumulativeResearchStatus=null,cachedMajoritySummaries=[];
${balance}
${renderer}
window.drawCouncil=(data,total,summaries=[])=>{findings=data;cumulativeResearchStatus={total};cachedMajoritySummaries=summaries;renderOutlooks()};
window.councilReady=true;
</script></body></html>`;
const stamp=(millis)=>new Date(Date.now()+millis).toISOString();
const f=(id,side,area='News & Market Sentiment',age=3600000)=>({
 id,task_id:'task-'+id,research_area:area,contributor_alias:'Researcher '+id,
 summary:`[ORCA-R4;Q:execution;A:${side==='bullish'?'BUY':'SELL'};D:${side.toUpperCase()}] ${side==='bullish'?'Launch contracts and revenue outlook':'Launch delays and cash pressure'} are material to this thesis.`,
 observed_at:stamp(-age),published_at:stamp(-Math.max(1000,age-120000)),
 expires_at:stamp(7*86400000),source_urls:['https://example.org/research/'+id],limitations:'Forecast depends on launch timing'
});
async function main(){
 const server=http.createServer((req,res)=>{
  const uri=new URL(req.url,'http://localhost').pathname;
  if(uri==='/'){res.setHeader('Content-Type','text/html');return res.end(fixture)}
  if(['/orca-council.js','/orca-metric-labels.js'].includes(uri)){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,uri)))}
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const host='http://127.0.0.1:'+server.address().port;
  for(const width of [1440,393,320]){
   const ctx=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
   const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(host);await page.waitForFunction(()=>window.councilReady);
   await page.evaluate(args=>window.drawCouncil(args.rows,42,args.summaries),{
    rows:[f('a','bullish'),f('b','bearish'),f('c','bullish','Fundamentals & Valuation',86400000)],
    summaries:[{side:'bullish',summary:'OLD CACHED MAJORITY — must not appear in current cards',generated_at:stamp(-86400000),evidence_links:['https://example.org/old']}]
   });
   assert.match(await page.locator('#outlook-average-score').innerText(),/leans bullish/);
   assert.equal(await page.locator('.council-thesis').count(),2);
   assert.match(await page.locator('.council-thesis').first().innerText(),/CHAMPION THESIS/);
   assert.match(await page.locator('.council-thesis').last().innerText(),/CHALLENGER THESIS/);
   assert.doesNotMatch(await page.locator('#outlook-grid').innerText(),/OLD CACHED MAJORITY/);
   assert.equal(await page.locator('#outlook-grid .council-thesis > .source-fold a').count(),2);
   await page.locator('#council-archive summary').first().click();
   assert.match(await page.locator('#council-archive').innerText(),/42 published research searches recorded across all ORCA rounds/);
   await page.locator('#council-archive .history-fold > summary').last().click();
   assert.match(await page.locator('#council-archive').innerText(),/OLD CACHED MAJORITY/);
   const measured=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth>innerWidth,
    columns:getComputedStyle(document.querySelector('#outlook-grid')).gridTemplateColumns.split(' ').length,
    bg:getComputedStyle(document.querySelector('.orca-council')).backgroundImage
   }));
   assert.equal(measured.overflow,false,'Council has no horizontal overflow');
   assert.match(measured.bg,/gradient/);
   if(width>760)assert.equal(measured.columns,2);
   else assert.equal(measured.columns,1);
   const stale=f('old','bearish','News & Market Sentiment',6*86400000);
   await page.evaluate(rows=>window.drawCouncil(rows,99),[f('fresh','bullish'),stale]);
   assert.match(await page.locator('.council-thesis').last().innerText(),/No recent bearish research/);
   assert.equal(await page.locator('#outlook-bear-count').innerText(),'0 Bearish');
   assert.doesNotMatch(await page.locator('#outlook-grid').innerText(),/cash pressure/);
   assert.match(await page.locator('#council-archive').innerText(),/earlier or superseded findings/);
   await page.evaluate(()=>window.drawCouncil([],4));
   assert.match(await page.locator('#outlook-average-score').innerText(),/Fresh research needed/);
   assert.match(await page.locator('#outlook-grid').innerText(),/ORCA will not invent/);
   assert.deepEqual(errors,[]);
   console.log('PASS Council '+width+'px: evidence integrity, dated challenges, archive, responsive columns and safe empty state');
   await ctx.close();
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(err=>{console.error(err);process.exitCode=1});
