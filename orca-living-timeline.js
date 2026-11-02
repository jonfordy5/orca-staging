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
 const navigation=document.createElement('div');
 navigation.className='orca-timeline-navigation';
 const prev=document.createElement('button');prev.type='button';prev.textContent='‹';prev.setAttribute('aria-label','Jump to earliest event');prev.title='Earliest event';
 const index=document.createElement('span');index.setAttribute('aria-live','polite');
 const next=document.createElement('button');next.type='button';next.textContent='›';next.setAttribute('aria-label','Jump to latest event');next.title='Latest event';
 navigation.append(prev,index,next);
 const rail=document.createElement('div');
 rail.className='orca-timeline-events';
 const details=document.createElement('section');
 details.className='orca-timeline-details';
 details.hidden=true;
 const backdrop=document.createElement('div');
 backdrop.className='orca-history-backdrop';
 backdrop.hidden=true;
 backdrop.setAttribute('aria-hidden','true');
 frame.append(heading,navigation,rail,backdrop,details);
 details.classList.add('orca-history-popover');details.setAttribute('role','dialog');details.setAttribute('aria-label','Milestone details');details.setAttribute('tabindex','-1');
 let visible='tradingview',data=[],chart=null,series=null,chartLibrary=null,activeIndex=0;
 let automaticDiscoveryAttempted=false;
 let prices=[];
 let photoMount=null;
 function fitRailEdges(){
  const spine=rail.querySelector('.orca-history-spine');
  const stop=spine?.querySelector('.orca-history-stop');
  if(!spine||!stop||!rail.clientWidth)return;
  const padding=Math.max(30,Math.round((rail.clientWidth-stop.getBoundingClientRect().width)/2));
  spine.style.paddingLeft=padding+'px';
  spine.style.paddingRight=padding+'px';
 }
 function centerMilestone(element,behavior='smooth'){
  const stop=element?.closest('.orca-history-stop');
  if(!stop||!rail.clientWidth)return;
  fitRailEdges();
  const left=stop.offsetLeft+stop.offsetWidth/2-rail.clientWidth/2;
  rail.scrollTo({left:Math.max(0,left),behavior});
 }
 window.addEventListener('resize',()=>{
  if(visible==='timeline')fitRailEdges();
 });
 function switchTo(which){
  if(which===visible)return;
  if(which==='timeline'){
   while(host.firstChild)tvBackup.append(host.firstChild);
   host.append(frame);
   visible='timeline';
   requestAnimationFrame(()=>{fitRailEdges();if(rail.scrollLeft===0)centerMilestone(rail.querySelector('.orca-timeline-event[data-index="0"]'),'instant')});
   livingButton?.setAttribute('aria-pressed','true');
   tvButton?.setAttribute('aria-pressed','false');
   // History uses its own event spine; TradingView remains a separate chart mode.
  }else{
   while(host.firstChild)host.removeChild(host.firstChild);
   host.append(tvBackup);
   visible='tradingview';
   closeDetails();
   livingButton?.setAttribute('aria-pressed','false');
   tvButton?.setAttribute('aria-pressed','true');
  }
 }
 livingButton.hidden=false;tvButton.hidden=false;
 livingButton.setAttribute('aria-pressed','false');
 tvButton.setAttribute('aria-pressed','true');
 livingButton.addEventListener('click',()=>{switchTo('timeline');void maybePopulateCompanyHistory();});
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
 function closeDetails(){
  details.hidden=true;
  backdrop.hidden=true;
  details.setAttribute('aria-hidden','true');
 }
 function selectMilestone(i){
  if(!data.length)return;
  const nextIndex=(i+data.length)%data.length;
  if(!details.hidden&&activeIndex===nextIndex){closeDetails();return;}
  activeIndex=nextIndex;
  const event=data[activeIndex];
  for(const item of rail.querySelectorAll('button[data-index]'))item.setAttribute('aria-pressed',String(Number(item.dataset.index)===activeIndex));
  details.replaceChildren();
  const title=document.createElement('h3');title.textContent=event.title;
  const meta=document.createElement('small');meta.textContent=formatDate(event.event_at)+' · '+event.category.replace('_',' ');
  const body=document.createElement('p');body.textContent=event.ai_summary;
  const brief=event.quick_brief;
  const hasBrief=brief&&Array.isArray(brief.points)&&brief.points.length>=2&&typeof brief.why==='string';
  const points=document.createElement('ul');points.className='orca-brief-points';
  if(hasBrief){
   for(const point of brief.points.slice(0,2)){
    if(typeof point!=='string'||!point.trim())continue;
    const li=document.createElement('li');li.textContent=point;points.append(li);
   }
  }
  const takeaway=document.createElement('p');takeaway.className='orca-brief-takeaway';
  if(hasBrief)takeaway.textContent='Why it matters: '+brief.why;
  const link=document.createElement('a');link.href=event.source_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Read original source';
  details.append(title,meta,body);
  if(hasBrief){details.append(points,takeaway)}
  details.append(link);
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
  backdrop.hidden=false;
  details.removeAttribute('aria-hidden');
  index.textContent='Milestone '+(activeIndex+1)+' of '+data.length;
  const selected=rail.querySelector('.orca-timeline-event[data-index="'+activeIndex+'"]');
  if(selected){centerMilestone(selected);selected.focus({preventScroll:true});}
 }
 function renderCards(){
  rail.replaceChildren();
  closeDetails();
  navigation.hidden=!data.length;
  if(!data.length){
   const empty=document.createElement('div');empty.className='orca-timeline-empty';
   empty.textContent='No sourced company milestones have been published yet for '+ticker+'.';
   rail.append(empty);details.hidden=true;return;
  }
  const spine=document.createElement('div');spine.className='orca-history-spine';
  const icons={earnings:'$',product:'◆',macro:'●',legal:'§',custom_note:'✦'};
  data.forEach((event,i)=>{
   const stop=document.createElement('div');stop.className='orca-history-stop';
   const card=document.createElement('button');card.type='button';card.className='orca-timeline-event';
   card.dataset.index=String(i);card.dataset.eventId=event.id;card.setAttribute('aria-pressed',String(i===activeIndex));
   const icon=document.createElement('span');icon.className='orca-timeline-event-media';
   const fallbackIcon=icons[event.category]||'◆';
   icon.textContent=fallbackIcon;
   // Only use photo records with a source/credit; the database currently has none for ULTA.
   if(event.image_url&&event.image_credit){
    const photo=document.createElement('img');
    photo.src=event.image_url;photo.alt='';photo.loading='lazy';
    photo.referrerPolicy='no-referrer';
    photo.addEventListener('error',()=>{icon.classList.remove('orca-history-thumb');icon.replaceChildren(document.createTextNode(fallbackIcon));},{once:true});
    icon.classList.add('orca-history-thumb');
    icon.replaceChildren(photo);
   }
   const date=document.createElement('small');date.textContent=formatDate(event.event_at);
   const title=document.createElement('strong');title.textContent=event.title;
   const summary=document.createElement('span');summary.className='orca-history-teaser';
   summary.textContent=String(event.ai_summary||'').trim();
   card.setAttribute('aria-label',formatDate(event.event_at)+': '+event.title+'. Select to read sourced details.');
   card.append(icon,date,title,summary);
   const stem=document.createElement('span');stem.className='orca-history-stem';
   const dot=document.createElement('span');dot.className='orca-history-dot';
   const year=document.createElement('span');year.className='orca-history-year';
   year.textContent=String(new Date(event.event_at).getUTCFullYear());
   stop.append(card,stem,dot,year);
   card.addEventListener('click',()=>selectMilestone(i));
   stop.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();selectMilestone(Math.min(i+1,data.length-1));}if(e.key==='ArrowLeft'){e.preventDefault();selectMilestone(Math.max(i-1,0));}});
   spine.append(stop);
  });
  rail.append(spine);
  if(visible==='timeline')fitRailEdges();
  // Do not automatically display milestone details.
  closeDetails();
  index.textContent=data.length+' company milestones';
  if(photoMount)void photoMount.refresh();
 }
 function jumpTo(targetIndex){
  if(!data.length)return;
  closeDetails();
  activeIndex=targetIndex;
  for(const card of rail.querySelectorAll('.orca-timeline-event[data-index]')){
   card.setAttribute('aria-pressed',String(Number(card.dataset.index)===targetIndex));
  }
  index.textContent='Milestone '+(targetIndex+1)+' of '+data.length;
  const target=rail.querySelector('.orca-timeline-event[data-index="'+targetIndex+'"]');
  if(target)centerMilestone(target);
 }
 prev.addEventListener('click',()=>jumpTo(0));
 next.addEventListener('click',()=>jumpTo(data.length-1));
 // Capture outside clicks, including clicks elsewhere on the page.
 document.addEventListener('pointerdown',event=>{
  if(visible!=='timeline'||details.hidden)return;
  if(!details.contains(event.target)&&!event.target.closest?.('.orca-timeline-event'))closeDetails();
 },true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!details.hidden)closeDetails();});
 rail.addEventListener('wheel',event=>{
  if(Math.abs(event.deltaY)>Math.abs(event.deltaX)&&rail.scrollWidth>rail.clientWidth){
   rail.scrollLeft+=event.deltaY;
   event.preventDefault();
  }
 },{passive:false});
 async function loadEvents(){
  const {data:rows,error}=await sb.from('orca_timeline_annotations')
   .select('id,event_at,category,title,ai_summary,quick_brief,source_url,image_url,image_credit')
   .eq('ticker',ticker).order('event_at',{ascending:true}).limit(500);
  if(error){status.textContent='Company milestone data unavailable; TradingView is unaffected.';return}
  data=(rows||[]).filter(x=>validSource(x.source_url))
   .map(x=>({...x,image_url:validImage(x.image_url)}));
  renderCards();
  status.textContent=data.length+' sourced company milestone'+(data.length===1?'':'s')+
   ' · explore sourced events along the company history';
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
 try{
  const module=await import('./orca-timeline-photos.js?v=3');
  photoMount=await module.mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute});
 }catch(error){console.warn('Optional history photography is unavailable',error)}
 const poll=setInterval(()=>{if(document.visibilityState==='visible')loadEvents()},60000);
 window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
}
