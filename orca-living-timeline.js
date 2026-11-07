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
 const description=document.createElement('span');description.textContent='Company milestones · select to read more';
 heading.append(h,description);
 const navigation=document.createElement('div');
 navigation.className='orca-timeline-navigation';
 const prev=document.createElement('button');prev.type='button';prev.textContent='‹';prev.setAttribute('aria-label','Jump to earliest event');prev.title='Earliest event';
 const index=document.createElement('span');index.className='orca-timeline-index';index.setAttribute('aria-live','polite');
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
 const initialHistoryGoal=10; // Starter goal, never a display limit.
 const attemptedScopesThisSession=new Set();
 let allVerified=[];
 const year=()=>new Date().getUTCFullYear();
 const halfYearStart=()=>new Date(Date.UTC(year(),new Date().getUTCMonth()<6?0:6,1));
 const isOrigin=e=>e?.quick_brief?.era==='founding'||
  /\b(found(?:ed|ing)?|incorporat(?:ed|ion)|establish(?:ed|ment)|began as|begins as|first (?:store|operation|business))\b/i.test(String(e?.title||''));
 const hasOrigin=()=>allVerified.some(isOrigin);
 const hasCurrentYear=()=>allVerified.some(e=>new Date(e.event_at).getUTCFullYear()===year());
 const hasCurrentHalf=()=>allVerified.some(e=>new Date(e.event_at)>=halfYearStart());
 const researchNeed=()=>!hasOrigin()?'origin':
  (!hasCurrentYear()||!hasCurrentHalf())?'current':
  allVerified.length<initialHistoryGoal?'history':'none';
 const mayRequestHistory=()=>!discoveryPending&&researchNeed()!=='none'&&!attemptedScopesThisSession.has(researchNeed());
 let discoveryPending=false;
 let historyAuthorized=false;
 let historyPermissionKnownFor=null;
 let historyPermissionPending=false;
 let prices=[];
 let photoMount=null;
 let lastEventFingerprint='';
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
 livingButton.addEventListener('click',()=>{switchTo('timeline');void (async()=>{await checkHistoryPermission();if(!data.length)await maybePopulateCompanyHistory();})()});
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
 const eventDate=e=>{
  const d=new Date(e.event_at),precision=e?.quick_brief?.date_precision;
  if(precision==='year')return String(d.getUTCFullYear());
  if(precision==='month')return d.toLocaleDateString(undefined,{month:'short',year:'numeric',timeZone:'UTC'});
  return formatDate(e.event_at);
 };
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
  const meta=document.createElement('small');meta.textContent=eventDate(event)+' · '+event.category.replace('_',' ');
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
  // Rebuild the visible refill toolbar with the cards, never inside the
  // horizontally scrolling event rail where it would disappear off-screen.
  frame.querySelector('.orca-history-refill-action')?.remove();
  rail.replaceChildren();
  closeDetails();
  frame.classList.toggle('orca-history-empty',!data.length);
  navigation.hidden=!data.length;
  if(!data.length){
   const empty=document.createElement('div');empty.className='orca-timeline-empty';
   empty.textContent='No sourced company milestones cached for '+ticker+' yet. Research consent is required before generating a shared history.';
   rail.append(empty);
   if(getUser()){
    const generate=document.createElement('button');
    generate.type='button';
    generate.className='orca-timeline-generate';
    generate.textContent='Generate company history';
    generate.title='Research and cache sourced company origins and current-year milestones within ORCA budget safeguards';
    generate.addEventListener('click',()=>void maybePopulateCompanyHistory());
    rail.append(generate);
   }
   details.hidden=true;return;
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
   const date=document.createElement('small');date.textContent=eventDate(event);
   const title=document.createElement('strong');title.textContent=event.title;
   const summary=document.createElement('span');summary.className='orca-history-teaser';
   summary.textContent=String(event.ai_summary||'').trim();
   card.setAttribute('aria-label',eventDate(event)+': '+event.title+'. Select to read sourced details.');
   card.append(icon,date,title,summary);
   const stem=document.createElement('span');stem.className='orca-history-stem';
   const dot=document.createElement('span');dot.className='orca-history-dot';
   // Render exactly one distinct year badge, anchored to the middle event of that year.
   // Legacy .orca-history-year labels are hidden by CSS as a cache-safe fallback.
   const eventYear=new Date(event.event_at).getUTCFullYear();
   const sameYearIndices=data.map((item,index)=>new Date(item.event_at).getUTCFullYear()===eventYear?index:-1).filter(index=>index>=0);
   const yearLabelIndex=sameYearIndices[Math.floor((sameYearIndices.length-1)/2)];
   stop.append(card,stem,dot);
   if(i===yearLabelIndex){
    const year=document.createElement('span');
    year.className='orca-history-year-once';
    year.textContent=String(eventYear);
    year.setAttribute('aria-label','Year '+eventYear);
    stop.append(year);
   }
   card.addEventListener('click',()=>selectMilestone(i));
   stop.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();selectMilestone(Math.min(i+1,data.length-1));}if(e.key==='ArrowLeft'){e.preventDefault();selectMilestone(Math.max(i-1,0));}});
   spine.append(stop);
  });
  rail.append(spine);
  // Incomplete cached timelines offer a deliberate refill, never a paid page-view retry.
  if(researchNeed()!=='none'&&getUser()){
   const generate=document.createElement('button');
   generate.type='button';
   generate.className='orca-timeline-generate orca-history-refill-action';
   const scope=researchNeed();
   generate.textContent=scope==='current'?'Research '+year()+' milestone':
    scope==='origin'?'Research company beginnings':'Add historical milestones';
   generate.title='Source-backed research. Current-year refreshes are eligible twice yearly and require authorization.';
   generate.disabled=!mayRequestHistory();
   generate.addEventListener('click',()=>void maybePopulateCompanyHistory());
   frame.insertBefore(generate,rail);
  }
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
  // Paginate to keep the archive genuinely open-ended; Supabase returns
  // up to the configured page size per request.
  const rows=[];
  for(let offset=0;;offset+=250){
   const {data:page,error}=await sb.from('orca_timeline_annotations')
    .select('id,event_at,category,title,ai_summary,quick_brief,source_url,image_url,image_credit')
    .eq('ticker',ticker).is('created_by',null)
    .order('event_at',{ascending:true}).range(offset,offset+249);
   if(error){status.textContent='Company milestone data unavailable; TradingView is unaffected.';return}
   rows.push(...(page||[]));
   if(!page||page.length<250)break;
  }
  const verified=rows.filter(x=>validSource(x.source_url))
   .map(x=>({...x,image_url:validImage(x.image_url)}));
  // Open-ended: render EVERY source-backed milestone in chronological order.
  // The first and last events remain visible even as the history grows.
  allVerified=verified;
  const nextData=verified;
  // Avoid destroying active modal details every 60 seconds on unchanged records.
  const fingerprint=JSON.stringify(nextData.map(e=>[e.id,e.event_at,e.title,e.ai_summary,e.source_url,e.image_url,e.image_credit,e.quick_brief]));
  if(fingerprint!==lastEventFingerprint){
   data=nextData;
   lastEventFingerprint=fingerprint;
   renderCards();
  }
  const extra=Math.max(0,verified.length-data.length);
  status.textContent=data.length+' featured company milestone'+(data.length===1?'':'s')+
   (extra?' · '+extra+' source-backed milestones archived':'')+
   (!hasOrigin()?' · founding history missing':'')+
   (!hasCurrentYear()?' · '+year()+' bulletin needed':(!hasCurrentHalf()?' · half-year bulletin eligible':''))+
   ' · explore company history';
 }
 async function checkHistoryPermission(){
  const user=getUser();
  if(!user?.id){historyAuthorized=false;historyPermissionKnownFor=null;return false}
  if(historyPermissionKnownFor===user.id&&historyAuthorized)return true;
  if(historyPermissionPending)return false;
  historyPermissionPending=true;
  try{
   const {data:profiles,error}=await sb.from('agent_profiles').select('id')
    .eq('owner_id',user.id).eq('opted_in',true).limit(1);
   historyAuthorized=!error&&Array.isArray(profiles)&&profiles.length>0;
   if(!error)historyPermissionKnownFor=user.id;
  }catch{historyAuthorized=false}
  finally{historyPermissionPending=false}
  if(photoMount)void photoMount.refresh();
  return historyAuthorized;
 }
 async function maybePopulateCompanyHistory(){
  if(!mayRequestHistory())return;
  if(!getUser()){
   if(!data.length)status.textContent='No company timeline cached. Sign in and enable ORCA research consent to generate it; viewing cached company histories is free.';
   return;
  }
  if(!(await checkHistoryPermission())){
   status.textContent='Enable research consent in your ORCA agent profile to complete this company history.';
   return;
  }
  const researchScope=researchNeed();
  attemptedScopesThisSession.add(researchScope);
  discoveryPending=true;
  const generateButton=frame.querySelector('.orca-history-refill-action')||rail.querySelector('.orca-timeline-generate');
  if(generateButton){generateButton.disabled=true;generateButton.textContent='Researching company history…';}
  status.textContent='Researching and caching sourced company milestones for '+ticker+'. This does not claim an agent research assignment.';
  try{
   const {data:result,error}=await sb.functions.invoke('orca-timeline-discovery',{body:{ticker,scope:researchScope}});
   if(error)throw error;
   if(result?.state==='ready'){
    await loadEvents();
    const added=Number(result.added||0);
    status.textContent=added>0?added+' sourced milestone'+(added===1?'':'s')+' saved for '+ticker+' · available to future visitors.':
     'Company history search finished without new verified milestones. Existing records remain unchanged.';
   }else if(result?.state==='cached'){
    await loadEvents();
    const next=typeof result.refresh_eligible_after==='string'&&Number.isFinite(Date.parse(result.refresh_eligible_after))
     ?new Date(result.refresh_eligible_after).toLocaleString():null;
    status.textContent=allVerified.length+' historical milestones cached.'+
     (next?' Additional research becomes eligible after '+next+'.':' Research cooldown is active.')+
     ' Existing sources are unchanged.';
   }else{
    const type=String(result?.state||'unavailable');
    const note=({
     building:'Company milestone discovery is already underway.',
     cooldown:'Milestone discovery is temporarily resting after an unsuccessful attempt.',
     daily_limit:'Daily development safeguard reached for this account.',
     budget_exhausted:'The shared $15 monthly AI reservation allowance has been reached.'
    })[type]||'Automatic milestone discovery is currently unavailable.';
    status.textContent=note+' '+data.length+' previously cached milestones remain available.';
   }
  }catch{
   status.textContent='Could not generate sourced company milestones now. Existing research stays safe; TradingView remains available.';
  }finally{
   discoveryPending=false;
   const generateButton=frame.querySelector('.orca-history-refill-action')||rail.querySelector('.orca-timeline-generate');
   if(generateButton){
    generateButton.disabled=!mayRequestHistory();
    generateButton.textContent=researchNeed()==='current'?'Research '+year()+' milestone':
      researchNeed()==='origin'?'Research company beginnings':
      allVerified.length?'Add historical milestones':'Generate company history';
   }
  }
 }
 // Preserve the normal TradingView chart on initial load. Living Timeline is opt-in.
 await loadEvents();
 try{
  const module=await import('./orca-timeline-photos.js?v=open-ended-photos-v12');
  photoMount=await module.mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute:()=>historyAuthorized});
 }catch(error){console.warn('Optional history photography is unavailable',error)}
 const poll=setInterval(()=>{if(document.visibilityState==='visible')loadEvents()},60000);
 window.addEventListener('pagehide',()=>clearInterval(poll),{once:true});
}
