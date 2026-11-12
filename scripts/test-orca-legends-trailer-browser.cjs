// ORCA Legends trailer entrance: verify opt-in playback, accessibility,
// responsive poster, no page-load sound or gameplay, and safe close behavior.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ORCA_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const server=http.createServer((req,res)=>{
 const uri=new URL(req.url,'http://localhost').pathname;
 if(uri==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
 const name=uri.slice(1);
 if(['orca-commons-theme.css','orca-commons-home.css','orca-stock-search.css','orca-legends-trailer.js','orca-stock-search.js','orca-staging-config.js','assets/orca-legends-trailer-poster.svg','assets/poster.png','assets/orca-legends-fortress-of-gold.png'].includes(name)){
  const content=fs.readFileSync(path.join(root,name));
  res.setHeader('Content-Type',name.endsWith('.png')?'image/png':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.css')?'text/css':'application/javascript');
  res.end(content);return;
 }
 // Browser fixture blocks all actual video downloads: the play() call is
 // instrumented before module initialization to prevent media/range costs.
 if(name==='assets/ORCA_LEGENDS_Final_Mage_Battle_Web_720p.mp4'){
  res.writeHead(404);res.end();return;
 }
 res.writeHead(404);res.end();
});
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ORCA_CHROMIUM_PATH?{executablePath:process.env.ORCA_CHROMIUM_PATH}:{})});
  for(const width of [1440,393,320]){
   const ctx=await browser.newContext({viewport:{width,height:850},reducedMotion:'reduce'});
   const page=await ctx.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    window.__orcaPlayback={play:0,pause:0};
    HTMLMediaElement.prototype.play=function(){window.__orcaPlayback.play++;return Promise.resolve()};
    HTMLMediaElement.prototype.pause=function(){window.__orcaPlayback.pause++};
   });
   await page.route('https://esm.sh/**',route=>route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:`export function createClient(){return {from(){const q={select(){return q},order(){return q},limit(){return Promise.resolve({data:[],error:null})}};return q},auth:{getSession:async()=>({data:{session:null},error:null})}}}`}));
   await page.goto('http://127.0.0.1:'+server.address().port+'/');
   await page.locator('.legends-cinema-poster').scrollIntoViewIfNeeded();
   await page.locator('.legends-cinema-poster img').evaluate(el=>el.decode());
   assert.equal(await page.locator('.legends-cinema-poster img').evaluate(el=>el.naturalWidth>0),true,'poster must render');
   assert.match(await page.locator('.legends-cinema-poster img').getAttribute('src'),/orca-legends-fortress-of-gold\.png/);
   assert.match(await page.locator('#legends-trailer-video').getAttribute('poster'),/orca-legends-fortress-of-gold\.png/);
   const posterBox=await page.locator('.legends-cinema-poster').boundingBox();
   const cardBox=await page.locator('.legends-cinema-feature').boundingBox();
   assert(posterBox&&cardBox&&posterBox.x>=cardBox.x-1&&
     posterBox.x+posterBox.width<=cardBox.x+cardBox.width+1,
     'The poster must not overflow the ORCA Legends card at '+width+'px');
   if(width>850)assert(posterBox.width<=431,'Trailer poster must remain compact on desktop');
   assert.equal(await page.locator('#legends-trailer-dialog').isVisible(),false);
   assert.equal(await page.locator('#legends-trailer-video').getAttribute('autoplay'),null);
   assert.equal(await page.locator('#legends-trailer-video').getAttribute('preload'),'none');
   assert.match(await page.locator('#legends-trailer-video source').getAttribute('src'),/assets\/ORCA_LEGENDS_Final_Mage_Battle_Web_720p\.mp4/);
   assert.deepEqual(await page.evaluate(()=>window.__orcaPlayback),{play:0,pause:0},'no audio or video before click');
   const dimensions=await page.evaluate(()=>{
    const poster=document.querySelector('.legends-cinema-poster');
    return {overflow:document.documentElement.scrollWidth>innerWidth,ratio:poster.clientWidth/poster.clientHeight};
   });
   assert.equal(dimensions.overflow,false,'No horizontal overflow at '+width+'px');
   assert(Math.abs(dimensions.ratio-16/9)<.08,'Poster ratio is 16:9');
   await page.locator('#legends-trailer-poster').click();
   assert.equal(await page.locator('#legends-trailer-dialog').isVisible(),true);
   assert.equal(await page.evaluate(()=>window.__orcaPlayback.play),1);
   assert.equal(await page.locator('#legends-trailer-close').isVisible(),true);
   await page.locator('#legends-trailer-close').click();
   assert.equal(await page.locator('#legends-trailer-dialog').isVisible(),false);
   assert.equal(await page.evaluate(()=>window.__orcaPlayback.pause),1);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'legends-trailer-poster');
   await page.locator('#legends-trailer-play').click();
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#legends-trailer-dialog').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'legends-trailer-play');
   assert.equal(await page.locator('.legends-cinema-feature a[href="./guild-hall.html"]').count(),1);
   assert.equal(await page.locator('.legends-cinema-feature a[href="./orca-legends-game.html"]').count(),0,'No premature game launch from trailer teaser');
   assert.deepEqual(errors,[]);
   console.log('PASS ORCA Legends trailer '+width+'px: poster, opt-in playback, no autoplay, focus restore, disabled game access and layout');
   await ctx.close();
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
run().catch(err=>{console.error(err);process.exitCode=1});
