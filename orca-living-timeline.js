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
 frame.append(heading,navigation,rail,details);
 details.classList.add('orca-history-popover');details.setAttribute('role','dialog');details.setAttribute('aria-label','Milestone details');details.setAttribute('tabindex','-1');
 let visible='tradingview',data=[],chart=null,series=null,chartLibrary=null,activeIndex=0;
 let automaticDiscoveryAttempted=false;
 let prices=[];
 function switchTo(which){
  if(which===visible)return;
  if(which==='timeline'){
   while(host.firstChild)tvBackup.append(host.firstChild);
   host.append(frame);
   visible='timeline';
   livingButton?.setAttribute('aria-pressed','true');
   tvButton?.setAttribute('aria-pressed','false');
   // History uses its own event spine; TradingView remains a separate chart mode.
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
  const selected=rail.querySelector('.orca-timeline-event[data-index="'+activeIndex+'"]');
  if(selected){selected.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});selected.focus({preventScroll:true});}
 }
 function renderCards(){
  rail.replaceChildren();
  details.hidden=true;
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
   card.dataset.index=String(i);card.setAttribute('aria-pressed',String(i===activeIndex));
   const icon=document.createElement('span');icon.className='orca-timeline-event-media';
   icon.textContent=icons[event.category]||'◆';
   const date=document.createElement('small');date.textContent=formatDate(event.event_at);
   const title=document.createElement('strong');title.textContent=event.title;
   const category=document.createElement('span');category.className='orca-history-category';
   category.textContent=String(event.category||'milestone').replace('_',' ');
   card.append(icon,date,title,category);
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
  // Do not automatically display milestone details.
  details.hidden=true;
 }
 async function loadEvents(){
  const {data:rows,error}=await sb.from('orca_timeline_annotations')
   .select('id,event_at,category,title,ai_summary,source_url,image_url,image_credit')
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
 const poll=setInterval(()=>{if(document.visibilityState==='visible')loadEvents()},60000);
 window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
}
