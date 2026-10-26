// ORCA Living Timeline — staging-only, immutable sourced data.
// Minimal public interface: chart markers + sourced micro-popups, double-click to add a team note.
export async function mountLivingTimeline({sb,ticker,getUser,canContribute}){
 const host=document.getElementById('chart-frame');
 const status=document.getElementById('living-status');
 if(!host||!status||!sb)return;
 const {data:bars,error:barsError}=await sb.from('orca_chart_daily_prices')
   .select('session_date,close_price,source_name').eq('ticker',ticker).order('session_date',{ascending:true}).limit(800);
 if(barsError||!bars||bars.length<2){status.textContent='Timeline price data unavailable. TradingView chart remains accessible.';return;}
 const prices=bars.map(b=>({time:b.session_date,value:Number(b.close_price)})).filter(b=>Number.isFinite(b.value)&&b.value>0);
 if(prices.length<2){status.textContent='No usable verified price candles.';return;}
 let lib;
 try{lib=await import('https://esm.sh/lightweight-charts@5.0.8');}
 catch(e){status.textContent='Chart library unavailable; use TradingView instead.';return;}
 const chartArea=document.createElement('div');chartArea.className='living-chart-area';
 const plot=document.createElement('div');plot.className='living-plot';
 const layer=document.createElement('div');layer.className='living-marker-layer';
 const popup=document.createElement('div');popup.className='living-popup';popup.hidden=true;
 const panel=document.createElement('form');panel.className='living-note-form';panel.hidden=true;
 panel.innerHTML='<strong>Add a dated research note</strong><p class="mini">Public to your research team and visitors. Source URL required. No private information.</p><label>Event date<input name="date" type="date" required></label><label>Title<input name="title" maxlength="100" minlength="4" required></label><label>Investment rationale<textarea name="summary" minlength="20" maxlength="500" required></textarea></label><label>Public evidence URL<input name="source" type="url" maxlength="500" required></label><div class="actions"><button class="btn" type="submit">Publish note</button><button class="btn alt" type="button" data-cancel>Cancel</button></div><p class="mini" data-message role="status"></p>';
 chartArea.append(plot,layer,popup,panel);
 const old=[...host.childNodes];host.replaceChildren(chartArea);
 const backup=document.createDocumentFragment();old.forEach(node=>backup.append(node));
 const tvButton=document.getElementById('living-tradingview');
 const livingButton=document.getElementById('living-show');
 if(tvButton)tvButton.hidden=false;if(livingButton)livingButton.hidden=false;
 const chart=lib.createChart(plot,{autoSize:true,layout:{background:{type:lib.ColorType.Solid,color:'#132029'},textColor:'#afc1c7',fontFamily:'system-ui'},grid:{vertLines:{color:'#253540'},horzLines:{color:'#253540'}},rightPriceScale:{borderColor:'#34505d'},timeScale:{borderColor:'#34505d',timeVisible:false}});
 const series=chart.addSeries(lib.LineSeries,{color:'#93b7c7',lineWidth:2,priceLineVisible:false,lastValueVisible:true,crosshairMarkerVisible:true});
 series.setData(prices);chart.timeScale().fitContent();
 const nativeMarkers=lib.createSeriesMarkers(series,[]);
 let records=[],selected=null,active='living';
 function closest(date){const t=Date.parse(date+'T00:00:00Z');let best=prices[0],distance=Infinity;
  for(const p of prices){const d=Math.abs(Date.parse(p.time+'T00:00:00Z')-t);if(d<distance){best=p;distance=d;}}return {point:best,distance};}
 function validDate(s){const t=Date.parse(s);return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):null;}
 function eventDate(item){return validDate(item.timestamp);}
 function parseRow(row){return {id:String(row.id),timestamp:String(row.event_at),category:row.category,title:String(row.title),aiSummary:String(row.ai_summary),sourceUrl:String(row.source_url)};}
 async function load(){
  const {data,error}=await sb.from('orca_timeline_annotations').select('id,event_at,category,title,ai_summary,source_url').eq('ticker',ticker).order('event_at',{ascending:true}).limit(500);
  if(error){status.textContent='Annotations unavailable; prices remain visible.';return;}
  records=(data||[]).map(parseRow);
  const dots=records.map(record=>{
   const date=eventDate(record);if(!date)return null;
   const mapping=closest(date);if(mapping.distance>3*86400000)return null;
   return {id:record.id,time:mapping.point.time,position:'aboveBar',color:colors[record.category]||colors.custom_note,shape:'circle',size:1.5};
  }).filter(Boolean).sort((x,y)=>x.time.localeCompare(y.time));
  nativeMarkers.setMarkers(dots);
  draw();status.textContent=prices.length+' daily closing prices · '+records.length+' sourced timeline notes · historical snapshot (not live)';
 }
 const colors={earnings:'#328c73',product:'#638dc1',macro:'#ad6066',legal:'#ac5964',custom_note:'#a78bcb'};
 function closePopup(){popup.hidden=true;selected=null;}
 function showPopup(item,button){
  popup.replaceChildren();
  const title=document.createElement('strong');title.textContent=item.title;
  const summary=document.createElement('p');summary.textContent=item.aiSummary;
  const meta=document.createElement('small');meta.textContent=new Date(item.timestamp).toLocaleDateString()+' · '+item.category.replace('_',' ');
  const link=document.createElement('a');link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Primary source';
  popup.append(title,summary,meta,link);popup.hidden=false;selected=item.id;
  const r=button.getBoundingClientRect(),parent=chartArea.getBoundingClientRect();
  const width=Math.min(280,parent.width-16);
  popup.style.width=width+'px';popup.style.left=Math.max(8,Math.min(parent.width-width-8,r.left-parent.left-100))+'px';
  popup.style.top=Math.max(8,Math.min(parent.height-145,r.top-parent.top-145))+'px';
 }
 function draw(){
  layer.replaceChildren();if(active!=='living')return;
  const width=plot.clientWidth,height=plot.clientHeight;
  if(!width||!height)return;
  for(const item of records){
   const d=eventDate(item);if(!d)continue;
   const match=closest(d);
   // Important: never misleadingly shift a weekend/old event a week or more. Mark only <= 3 calendar days.
   if(match.distance>3*86400000)continue;
   const x=chart.timeScale().timeToCoordinate(match.point.time),y=series.priceToCoordinate(match.point.value);
   if(x===null||y===null||x<8||x>width-8||y<8||y>height-8)continue;
   const b=document.createElement('button');b.type='button';b.className='living-event-marker';
   b.style.left=x+'px';b.style.top=Math.max(12,y-17)+'px';b.style.background=colors[item.category]||colors.custom_note;
   b.textContent='•';b.title=item.title;b.setAttribute('aria-label',item.title+' on '+d);
   b.addEventListener('click',e=>{e.stopPropagation();showPopup(item,b);});
   b.addEventListener('mouseenter',()=>showPopup(item,b));
   layer.append(b);
  }
  if(selected){const item=records.find(r=>r.id===selected);const button=[...layer.children].find(b=>b.title===item?.title);if(item&&button)showPopup(item,button);else closePopup();}
 }
 chart.timeScale().subscribeVisibleLogicalRangeChange(draw);
 const obs=new ResizeObserver(draw);obs.observe(plot);
 function switchChart(which){
  active=which;closePopup();panel.hidden=true;
  if(which==='tradingview'){
   host.replaceChildren(backup);tvButton?.setAttribute('aria-pressed','true');livingButton?.setAttribute('aria-pressed','false');
  }else{
   while(host.firstChild)backup.append(host.firstChild);
   host.replaceChildren(chartArea);livingButton?.setAttribute('aria-pressed','true');tvButton?.setAttribute('aria-pressed','false');chart.applyOptions({width:plot.clientWidth,height:plot.clientHeight});draw();
  }
 }
 tvButton?.addEventListener('click',()=>switchChart('tradingview'));
 livingButton?.addEventListener('click',()=>switchChart('living'));
 chartArea.addEventListener('click',e=>{if(!e.target.closest('.living-event-marker,.living-popup,.living-note-form'))closePopup();});
 chartArea.addEventListener('dblclick',async e=>{
  if(e.target.closest('.living-popup,.living-note-form'))return;
  if(!getUser()||!canContribute()){status.textContent='Sign in, join this stock team, and enable research permission to add a note.';return;}
  const rect=plot.getBoundingClientRect(),x=e.clientX-rect.left;
  const pointDate=chart.timeScale().coordinateToTime(x);
  if(!pointDate)return;
  const date=typeof pointDate==='string'?pointDate:String(pointDate.year)+'-'+String(pointDate.month).padStart(2,'0')+'-'+String(pointDate.day).padStart(2,'0');
  panel.elements.namedItem('date').value=closest(date).point.time;panel.hidden=false;closePopup();panel.querySelector('[name=title]').focus();
 });
 panel.querySelector('[data-cancel]').addEventListener('click',()=>panel.hidden=true);
 panel.addEventListener('submit',async e=>{
  e.preventDefault();const message=panel.querySelector('[data-message]');
  if(!getUser()||!canContribute()){message.textContent='Research permission required.';return;}
  const date=panel.elements.namedItem('date').value;
  if(!prices.some(p=>p.time===date)){message.textContent='Choose an available trading session in this historical chart.';return;}
  const payload={ticker,event_at:date+'T16:00:00Z',category:'custom_note',title:panel.elements.namedItem('title').value.trim(),
    ai_summary:panel.elements.namedItem('summary').value.trim(),source_url:panel.elements.namedItem('source').value.trim(),created_by:getUser().id};
  message.textContent='Publishing…';
  const {error}=await sb.from('orca_timeline_annotations').insert(payload);
  if(error){message.textContent='Publication failed: '+error.message;return;}
  panel.reset();panel.hidden=true;await load();
 });
 await load();
 const channel=sb.channel('orca-annotations-'+ticker).on('postgres_changes',{event:'INSERT',schema:'public',table:'orca_timeline_annotations'},()=>load()).subscribe();
 // Even without Realtime publication enrollment, pull fresh records every 25 seconds when tab is visible.
 const poll=setInterval(()=>{if(document.visibilityState==='visible')load();},25000);
 window.addEventListener('pagehide',()=>{clearInterval(poll);obs.disconnect();sb.removeChannel(channel);},{once:true});
}