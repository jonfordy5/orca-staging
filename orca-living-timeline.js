// ORCA Living Timeline: sourced company milestones only, separate from TradingView.
// Images are optional and must be licensed/authorized. No agent-research chart markers.
export async function mountLivingTimeline({sb,ticker,getUser=()=>null,canContribute=()=>false}){
 // Keep TradingView mounted; this module owns only the timeline panel.
 const host=document.getElementById('timeline-frame');
 const status=document.getElementById('living-status');
 if(!host||!status||!sb)return;
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
 let data=[],activeIndex=0;
 const initialHistoryGoal=10; // Starter goal, never a display limit.
 let allVerified=[];
 const year=()=>new Date().getUTCFullYear();
 const halfYearStart=()=>new Date(Date.UTC(year(),new Date().getUTCMonth()<6?0:6,1));
 const isOrigin=e=>e?.quick_brief?.era==='founding'||
  /\b(found(?:ed|ing)?|incorporat(?:e(?:d|s)?|ing|ion)|establish(?:ed|ment)|began as|begins as|first (?:store|operation|business|restaurant|location)|open(?:s|ed)?\s+(?:the\s+)?first)\b/i.test(String(e?.title||''));
 const hasOrigin=()=>allVerified.some(isOrigin);
 const hasCurrentYear=()=>allVerified.some(e=>new Date(e.event_at).getUTCFullYear()===year());
 const hasCurrentHalf=()=>allVerified.some(e=>new Date(e.event_at)>=halfYearStart());
 // A first-ever stock timeline needs the full multi-event history pass.
 const researchNeed=()=>allVerified.length<initialHistoryGoal?'history':!hasOrigin()?'origin':
  (!hasCurrentYear()||!hasCurrentHalf())?'current':'none';
 const mayRequestHistory=()=>!discoveryPending&&(researchNeed()!=='none'||photoMissing>0);
 let discoveryPending=false;
 let researchFeedback='';
 let historyAuthorized=false;
 let historyPermissionKnownFor=null;
 let historyPermissionPending=false;
 let prices=[];
 let photoMount=null;
 let photoMissing=0;
 let lastEventFingerprint='';
 // Render the zigzag directly through measured photo connector endpoints.
 // No circles, no gaps, and no hard-coded node coordinates.
 let beamFrame=0;
 function stopBeam(){
  if(beamFrame)cancelAnimationFrame(beamFrame);
  beamFrame=0;
 }
 function drawHistoryTrack(){
  stopBeam();
  const spine=rail.querySelector('.orca-history-spine');
  if(!spine)return;
  spine.querySelector('.orca-history-track')?.remove();
  const stops=[...spine.querySelectorAll('.orca-history-stop')];
  if(!stops.length)return;
  const spineRect=spine.getBoundingClientRect();
  const points=stops.map((stop,i)=>{
   const rect=stop.querySelector('.orca-history-stem').getBoundingClientRect();
   return [Math.round(rect.left+rect.width/2-spineRect.left),
    Math.round((i%2===0?rect.bottom:rect.top)-spineRect.top)];
  });
  // The history has no permanent endpoint. Extend two more zigzag legs
  // (~380px total) beyond the newest milestone, without inventing an event.
  // Once a new milestone arrives, the continuation grows from that event.
  const futureStep=190;
  const last=points[points.length-1];
  const prior=points[points.length-2]||[last[0]-210,last[1]+50];
  const originalStep=Math.max(1,last[0]-prior[0]);
  const nextRise=-(last[1]-prior[1])*futureStep/originalStep;
  const futurePoints=[
   [last[0]+futureStep,last[1]+nextRise],
   [last[0]+futureStep*2,last[1]]
  ];
  const entireLine=[...points,...futurePoints];
  const width=Math.ceil(futurePoints[1][0])+1;
  const height=Math.max(1,Math.ceil(spine.clientHeight));
  const pathData='M '+entireLine.map(([x,y])=>Math.round(x)+' '+Math.round(y)).join(' L ');
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.classList.add('orca-history-track');
  svg.setAttribute('viewBox','0 0 '+width+' '+height);
  svg.setAttribute('width',String(width));
  svg.setAttribute('height',String(height));
  svg.setAttribute('aria-hidden','true');
  svg.style.width=width+'px';
  const base=document.createElementNS(ns,'path');
  base.classList.add('orca-history-track-base');
  base.setAttribute('d',pathData);
  base.setAttribute('fill','none');
  base.setAttribute('vector-effect','non-scaling-stroke');
  base.setAttribute('stroke-linejoin','round');
  const gradientId='orca-beam-fade-'+ticker.toLowerCase().replace(/[^a-z0-9]/g,'');
  const defs=document.createElementNS(ns,'defs');
  const gradient=document.createElementNS(ns,'linearGradient');
  gradient.setAttribute('id',gradientId);
  gradient.setAttribute('x1','0%');gradient.setAttribute('y1','0%');
  gradient.setAttribute('x2','100%');gradient.setAttribute('y2','0%');
  for(const [offset,opacity] of [
   ['0%','0'],['22%','0.82'],['42%','1'],
   ['62%','1'],['82%','0.82'],['100%','0']
  ]){
   const stop=document.createElementNS(ns,'stop');
   stop.setAttribute('offset',offset);
   stop.setAttribute('stop-color','#f5ffff');
   stop.setAttribute('stop-opacity',opacity);
   gradient.append(stop);
  }
  // Only the final 150px fades, so a new future milestone can extend
  // the same continuous line. The beam fades with the line at its endpoint.
  const tailFadeStart=Math.max(0,futurePoints[1][0]-150);
  const tailId='orca-future-tail-'+ticker.toLowerCase().replace(/[^a-z0-9]/g,'');
  const tailGradient=document.createElementNS(ns,'linearGradient');
  tailGradient.setAttribute('id',tailId+'-gradient');
  tailGradient.setAttribute('gradientUnits','userSpaceOnUse');
  tailGradient.setAttribute('x1',String(tailFadeStart));
  tailGradient.setAttribute('y1','0');
  tailGradient.setAttribute('x2',String(futurePoints[1][0]));
  tailGradient.setAttribute('y2','0');
  for(const [offset,opacity] of [['0%','1'],['100%','0']]){
   const step=document.createElementNS(ns,'stop');
   step.setAttribute('offset',offset);
   step.setAttribute('stop-color','white');
   step.setAttribute('stop-opacity',opacity);
   tailGradient.append(step);
  }
  const tailMask=document.createElementNS(ns,'mask');
  tailMask.setAttribute('id',tailId);
  tailMask.setAttribute('maskUnits','userSpaceOnUse');
  tailMask.setAttribute('x','0');
  tailMask.setAttribute('y','0');
  tailMask.setAttribute('width',String(width));
  tailMask.setAttribute('height',String(height));
  const maskFill=document.createElementNS(ns,'rect');
  maskFill.setAttribute('x','0');
  maskFill.setAttribute('y','0');
  maskFill.setAttribute('width',String(width));
  maskFill.setAttribute('height',String(height));
  maskFill.setAttribute('fill','url(#'+tailId+'-gradient)');
  tailMask.append(maskFill);
  defs.append(gradient,tailGradient,tailMask);
  base.setAttribute('mask','url(#'+tailId+')');
  const beam=document.createElementNS(ns,'path');
  beam.classList.add('orca-history-track-beam');
  beam.setAttribute('fill','none');
  beam.setAttribute('stroke','url(#'+gradientId+')');
  beam.setAttribute('mask','url(#'+tailId+')');
  beam.setAttribute('vector-effect','non-scaling-stroke');
  beam.setAttribute('stroke-linecap','butt');
  beam.setAttribute('stroke-linejoin','round');
  svg.append(defs,base,beam);
  // Append to keep :nth-child parity of alternating milestone cards stable.
  // The track is absolutely positioned behind photos and stems by z-index.
  spine.append(svg);
  if(stops.length<2||window.matchMedia('(max-width:700px)').matches||
     window.matchMedia('(prefers-reduced-motion: reduce)').matches||
     document.visibilityState==='hidden')return;
  const length=base.getTotalLength();
  if(!length)return;
  const travelMs=18000;
  const beamLength=Math.min(115,Math.max(60,length*0.06));
  const nodeDistances=[0];
  for(let i=1;i<points.length;i++){
   const [x0,y0]=points[i-1], [x1,y1]=points[i];
   nodeDistances.push(nodeDistances[i-1]+Math.hypot(x1-x0,y1-y0));
  }
  let startTime=0,previousHead=-1;
  const animate=now=>{
   if(document.visibilityState==='hidden'||!svg.isConnected){beamFrame=0;return}
   if(!startTime)startTime=now;
   const head=((now-startTime)%travelMs)/travelMs*(length+beamLength);
   if(head<previousHead)previousHead=-1;
   const from=Math.max(0,head-beamLength),to=Math.min(length,head);
   if(to>from){
    const samples=Math.max(5,Math.ceil((to-from)/5));
    const coords=[];
    for(let j=0;j<=samples;j++){
     const p=base.getPointAtLength(from+(to-from)*j/samples);
     coords.push((j?'L ':'M ')+p.x.toFixed(1)+' '+p.y.toFixed(1));
    }
    beam.setAttribute('d',coords.join(' '));
   }else beam.setAttribute('d','');
   for(let i=0;i<stops.length;i++){
    if(nodeDistances[i]>previousHead&&nodeDistances[i]<=head){
     stops[i].classList.remove('orca-history-activated');
     void stops[i].offsetWidth;
     stops[i].classList.add('orca-history-activated');
    }
   }
   previousHead=head;
   beamFrame=requestAnimationFrame(animate);
  };
  beamFrame=requestAnimationFrame(animate);
 }
 function fitRailEdges(){
  const spine=rail.querySelector('.orca-history-spine');
  const stop=spine?.querySelector('.orca-history-stop');
  if(!spine||!stop||!rail.clientWidth)return;
  const mobile=window.matchMedia('(max-width:700px)').matches;
  // Desktop gets enough room to reveal the future continuation beyond
  // the last company event. Mobile remains a normal swipe-only photo strip.
  spine.style.paddingLeft=(mobile?12:20)+'px';
  spine.style.paddingRight=(mobile?12:Math.max(420,Math.round((rail.clientWidth-stop.getBoundingClientRect().width)/2)))+'px';
 }
 function centerMilestone(element,behavior='smooth'){
  const stop=element?.closest('.orca-history-stop');
  if(!stop||!rail.clientWidth)return;
  fitRailEdges();
  const left=stop.offsetLeft+stop.offsetWidth/2-rail.clientWidth/2;
  rail.scrollTo({left:Math.max(0,left),behavior});
 }
 window.addEventListener('resize',()=>{fitRailEdges();drawHistoryTrack()});
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')stopBeam();
  else drawHistoryTrack();
 });
 // The history section is permanently visible beneath the market chart.
 host.hidden=false;
 host.append(frame);
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
 function updateCompleteAction(){
  const old=frame.querySelector('.orca-history-refill-action');
  // Empty stocks already have the sole action inside the empty-state rail.
  // Never insert a second toolbar button before the first milestone exists.
  if(!data.length){
   old?.remove();
   const emptyButton=rail.querySelector('.orca-timeline-generate');
   if(emptyButton){
    emptyButton.disabled=discoveryPending||!historyAuthorized;
    emptyButton.textContent=discoveryPending?'Completing company timeline…':'Complete company timeline';
   }
   return;
  }
  const needed=researchNeed()!=='none'||photoMissing>0;
  if(!needed||!getUser()){old?.remove();return}
  const generate=old||document.createElement('button');
  generate.type='button';
  generate.className='orca-timeline-generate orca-history-refill-action';
  generate.textContent=discoveryPending?'Completing company timeline…':'Complete company timeline';
  generate.title='One authorized action checks missing sourced milestones and unique photo coverage';
  generate.disabled=discoveryPending||!historyAuthorized;
  if(!old){
   generate.addEventListener('click',()=>void maybePopulateCompanyHistory());
   frame.insertBefore(generate,rail);
  }
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
   empty.textContent='No sourced company milestones cached for '+ticker+' yet. Authorized research is required to build the initial history.';
   rail.append(empty);
   if(researchFeedback){
    const feedback=document.createElement('div');feedback.className='orca-timeline-research-feedback';
    feedback.textContent=researchFeedback;rail.append(feedback);
   }
   if(getUser()){
    const generate=document.createElement('button');
    generate.type='button';
    generate.className='orca-timeline-generate';
    generate.textContent='Complete company timeline';
    generate.title='Complete missing sourced history, founding and current-year milestones within a shared $0.15 estimated budget';
    generate.disabled=discoveryPending||!historyAuthorized;
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
   // The single continuous SVG track is mounted after cards are laid out.
   const stem=document.createElement('span');stem.className='orca-history-stem';
   // Repeat the year on every node, including neighboring same-year events.
   const eventYear=new Date(event.event_at).getUTCFullYear();
   const year=document.createElement('span');
   year.className='orca-history-year-once';
   year.textContent=String(eventYear);
   year.setAttribute('aria-label','Year '+eventYear);
   stop.append(stem,card,year);
   card.addEventListener('animationend',e=>{
    if(e.animationName==='orca-photo-arrival')
     stop.classList.remove('orca-history-activated');
   });
   card.addEventListener('click',()=>selectMilestone(i));
   stop.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();selectMilestone(Math.min(i+1,data.length-1));}if(e.key==='ArrowLeft'){e.preventDefault();selectMilestone(Math.max(i-1,0));}});
   spine.append(stop);
  });
  rail.append(spine);
  // A single control handles both research and optional photographs.
  updateCompleteAction();
  fitRailEdges();
  drawHistoryTrack();
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
  if(details.hidden)return;
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
  if(researchFeedback&&!data.length){status.textContent=researchFeedback;return;}
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
  updateCompleteAction();
  return historyAuthorized;
 }
 function showResearchFeedback(message){
  researchFeedback=String(message||'');status.textContent=researchFeedback;
  if(!data.length){
   let notice=rail.querySelector('.orca-timeline-research-feedback');
   if(!notice){notice=document.createElement('div');notice.className='orca-timeline-research-feedback';rail.append(notice);}
   notice.textContent=researchFeedback;
  }
 }
 async function maybePopulateCompanyHistory(){
  if(!mayRequestHistory())return;
  if(!getUser()){
   if(!data.length)showResearchFeedback('Sign in and enable ORCA research consent before generating company history.');
   return;
  }
  if(!(await checkHistoryPermission())){
   showResearchFeedback('Enable research consent in your ORCA researcher profile to complete company history.');
   return;
  }
  discoveryPending=true;
  researchFeedback='';
  rail.querySelector('.orca-timeline-research-feedback')?.remove();
  const generateButton=frame.querySelector('.orca-history-refill-action')||rail.querySelector('.orca-timeline-generate');
  if(generateButton){generateButton.disabled=true;generateButton.textContent='Completing company timeline…';}
  let spent=0;
  const maxBudget=0.15;
  const attempted=new Set();
  const summaries=[];
  // One intentional click handles the missing stages sequentially. Reload
  // cached milestones after each call and never repeat the same research scope.
  const nextScope=()=>allVerified.length<initialHistoryGoal&&!attempted.has('history')?'history':
   !hasOrigin()&&!attempted.has('origin')?'origin':
   !hasCurrentHalf()&&!attempted.has('current')?'current':null;
  try{
   for(let stage=0;stage<3;stage++){
    const scope=nextScope();
    if(!scope||attempted.has(scope))break;
    const remaining=Number((maxBudget-spent).toFixed(5));
    // Preserve room for a real, single-search research request.
    if(remaining<0.025){
     summaries.push('Remaining research deferred to avoid exceeding the $0.15 estimated budget.');
     break;
    }
    attempted.add(scope);
    showResearchFeedback('Completing '+ticker+' timeline · research '+(stage+1)+
     '/3 · estimated cost $'+spent.toFixed(3)+' of $0.15');
    let result;
    try{
     const response=await sb.functions.invoke('orca-timeline-discovery',{
      body:{ticker,scope,max_budget_usd:remaining}});
     result=response.data;
     if(response.error){
      let details={};
      try{
       if(response.error?.context?.clone)details=await response.error.context.clone().json();
      }catch{}
      spent+=Math.max(0,Number(details?.estimated_usd)||0);
      const code=String(details?.code||'');
      summaries.push(code==='no_acceptable_primary_source_milestones'?
       'No new '+scope+' milestones passed first-party source checks.':
       code==='cost_envelope_exceeded'?
       'Stopped '+scope+' research at the research budget limit.':
       'Research could not finish '+scope+'.');
      break;
     }
    }catch{
     summaries.push('Research request interrupted; automatic retries stopped.');
     break;
    }
    spent+=Math.max(0,Number(result?.estimated_usd)||0);
    if(result?.state==='ready'){
     await loadEvents();
     const added=Math.max(0,Number(result.added)||0);
     summaries.push(added+' '+scope+' milestone'+(added===1?'':'s')+' saved.');
     if(!added)break;
    }else if(result?.state==='cached'){
     await loadEvents();
     summaries.push('Existing '+scope+' history reused.');
     if(scope==='history')break;
    }else{
     summaries.push('Research status: '+String(result?.state||'unavailable')+'.');
     break;
    }
   }
   await loadEvents();
   // Photo selection is an internal, authorized part of this action, not
   // another button. It never generates historical milestones or adds
   // to the $0.15 research-generation estimate.
   if(photoMount&&allVerified.length){
    const initial=await photoMount.refresh();
    photoMissing=Math.max(0,Number(initial?.missing||0))+Math.max(0,Number(initial?.duplicates||0));
    if(photoMissing){
     showResearchFeedback('Company history checked. Finding distinct business photographs for missing cards…');
     const photoResult=await photoMount.fillMissing();
     const coverage=await photoMount.refresh();
     photoMissing=Math.max(0,Number(coverage?.missing||0))+Math.max(0,Number(coverage?.duplicates||0));
     summaries.push(photoMissing===0?'Photo coverage complete.':
      photoMissing+' image slot'+(photoMissing===1?'':'s')+' still awaiting source photos.');
     if(photoResult?.error)summaries.push('Image provider request could not finish.');
    }
   }
   showResearchFeedback(summaries.join(' ')+
    ' Estimated history research cost this click: $'+spent.toFixed(3)+
    ' / $0.15. '+allVerified.length+' sourced milestones saved.'+
    (researchNeed()==='none'&&photoMissing===0?' Timeline complete.':
     ' Remaining research or photo work was not invented or automatically retried.'));
  }finally{
   discoveryPending=false;
   updateCompleteAction();
   const button=rail.querySelector('.orca-timeline-generate');
   if(button){button.disabled=!mayRequestHistory();button.textContent='Complete company timeline';}
  }
 }
 // Display cached history immediately; paid history research remains opt-in.
 await loadEvents();
 // Cached histories and existing photo repairs should work immediately
 // without relying on the old manual Living Timeline toggle.
 await checkHistoryPermission();
 requestAnimationFrame(()=>{
  fitRailEdges();
  drawHistoryTrack();
  const middle=Math.floor((data.length-1)/2);
  const card=rail.querySelector('.orca-timeline-event[data-index="'+middle+'"]');
  if(card)centerMilestone(card,'auto');
 });
 try{
  const module=await import('./orca-timeline-photos.js?v=one-button-photos-v22');
  photoMount=await module.mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute:()=>historyAuthorized});
  const coverage=photoMount.getCoverage();
  photoMissing=Math.max(0,Number(coverage?.missing||0))+Math.max(0,Number(coverage?.duplicates||0));
  updateCompleteAction();
 }catch(error){console.warn('Optional history photography is unavailable',error)}
 const poll=setInterval(()=>{if(document.visibilityState==='visible')loadEvents()},60000);
 window.addEventListener('pagehide',()=>{stopBeam();clearInterval(poll)},{once:true});
}
