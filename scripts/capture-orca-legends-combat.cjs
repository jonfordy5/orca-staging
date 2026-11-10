const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.CAPTURE_DIR || path.join(root, 'work/wo-01-capture'));
fs.mkdirSync(output,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
 const frozen=process.env.CAPTURE_SOURCE_ROOT&&path.join(process.env.CAPTURE_SOURCE_ROOT,path.relative(root,file));
 fs.readFile(frozen&&fs.existsSync(frozen)?frozen:file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(err?'Not found':data);});
});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{}),headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[];
 const results={label:process.env.CAPTURE_LABEL||'baseline',viewport:{width:960,height:640},renderer:'Chromium --use-angle=swiftshader (software WebGL)',samples:[]};
 async function open(quality,reducedMotion){
  const page=await browser.newPage({viewport:results.viewport});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(s=>localStorage.setItem('orca-legends-settings',JSON.stringify(s)),{quality,reducedMotion,volume:0});
  await page.goto(`http://127.0.0.1:${server.address().port}/orca-legends-game.html?test=1`);
  await page.waitForFunction(()=>window.__ORCA_TEST__,null,{timeout:90000});
  await page.locator('#start-button').click();
  return page;
 }
 // Real RAF sampling: warm up one second, then fight for four seconds.
 for(const [quality,reducedMotion] of (process.env.CAPTURE_STILLS_ONLY?[]:[['high',false],['low',true]])){
  const page=await open(quality,reducedMotion);
  await page.waitForTimeout(1000);
  const sample=await page.evaluate(async()=>{
   const test=window.__ORCA_TEST__;test.position(0,5.8);
   const intervals=[];let last=performance.now(),start=last,attack=0;
   const schedule=[[0,'heavy'],[1100,'light'],[1800,'heavy'],[2900,'light']];
   return await new Promise(resolve=>{
    function frame(now){
     intervals.push(now-last);last=now;
     if(attack<schedule.length&&now-start>=schedule[attack][0])test.action(schedule[attack++][1]);
     if(now-start<4000)requestAnimationFrame(frame);
     else {
      const sorted=[...intervals].sort((a,b)=>a-b);
      resolve({elapsedMs:now-start,frames:intervals.length,meanFrameMs:intervals.reduce((a,b)=>a+b,0)/intervals.length,p50FrameMs:sorted[Math.floor(sorted.length*.5)],p95FrameMs:sorted[Math.floor(sorted.length*.95)],snapshot:test.snapshot()});
     }
    }
    requestAnimationFrame(frame);
   });
  });
  results.samples.push({quality,reducedMotion,...sample});
  await page.close();
 }
 for(const kind of ['light','heavy','parry']){
  const page=await open('high',false);
  await page.evaluate(()=>{window.__ORCA_TEST__.manualClock();window.__ORCA_TEST__.step(.85);window.__ORCA_TEST__.position(0,5.8);});
  if(kind==='parry'){
   await page.keyboard.down('KeyQ');
   await page.evaluate(()=>{window.__ORCA_TEST__.step(.03);window.__ORCA_TEST__.enemyHit(23);window.__ORCA_TEST__.step(.05);window.__ORCA_TEST__.render();});
   await page.keyboard.up('KeyQ');
  }else{
   await page.evaluate(kind=>{window.__ORCA_TEST__.action(kind);window.__ORCA_TEST__.step(kind==='light'?.25:.52);window.__ORCA_TEST__.render();},kind);
  }
  await page.screenshot({path:path.join(output,kind==='parry'?'parry.png':kind+'-impact.png')});
  await page.close();
 }
 results.errors=errors;
 if(!process.env.CAPTURE_STILLS_ONLY)fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.close();});
