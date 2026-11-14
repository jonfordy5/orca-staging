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
 const mobileLayout=window.matchMedia('(max-width:700px), (max-width:1000px) and (max-height:600px) and (hover:none) and (pointer:coarse)');
 const mobileProgress=document.createElement('p');
 mobileProgress.className='orca-timeline-mobile-progress';
 mobileProgress.setAttribute('role','status');
 let mobileVisibleIndex=0,mobileScrollFrame=0;
 const details=document.createElement('section');
 details.className='orca-timeline-details';
 details.hidden=true;
 const backdrop=document.createElement('div');
 backdrop.className='orca-history-backdrop';
 backdrop.hidden=true;
 backdrop.setAttribute('aria-hidden','true');
 frame.append(heading,navigation,rail,mobileProgress,backdrop,details);
 details.classList.add('orca-history-popover');details.setAttribute('role','dialog');details.setAttribute('aria-label','Milestone details');details.setAttribute('tabindex','-1');
 let data=[],activeIndex=0;
 const initialHistoryGoal=10; // Starter goal, never a display limit.
 let allVerified=[];
 const year=()=>new Date().getUTCFullYear();
 const halfYearStart=()=>new Date(Date.UTC(year(),new Date().getUTCMonth()<6?0:6,1));
 const isOrigin=e=>e?.quick_brief?.era==='founding'||
  /\b(found(?:ed|ing)?|incorporat(?:e(?:d|s)?|ing|ion)|establish(?:ed|ment)|began as|begins as|first (?:store|operation|business|restaurant|location)|first\s+.{1,50}?\s+(?:opens?|opened)|open(?:s|ed)?\s+(?:the\s+)?first|launch(?:es|ed)\s+at\s+(?:harvard|a university|university|college))\b/i.test(String(e?.title||''));
 const hasOrigin=()=>allVerified.some(isOrigin);
 const hasCurrentYear=()=>allVerified.some(e=>new Date(e.event_at).getUTCFullYear()===year());
 const hasCurrentHalf=()=>allVerified.some(e=>new Date(e.event_at)>=halfYearStart());
 // A first-ever stock timeline needs the full multi-event history pass.
 // Build the starter history first, then fill the missing current-year and
 // founding anchors. Optional half-year refreshes don't block completion.
 const researchNeed=()=>!allVerified.length?'history':!hasCurrentYear()?'current':
  !hasOrigin()?'origin':allVerified.length<initialHistoryGoal?'history':'none';
 let blockedScopes={};
 let completionStatusHealthy=false;
 let brandPhotoPending=false;
 const needsPhotoWork=()=>photoMissing>0||brandPhotoPending;
 let completionStatusKnown=false;
 const needsResearch=()=>
  (!allVerified.length&&!blockedScopes.history)||
  (!hasCurrentYear()&&!blockedScopes.current)||(!hasOrigin()&&!blockedScopes.origin)||
  (allVerified.length<initialHistoryGoal&&!blockedScopes.history);
 const mayRequestHistory=()=>completionStatusKnown&&!discoveryPending&&(needsResearch()||needsPhotoWork());
 async function loadCompletionStatus(completedRunIds=[]){
  completionStatusHealthy=false;
  if(getUser()){
   try{
    const {data,error}=await sb.functions.invoke('orca-timeline-discovery',{
     body:{ticker,scope:'status',completed_run_ids:completedRunIds}});
    if(!error){
     completionStatusHealthy=true;
     blockedScopes=data?.stopped||{};
     brandPhotoPending=!!data?.photo_brand_pending;
     if(allVerified.length>=initialHistoryGoal)delete blockedScopes.history;
     if(hasCurrentYear())delete blockedScopes.current;
     if(hasOrigin())delete blockedScopes.origin;
    }
   }catch{ /* A free status outage must not trigger paid research. */ }
  }
  completionStatusKnown=true;
 }
 const limitationText=()=>Object.entries(blockedScopes).map(([scope,d])=>
  scope+' research checked: '+(d.reason==='source_limit'?'no additional original-source evidence verified':
   d.reason==='budget_limit'?'shared research budget used':d.reason==='search_limit'?'bounded search completed':
   'provider or source verification unavailable')).join(' · ');

 let discoveryPending=false;
 let researchFeedback='';
 let historyAuthorized=false;
 let historyPermissionKnownFor=null;
 let historyPermissionPending=false;
 let prices=[];
 let photoMount=null;
 let photoMissing=0;
 let lastEventFingerprint='';
 // Straight connectors to one horizontal track; the trailing light remains.
 // No numeric nodes or invented future space.
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
  // Mobile keeps its original swipe-only photo carousel.
  if(mobileLayout.matches)return;
  const stops=[...spine.querySelectorAll('.orca-history-stop')];
  if(!stops.length)return;
  const spineRect=spine.getBoundingClientRect();
  const points=stops.map(stop=>{
   const rect=stop.querySelector('.orca-history-stem').getBoundingClientRect();
   return [Math.round(rect.left+rect.width/2-spineRect.left),
    Math.round(rect.bottom-spineRect.top)];
  });
  // End the real history line at the final milestone.
  const width=Math.ceil(points[points.length-1][0])+2;
  const height=Math.max(1,Math.ceil(spine.clientHeight));
  const pathData='M '+points.map(([x,y])=>x+' '+y).join(' L ');
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
  // Antique-gold light: a long faint tail and a warm leading glint.
  for(const [offset,color,opacity] of [
   ['0%','#a9814f','0'],['18%','#b9965d','0.10'],
   ['42%','#cba96d','0.24'],['68%','#e2bf80','0.38'],
   ['87%','#f2d598','0.62'],['100%','#fff0c6','0.79']
  ]){
   const stop=document.createElementNS(ns,'stop');
   stop.setAttribute('offset',offset);
   stop.setAttribute('stop-color',color);
   stop.setAttribute('stop-opacity',opacity);
   gradient.append(stop);
  }
  defs.append(gradient);
  const beam=document.createElementNS(ns,'path');
  beam.classList.add('orca-history-track-beam');
  beam.setAttribute('fill','none');
  beam.setAttribute('stroke','url(#'+gradientId+')');
  beam.setAttribute('vector-effect','non-scaling-stroke');
  beam.setAttribute('stroke-linecap','round');
  beam.setAttribute('stroke-linejoin','round');
  svg.append(defs,base,beam);
  // Keep the SVG behind the cards and their connecting stems.
  spine.append(svg);
  if(stops.length<2||mobileLayout.matches||
     window.matchMedia('(prefers-reduced-motion: reduce)').matches||
     document.visibilityState==='hidden')return;
  const length=base.getTotalLength();
  if(!length)return;
  // Extended fairy-dust wake, deliberately softer than a neon beam.
  // Fixed SVG particles avoid canvas, random flicker and network work.
  // Keep the traveling glint inside the *visible* rail window, even when
  // the company has a long history that extends far off-screen.
  const travelMs=7600;
  const beamLength=Math.min(820,Math.max(260,rail.clientWidth*0.62));
  const dustLength=beamLength*1.25;
  const particles=Array.from({length:42},(_,i)=>{
   const sparkle=document.createElementNS(ns,'circle');
   sparkle.classList.add('orca-history-track-dust');
   sparkle.setAttribute('r',String(i%7===0?1.8:1.1));
   sparkle.setAttribute('fill',i%5===0?'#ffedc1':'#d6b67d');
   sparkle.setAttribute('opacity','0');
   return sparkle;
  });
  svg.append(...particles);
  // A tiny champagne-gold glint provides a legible moving focal point.
  // The head is deliberately independent of the quiet trailing stroke, whose
  // contrast may disappear against an already-gold base on some displays.
  const sparkleHalo=document.createElementNS(ns,'circle');
  sparkleHalo.classList.add('orca-history-sparkle-halo');
  sparkleHalo.setAttribute('r','7');
  sparkleHalo.setAttribute('fill','#f4cf83');
  sparkleHalo.setAttribute('opacity','0');
  const sparkleHead=document.createElementNS(ns,'circle');
  sparkleHead.classList.add('orca-history-sparkle-head');
  sparkleHead.setAttribute('r','3.4');
  sparkleHead.setAttribute('fill','#fff2c7');
  sparkleHead.setAttribute('opacity','0');
  svg.append(sparkleHalo,sparkleHead);
  const nodeDistances=[0];
  for(let i=1;i<points.length;i++){
   const [x0,y0]=points[i-1], [x1,y1]=points[i];
   nodeDistances.push(nodeDistances[i-1]+Math.hypot(x1-x0,y1-y0));
  }
  let startTime=0,previousHead=-1;
  const animate=now=>{
   if(document.visibilityState==='hidden'||!svg.isConnected){beamFrame=0;return}
   if(!startTime)startTime=now;
   // The SVG remains one complete company history. Only its moving highlight
   // follows the rail's current viewport, so it never spends seconds off-screen.
   const railRect=rail.getBoundingClientRect();
   const liveSpineRect=spine.getBoundingClientRect();
   const visibleFrom=Math.max(0,railRect.left-liveSpineRect.left-points[0][0]);
   const visibleTo=Math.min(length,railRect.right-liveSpineRect.left-points[0][0]);
   const phase=((now-startTime)/travelMs+0.20)%1;
   const head=visibleFrom+phase*Math.max(0,visibleTo-visibleFrom);
   const edgeFade=Math.min(1,phase*10,(1-phase)*10);
   beam.style.opacity=String((0.93*edgeFade).toFixed(2));
   const highlight=base.getPointAtLength(Math.min(length,Math.max(0,head)));
   for(const circle of [sparkleHalo,sparkleHead]){
    circle.setAttribute('cx',highlight.x.toFixed(1));
    circle.setAttribute('cy',highlight.y.toFixed(1));
   }
   sparkleHalo.setAttribute('opacity',(0.20*edgeFade).toFixed(2));
   sparkleHead.setAttribute('opacity',(0.95*edgeFade).toFixed(2));
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
   for(let i=0;i<particles.length;i++){
    // Nonuniform fixed positions and minute off-rail drift suggest gold dust.
    const fraction=(i*0.61803398875+0.17)%1;
    const position=head-fraction*dustLength;
    const particle=particles[i];
    if(position<0||position>length){particle.setAttribute('opacity','0');continue}
    const p=base.getPointAtLength(position);
    particle.setAttribute('cx',(p.x+Math.sin(i*2.3)*3.2).toFixed(1));
    particle.setAttribute('cy',(p.y+Math.cos(i*1.7)*4.4).toFixed(1));
    particle.setAttribute('opacity',((0.20+(1-fraction)*0.42)*edgeFade).toFixed(2));
   }
   for(let i=0;i<stops.length;i++){
    if(nodeDistances[i]>previousHead&&nodeDistances[i]<=head&&
       nodeDistances[i]>=visibleFrom&&nodeDistances[i]<=visibleTo){
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
  const mobile=mobileLayout.matches;
  // Only tiny edge insets: no oversized empty future after the last card.
  spine.style.paddingLeft=(mobile?0:16)+'px';
  spine.style.paddingRight=(mobile?0:16)+'px';
 }
 function centerMilestone(element,behavior='smooth'){
  const stop=element?.closest('.orca-history-stop');
  if(!stop||!rail.clientWidth)return;
  fitRailEdges();
  const left=stop.offsetLeft+stop.offsetWidth/2-rail.clientWidth/2;
  rail.scrollTo({left:Math.max(0,left),behavior});
 }
 function updateMobileProgress(){
  if(!mobileLayout.matches||!data.length)return;
  const stops=[...rail.querySelectorAll('.orca-history-stop')];
  const center=rail.getBoundingClientRect().left+rail.clientWidth/2;
  mobileVisibleIndex=stops.reduce((nearest,stop,i)=>{
   const distance=element=>Math.abs(element.getBoundingClientRect().left+element.offsetWidth/2-center);
   return distance(stop)<distance(stops[nearest])?i:nearest;
  },0);
  mobileProgress.textContent='Swipe to explore · '+(mobileVisibleIndex+1)+' of '+data.length;
 }
 rail.addEventListener('scroll',()=>{
  if(!mobileLayout.matches||mobileScrollFrame)return;
  mobileScrollFrame=requestAnimationFrame(()=>{mobileScrollFrame=0;updateMobileProgress()});
 },{passive:true});
 window.addEventListener('resize',()=>{
  fitRailEdges();drawHistoryTrack();
  if(mobileLayout.matches){
   cancelAnimationFrame(mobileScrollFrame);
   const visibleIndex=mobileVisibleIndex;
   mobileScrollFrame=requestAnimationFrame(()=>{
    const card=rail.querySelector('.orca-timeline-event[data-index="'+visibleIndex+'"]');
    if(card)centerMilestone(card,'auto');
    mobileScrollFrame=0;updateMobileProgress();
   });
  }
 });
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
 function renderCards(){
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
   // Dates remain on the photographed cards; no standalone numbered nodes.
   stop.append(stem,card);
   card.addEventListener('animationend',e=>{
    if(e.animationName==='orca-photo-arrival')
     stop.classList.remove('orca-history-activated');
   });
   card.addEventListener('click',()=>selectMilestone(i));
   stop.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();selectMilestone(Math.min(i+1,data.length-1));}if(e.key==='ArrowLeft'){e.preventDefault();selectMilestone(Math.max(i-1,0));}});
   spine.append(stop);
  });
  rail.append(spine);
  fitRailEdges();
  drawHistoryTrack();
  updateMobileProgress();
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
  const verified=rows.filter(x=>x.category!=='custom_note'&&validSource(x.source_url))
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
   (limitationText()?' · '+limitationText():'')+' · explore company history';
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
  if(discoveryPending)return;
  discoveryPending=true;
  researchFeedback='';
  rail.querySelector('.orca-timeline-research-feedback')?.remove();
  let spent=0;
  const maxBudget=0.15;
  const attempted=new Set();
  const completedRunIds=[];
  let historyAttempts=0,historyFollowup=true;
  const summaries=[];
  // History may revisit remaining gaps after the independent current-year stage.
  // Never repeat a focused pass that found no new verified evidence.
  const nextScope=()=>!allVerified.length&&!historyAttempts&&!blockedScopes.history?'history':
   !hasCurrentYear()&&!attempted.has('current')&&!blockedScopes.current?'current':
   !hasOrigin()&&!attempted.has('origin')&&!blockedScopes.origin?'origin':
   allVerified.length<initialHistoryGoal&&historyAttempts<2&&historyFollowup&&!blockedScopes.history?'history':null;
  try{
   for(let stage=0;stage<4;stage++){
    const scope=nextScope();
    if(!scope||(scope!=='history'&&attempted.has(scope)))break;
    const remaining=Number((maxBudget-spent).toFixed(5));
    // Reserve later stages before broad history can consume the click budget.
    // Current year has priority; founding usually arrives with the history pass.
    let futureReserve=scope==='history'?
     (!hasCurrentYear()&&!attempted.has('current')?0.05:0)+
     (!hasOrigin()&&!attempted.has('origin')?0.025:0):
     scope==='current'?
      (!hasOrigin()&&!attempted.has('origin')?0.025:0)+
      (allVerified.length<initialHistoryGoal&&historyAttempts<2&&historyFollowup&&!blockedScopes.history?0.03:0):0;
    // Never starve a missing current-year anchor to hold optional gap funds.
    if(scope==='current'&&remaining-futureReserve<0.03&&futureReserve>=0.03)
     futureReserve-=0.03;
    const stageBudget=Number((remaining-futureReserve).toFixed(5));
    // Preserve room for a real, single-search research request.
    if(stageBudget<(scope==='origin'?0.02:0.03)){
     summaries.push('Remaining research deferred to avoid exceeding the $0.15 estimated budget.');
     break;
    }
    if(scope==='history')historyAttempts++;else attempted.add(scope);
    showResearchFeedback('Completing '+ticker+' timeline · research '+(stage+1)+
     '/4 · estimated cost $'+spent.toFixed(3)+' of $0.15');
    let result;
    try{
     const response=await sb.functions.invoke('orca-timeline-discovery',{
      body:{ticker,scope,max_budget_usd:stageBudget,final_history_pass:scope==='history'&&historyAttempts===2}});
     result=response.data;
     if(response.error){
      let details={};
      try{
       if(response.error?.context?.clone)details=await response.error.context.clone().json();
      }catch{}
      spent+=Math.max(0,Number(details?.estimated_usd)||0);
      if(details.run_id)completedRunIds.push(details.run_id);
      if(scope==='history')historyFollowup=false;
      const code=String(details?.code||'');
      summaries.push(code==='no_acceptable_primary_source_milestones'?
       'No verified '+scope+' milestone was available from primary sources.':
       code==='cost_envelope_exceeded'?
       'Stopped '+scope+' research at the research budget limit.':
       'Research could not finish '+scope+'.');
      // A source gap in one phase must not block another independent
      // phase during this same authorized click.
      if(code==='no_acceptable_primary_source_milestones'||code==='cost_envelope_exceeded')continue;
      break;
     }
    }catch{
     summaries.push('Research request interrupted; automatic retries stopped.');
     break;
    }
    spent+=Math.max(0,Number(result?.estimated_usd)||0);
    if(result?.run_id)completedRunIds.push(result.run_id);
    if(scope==='history')historyFollowup=result?.completion_details?.followup_eligible===true;
    if(result?.state==='limited'){
     blockedScopes[scope]=result.completion_details;
     summaries.push('Saved '+scope+' research limitation reused.');continue;
    }
    if(result?.state==='ready'){
     await loadEvents();
     const added=Math.max(0,Number(result.added)||0);
     if(scope==='origin'&&added)historyFollowup=true;
     summaries.push(added+' '+scope+' milestone'+(added===1?'':'s')+' saved.');
    }else if(result?.state==='cached'){
     await loadEvents();
     summaries.push('Existing '+scope+' history reused.');
     // Cache hits are free; another missing scope may still need evidence.
    }else{
     summaries.push('Research status: '+String(result?.state||'unavailable')+'.');
     break;
    }
   }
   await loadCompletionStatus(completedRunIds);
   await loadEvents();
   // Photo selection is the existing authorized part of completion.
   // It never generates historical milestones or adds
   // to the $0.15 research-generation estimate.
   if(photoMount&&allVerified.length){
    const initial=await photoMount.refresh();
    photoMissing=Math.max(0,Number(initial?.missing||0))+Math.max(0,Number(initial?.duplicates||0));
    if(needsPhotoWork()){
     showResearchFeedback('Company history checked. Finding distinct business photographs for missing cards…');
     const photoResult=await photoMount.fillMissing({includeBrand:brandPhotoPending});
     await loadCompletionStatus();
     const coverage=await photoMount.refresh();
     photoMissing=Math.max(0,Number(coverage?.missing||0))+Math.max(0,Number(coverage?.duplicates||0));
     summaries.push(photoMissing===0?'Photo coverage complete.':
      photoMissing+' image slot'+(photoMissing===1?'':'s')+' still awaiting source photos.');
     if(photoResult?.error)summaries.push('Image provider request could not finish.');
     else if(!photoResult?.branded_photos)summaries.push('No suitable branded photographs found; business illustrations retained.');
    }
   }
   showResearchFeedback(summaries.join(' ')+
    ' Estimated history research cost this click: $'+spent.toFixed(5)+
    ' / $0.15. '+allVerified.length+' sourced milestones saved.'+
    (researchNeed()==='none'&&photoMissing===0&&!brandPhotoPending?' Timeline complete.':
     ' Timeline incomplete: '+(!hasCurrentYear()?'no verified '+year()+' event; ':'')+(!hasOrigin()?'founding evidence missing; ':'')+(allVerified.length<initialHistoryGoal?'starter history has '+allVerified.length+' of approximately 10 events; ':'')+(photoMissing?photoMissing+' photographs unavailable.':'')+(limitationText()?' '+limitationText()+'. Saved results retained; refresh will not restart paid research.':'')));
  }finally{
   discoveryPending=false;
  }
 }
 // Cached history always displays; consented researchers automatically fill what is missing.
 await loadEvents();
 // Cached histories and existing photo repairs should work immediately
 // without relying on the old manual Living Timeline toggle.
 await checkHistoryPermission();
 requestAnimationFrame(()=>{
  fitRailEdges();
  drawHistoryTrack();
  const middle=Math.floor((data.length-1)/2);
  const initialIndex=mobileLayout.matches?0:middle;
  const card=rail.querySelector('.orca-timeline-event[data-index="'+initialIndex+'"]');
  if(card)centerMilestone(card,'auto');
  updateMobileProgress();
 });
 try{
  const module=await import('./orca-timeline-photos.js?v=hybrid-photos-v23');
  photoMount=await module.mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute:()=>historyAuthorized});
  await loadCompletionStatus();
  if(limitationText())showResearchFeedback(status.textContent+' · '+limitationText()+'. Saved results retained; refresh will not restart paid research.');
  const coverage=photoMount.getCoverage();
  photoMissing=Math.max(0,Number(coverage?.missing||0))+Math.max(0,Number(coverage?.duplicates||0));
 }catch(error){console.warn('Optional history photography is unavailable',error);await loadCompletionStatus()}
 // Reuse the existing capped history/photo routine once, after verified status.
 // No new APIs, anonymous calls, or billable retries on failed status checks.
 if(getUser()&&historyAuthorized&&completionStatusHealthy&&mayRequestHistory()){
  void maybePopulateCompanyHistory().catch(error=>{
   console.warn('Automatic timeline completion unavailable',error);
   showResearchFeedback('Automatic history completion unavailable. Saved milestones remain available.');
  });
 }
 const poll=setInterval(()=>{if(document.visibilityState==='visible')loadEvents()},60000);
 window.addEventListener('pagehide',()=>{stopBeam();clearInterval(poll)},{once:true});
}
