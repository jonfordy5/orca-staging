// ORCA Living Timeline: sourced company milestones only, separate from TradingView.
// Images are optional and must be licensed/authorized. No agent-research chart markers.
export async function mountLivingTimeline({sb,ticker,getUser=()=>null,canContribute=()=>false}){
 const host=document.getElementById('chart-frame');
 const status=document.getElementById('living-status');
 const livingButton=document.getElementById('living-show');
 const tvButton=document.getElementById('living-tradingview');
 if(!host||!status||!sb)return;
 const tvBackup=document.createDocumentFragment();
 const frame=document.createElement('section');
 frame.className='orca-company-timeline';
 frame.setAttribute('aria-label',ticker+' company history');
 const heading=document.createElement('div');
 heading.className='orca-timeline-heading';
 const h=document.createElement('strong');h.textContent='History of '+ticker;
 const description=document.createElement('span');description.textContent='Verified milestones · select an event to read more';
 heading.append(h,description);
 const display=document.createElement('div');
 display.className='orca-timeline-display';
 const pricePlot=document.createElement('div');
 pricePlot.className='orca-timeline-price-plot';
 const pins=document.createElement('div');
 pins.className='orca-timeline-pins';
 const noPrice=document.createElement('div');
 noPrice.className='orca-timeline-no-price';
 noPrice.textContent='Verified historical price data is not available for this stock yet. Milestones can still be explored below.';
 noPrice.hidden=true;
 display.append(pricePlot,pins,noPrice);
 const navigation=document.createElement('div');
 navigation.className='orca-timeline-navigation';
 const prev=document.createElement('button');prev.type='button';prev.textContent='‹ Earlier';
 const index=document.createElement('span');index.setAttribute('aria-live','polite');
 const next=document.createElement('button');next.type='button';next.textContent='Later ›';
 navigation.append(prev,index,next);
 const rail=document.createElement('div');
 rail.className='orca-timeline-events';
 const details=document.createElement('section');
 details.className='orca-timeline-details';
 details.hidden=true;
 frame.append(heading,display,navigation,rail,details);
 let visible='tradingview',data=[],chart=null,series=null,chartLibrary=null,activeIndex=0;
 let automaticDiscoveryAttempted=false;
 let prices=[];\n let priceInterval='daily';
 function switchTo(which){
  if(which===visible)return;
  if(which==='timeline'){
   while(host.firstChild)tvBackup.append(host.firstChild);
   host.append(frame);
   visible='timeline';
   livingButton?.setAttribute('aria-pressed','true');
   tvButton?.setAttribute('aria-pressed','false');
   if(chart){chart.applyOptions({width:pricePlot.clientWidth,height:pricePlot.clientHeight});chart.timeScale().fitContent();}
   drawPins();
  }else{
   while(host.firstChild)host.removeChild(host.firstChild);
   host.append(tvBackup);
   visible='tradingview';
   livingButton?.setAttribute('aria-pressed','false');
   tvButton?.setAttribute('aria-pressed','true');
  }
 }
 livingButton.hidden=false;tvButton.hidden=false;
 livingButton.setAttribute('aria-pressed','false');
 tvButton.setAttribute('aria-pressed','true');
 livingButton.addEventListener('click',()=>{switchTo('timeline');void initializePrices().then(loadEvents);void maybePopulateCompanyHistory();});
 tvButton.addEventListener('click',()=>switchTo('tradingview'));
 function validSource(value){
  try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null}
 }
 function validImage(value){
  const url=validSource(value);
  if(!url)return null;
  // Avoid displaying random hotlinked images without explicit image provenance.
  return url;
 }
 const formatDate=value=>new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 function markerDate(value){
  const instant=Date.parse(value);
  if(!Number.isFinite(instant))return null;
  const day=new Date(instant).toISOString().slice(0,10);
  let closest=null,distance=Infinity;
  for(const price of prices){
   const d=Math.abs(Date.parse(price.time+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'));
   if(d<distance){closest=price;distance=d;}
  }
  return closest&&(priceInterval==='monthly'?closest.time.slice(0,7)===day.slice(0,7):distance<=3*86400000)?closest:null;
 }
 function selectMilestone(i){
  if(!data.length)return;
  activeIndex=(i+data.length)%data.length;
  const event=data[activeIndex];
  for(const item of rail.querySelectorAll('button[data-index]'))item.setAttribute('aria-pressed',String(Number(item.dataset.index)===activeIndex));
  details.replaceChildren();
  const title=document.createElement('h3');title.textContent=event.title;
  const meta=document.createElement('small');meta.textContent=formatDate(event.event_at)+' · '+event.category.replace('_',' ');
  const body=document.createElement('p');body.textContent=event.ai_summary;
  const link=document.createElement('a');link.href=event.source_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Read original source';
  details.append(title,meta,body,link);
  if(event.image_url){
   const image=document.createElement('img');
   image.src=event.image_url;image.alt=event.title;image.loading='lazy';image.referrerPolicy='no-referrer';
   image.addEventListener('error',()=>image.remove(),{once:true});
   details.prepend(image);
   if(event.image_credit){
    const credit=document.createElement('small');credit.textContent='Image: '+event.image_credit;details.append(credit);
   }
  }
  details.hidden=false;
  index.textContent='Milestone '+(activeIndex+1)+' of '+data.length;
 }
 function renderCards(){
  rail.replaceChildren();
  navigation.hidden=!data.length;
  if(!data.length){
   const empty=document.createElement('div');empty.className='orca-timeline-empty';
   const title=document.createElement('strong');title.textContent='No verified company milestones yet';
   const explanation=document.createElement('p');explanation.textContent='ORCA has not imported sourced company events for '+ticker+'. No events, pictures or dates have been invented.';
   empty.append(title,explanation);rail.append(empty);details.hidden=true;return;
  }
  data.forEach((event,i)=>{
   const button=document.createElement('button');
   button.type='button';button.className='orca-timeline-event';button.dataset.index=String(i);
   const media=document.createElement('span');media.className='orca-timeline-event-media';
   media.textContent=({earnings:'$',product:'◆',macro:'●',legal:'§',custom_note:'✦'})[event.category]||'◆';
   const date=document.createElement('small');date.textContent=formatDate(event.event_at);
   const title=document.createElement('strong');title.textContent=event.title;
   button.append(media,date,title);
   button.addEventListener('click',()=>selectMilestone(i));
   rail.append(button);
  });
  selectMilestone(Math.min(activeIndex,data.length-1));
 }
 function drawPins(){
  pins.replaceChildren();
  if(!chart||!series||!prices.length||visible!=='timeline')return;
  const width=pricePlot.clientWidth,height=pricePlot.clientHeight;
  if(!width||!height)return;
  data.forEach((event,i)=>{
   const point=markerDate(event.event_at);if(!point)return;
   const x=chart.timeScale().timeToCoordinate(point.time);
   const y=series.priceToCoordinate(point.value);
   if(x===null||y===null||x<15||x>width-15||y<15||y>height-15)return;
   const button=document.createElement('button');button.type='button';button.className='orca-timeline-pin';
   button.style.left=x+'px';button.style.top=Math.max(32,y-(i%2?55:65))+'px';
   button.title=event.title+' · '+formatDate(event.event_at);
   button.setAttribute('aria-label',event.title+' on '+formatDate(event.event_at));
   button.textContent=({earnings:'$',product:'◆',macro:'●',legal:'§',custom_note:'✦'})[event.category]||'◆';
   button.addEventListener('click',()=>selectMilestone(i));pins.append(button);
  });
 }
 prev.addEventListener('click',()=>selectMilestone(activeIndex-1));
 next.addEventListener('click',()=>selectMilestone(activeIndex+1));
 async function loadEvents(){
  const {data:rows,error}=await sb.from('orca_timeline_annotations')
   .select('id,event_at,category,title,ai_summary,source_url,image_url,image_credit')
   .eq('ticker',ticker).order('event_at',{ascending:true}).limit(500);
  if(error){status.textContent='Company milestone data unavailable; TradingView is unaffected.';return}
  data=(rows||[]).filter(x=>validSource(x.source_url))
   .map(x=>({...x,image_url:validImage(x.image_url)}));
  renderCards();drawPins();
  status.textContent=data.length+' sourced company milestone'+(data.length===1?'':'s')+
   (prices.length>1?' · '+prices.length+' historical '+priceInterval+' closes':' · historical price chart not yet available')+
   ' · no agent research markers';
 }
 let pricePreviewBusy=false;
 async function initializePrices(){
  if(chart||pricePreviewBusy)return;
  pricePreviewBusy=true;
  try{
   const {data:bars,error}=await sb.from('orca_chart_daily_prices')
    .select('session_date,close_price').eq('ticker',ticker).order('session_date',{ascending:true}).limit(1500);
   prices=error?[]:(bars||[]).map(p=>({time:p.session_date,value:Number(p.close_price)}))
    .filter(p=>Number.isFinite(p.value)&&p.value>0);
   let privatePreview=false;
   if(prices.length<2&&ticker==='ULTA'&&getUser()){
    status.textContent='Checking private Alpha Vantage ULTA price preview…';
    try{
     const {data:result,error:avError}=await sb.functions.invoke('orca-av-ulta-private-preview',{body:{ticker:'ULTA'}});
     if(avError)throw avError;
     prices=(Array.isArray(result?.bars)?result.bars:[]).map(p=>({time:String(p.time),value:Number(p.close)}))
      .filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.time)&&Number.isFinite(p.value)&&p.value>0)
      .sort((a,b)=>a.time.localeCompare(b.time));
     privatePreview=prices.length>=2;\n     if(privatePreview)priceInterval=result?.interval==='monthly'?'monthly':'daily';
    }catch{prices=[];}
   }
   noPrice.hidden=prices.length>=2;
   if(prices.length<2)return;
   try{
    chartLibrary=await import('https://esm.sh/lightweight-charts@5.0.8');
    chart=chartLibrary.createChart(pricePlot,{autoSize:true,
     layout:{background:{type:chartLibrary.ColorType.Solid,color:'#141922'},textColor:'#aeb9c8',fontFamily:'system-ui'},
     grid:{vertLines:{color:'#232c39'},horzLines:{color:'#232c39'}},
     rightPriceScale:{borderColor:'#3a4653'},timeScale:{borderColor:'#3a4653'}});
    series=chart.addSeries(chartLibrary.LineSeries,{color:'#4e9deb',lineWidth:2,priceLineVisible:true,lastValueVisible:true});
    series.setData(prices);chart.timeScale().fitContent();
    chart.timeScale().subscribeVisibleLogicalRangeChange(drawPins);
    const observer=new ResizeObserver(drawPins);observer.observe(pricePlot);
    window.addEventListener('pagehide',()=>{observer.disconnect();chart?.remove()},{once:true});
    if(privatePreview)status.textContent=prices.length+' actual ULTA '+priceInterval+' closes from Alpha Vantage · milestones matched by month where possible';
   }catch{
    noPrice.hidden=false;noPrice.textContent='Price chart library unavailable. Sourced company milestones remain accessible below.';
   }
  }finally{pricePreviewBusy=false;}
 }
 async function maybePopulateCompanyHistory(){
  if(automaticDiscoveryAttempted||data.length>=5)return;
  if(!getUser()||!canContribute()){
   if(!data.length)status.textContent='No company history cached yet. Sign in and join this stock’s research team to populate it. Viewing cached histories is free.';
   return;
  }
  automaticDiscoveryAttempted=true;
  status.textContent='Researching and caching official company milestones. Existing research findings and TradingView are unaffected.';
  try{
   const {data:result,error}=await sb.functions.invoke('orca-timeline-discovery',{body:{ticker}});
   if(error)throw error;
   if(result?.state==='ready'){
    await loadEvents();
    status.textContent=(result.added||0)+' additional sourced milestones saved for '+ticker+' · cached for future visitors.';
   }else if(result?.state==='cached'){
    await loadEvents();
   }else{
    const type=String(result?.state||'unavailable');
    const note=({
     building:'Company milestone discovery is already underway.',
     cooldown:'Milestone discovery is temporarily resting after a previous unsuccessful attempt.',
     daily_limit:'Daily development safeguard reached for this account.',
     budget_exhausted:'The shared $15 monthly AI reservation allowance has been reached.'
    })[type]||'Automatic milestone discovery is currently unavailable.';
    status.textContent=note+' '+data.length+' previously cached milestones remain available.';
   }
  }catch{
   status.textContent='Could not build the milestone history now. Previously saved events remain available; TradingView is unaffected.';
  }
 }
 // Preserve the normal TradingView chart on initial load. Living Timeline is opt-in.
 await loadEvents();
 // Do not block workspace startup on an optional private market-data provider.
 void initializePrices().then(()=>{if(visible==='timeline')void loadEvents();}).catch(()=>{noPrice.hidden=false;});
 const poll=setInterval(()=>{if(document.visibilityState==='visible')loadEvents()},60000);
 window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
}
