// Actual shared market markup, CSS and widget factories; local empty timeline.
// TradingView requests are intercepted. No Supabase client, live data or paid calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const workspace=fs.readFileSync(path.join(root,'research-workspace.html'),'utf8');
const css=workspace.match(/<style>([\s\S]*?)<\/style>/)[1];
const market=workspace.slice(workspace.indexOf('<section class="card" id="chart-section">'),workspace.indexOf('<section id="prediction-history"'));
const factories=workspace.slice(workspace.indexOf('function createMarketChart(){'),workspace.indexOf('let sb=null,user=null'));
const tickerSetup=workspace.slice(workspace.indexOf('const $=id=>'),workspace.indexOf('async function loadWorkspaceCompanyName(){'));
const fixture=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
<body><main>${market}</main><script type="module">
import {mountLivingTimeline} from './orca-living-timeline.js';
${tickerSetup}
${factories}
window.remountMarket=()=>{createMarketChart();createMarketQuote()};
window.remountMarket();
const sb={from(){const q={select(){return q},eq(){return q},is(){return q},order(){return q},range(){return Promise.resolve({data:[]})}};return q},
 functions:{invoke(){throw Error('No research or photo calls allowed')}}};
await mountLivingTimeline({sb,ticker});window.fixtureReady=true;
</script></body></html>`;

async function main(){
 const server=http.createServer((req,res)=>{
  const file=new URL(req.url,'http://localhost').pathname;
  if(file==='/'){res.setHeader('Content-Type','text/html');return res.end(fixture)}
  if(['/orca-living-timeline.js','/orca-timeline-photos.js'].includes(file)){
   res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,file)));
  }
  if(/^\/assets\/orca-world-(management|earnings|positioning)\.webp$/.test(file)){
   res.setHeader('Content-Type','image/webp');return res.end(fs.readFileSync(path.join(root,file)));
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  for(const viewport of [{width:1440,height:1000},{width:393,height:851},{width:320,height:740}]){
   const context=await browser.newContext({viewport,reducedMotion:'reduce'}),page=await context.newPage();
   const external=[],errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.route('**/*',route=>{
    if(route.request().url().startsWith(origin+'/'))return route.continue();
    external.push(route.request().url());
    return route.fulfill({contentType:'text/javascript',body:'/* offline provider fixture */'});
   });
   for(const [ticker,chartSymbol,quoteSymbol] of [['RKLB','NASDAQ:RKLB','NASDAQ:RKLB'],['NVDA','NVDA','NASDAQ:NVDA'],['CVX','CVX','NYSE:CVX'],['BRK.B','BRK.B','BRK.B']]){
    await page.goto(origin+'/?ticker='+encodeURIComponent(ticker));
    await page.waitForFunction(()=>window.fixtureReady);
    for(let mount=0;mount<2;mount++){
     if(mount)await page.evaluate(()=>window.remountMarket());
     const config=await page.evaluate(()=>({
      chart:JSON.parse(document.querySelector('#chart-frame script').textContent),
      quote:JSON.parse(document.querySelector('#orca-current-quote script').textContent)
     }));
     assert.deepEqual(config.chart,{autosize:true,symbol:chartSymbol,interval:'D',timezone:'exchange',theme:'dark',style:'1',hide_top_toolbar:false,hide_side_toolbar:false,allow_symbol_change:true,hide_volume:false,withdateranges:true,locale:'en',save_image:false,support_host:'https://www.tradingview.com'});
     assert.deepEqual(config.quote,{symbol:quoteSymbol,width:'100%',locale:'en',colorTheme:'dark',isTransparent:true});
     assert.equal(await page.locator('#chart-frame script').count(),1);
     assert.equal(await page.locator('#orca-current-quote script').count(),1);
    }
    assert.equal(await page.locator('#chart-ticker').innerText(),ticker);
    const credit=page.getByRole('link',{name:'Stock quote by TradingView'});
    assert.equal(await credit.getAttribute('href'),'https://www.tradingview.com/symbols/'+encodeURIComponent(quoteSymbol.replace(':','-'))+'/');
    assert.equal(await credit.getAttribute('rel'),'noopener nofollow noreferrer');
    assert.equal(await credit.getAttribute('target'),'_blank');
    assert.equal(await page.getByLabel('Interactive historical stock chart powered by TradingView').count(),1);
    assert.equal(await page.getByLabel('TradingView stock price widget').count(),1);
    assert.match(await page.locator('.orca-quote-panel>p.mini').innerText(),/quotes may be delayed.*Quote and research outlook are independent/);
    await credit.focus();
    assert.equal(await credit.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    const layout=await page.evaluate(()=>{
     const chart=document.querySelector('#chart-frame'),timeline=document.querySelector('#timeline-frame');
     return {chart:chart.getBoundingClientRect().toJSON(),timeline:timeline.getBoundingClientRect().toJSON(),
      overflow:document.documentElement.scrollWidth>innerWidth,
      timelineVisible:getComputedStyle(timeline).display!=='none',
      realmFits:[...document.querySelectorAll('.orca-realm-art img')].every(el=>getComputedStyle(el).objectFit==='contain')};
    });
    assert.equal(layout.chart.height,Math.max(320,Math.min(viewport.width*.58,520)));
    assert(layout.timeline.top>=layout.chart.bottom,'Chart stays above independent visible timeline');
    assert(layout.timelineVisible);assert(layout.realmFits);assert(!layout.overflow);
    const presentation=await page.evaluate(()=>{
     const status=document.querySelector('#living-status');
     const rect=status.getBoundingClientRect();
     const disclosure=document.querySelector('#orca-agent-evidence-feed');
     const note=[...disclosure.querySelectorAll('p.mini')].find(p=>p.textContent.includes('Living Timeline shows sourced company milestones'));
     return {statusRole:status.getAttribute('role'),
      statusHiddenVisually:rect.width<=1&&rect.height<=1,
      noteInsideCollapsedDetails:!!note&&!disclosure.open,
      noteVisible:note?note.getClientRects().length>0:false};
    });
    assert.equal(presentation.statusRole,'status','Timeline status remains available to assistive technology');
    assert(presentation.statusHiddenVisually,'Verbose completion status no longer takes visual space');
    assert(presentation.noteInsideCollapsedDetails,'Source and TradingView disclosure remains accessible in collapsed details');
    assert.equal(presentation.noteVisible,false,'Disclosure must not obscure the line');

    // The ambient-dust hover state gets a small amount of vertical breathing room.
    if(viewport.width>700)assert.equal(layout.timeline.height,332);
   }
   await page.goto(origin+'/?ticker='+encodeURIComponent('<invalid>'));
   await page.waitForFunction(()=>window.fixtureReady);
   assert.equal(await page.locator('#chart-frame script,#orca-current-quote script').count(),0);
   assert.match(await page.locator('#chart-frame').innerText(),/valid stock ticker is required/);
   assert.equal(await page.locator('#orca-current-quote').innerText(),'Stock symbol unavailable.');
   assert(external.length>0);
   assert(external.every(url=>/^https:\/\/s3\.tradingview\.com\/external-embedding\/embed-widget-(advanced-chart|symbol-info)\.js$/.test(url)),'Only existing TradingView embeds may request external resources');
   assert.deepEqual(errors,[]);
   console.log('PASS market widgets '+viewport.width+'×'+viewport.height+': dark configs, capabilities, symbols, remount, invalid ticker, credits, keyboard and stacked layout');
   await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(error=>{console.error(error);process.exitCode=1});
