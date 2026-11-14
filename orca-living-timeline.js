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
 // One static antique-gold rail. Dust drifts around fixed local anchors;
 // there is no leading point, traveling stroke or sequential card activation.
 const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 const hoverPointer=window.matchMedia('(hover:hover) and (pointer:fine)');
 let dustFrame=0;
 let updateDustWindow=()=>{};
 function stopDust(){
  if(dustFrame)cancelAnimationFrame(dustFrame);
  dustFrame=0;
  updateDustWindow=()=>{};
 }
 function clearDustExcitement(){
  for(const stop of rail.querySelectorAll('.orca-history-excited'))
   stop.classList.remove('orca-history-excited');
 }
 function drawHistoryTrack(){
  stopDust();
  const spine=rail.querySelector('.orca-history-spine');
  if(!spine)return;
  spine.querySelector('.orca-history-track')?.remove();
  spine.querySelector('.orca-history-orbit')?.remove();
  // Mobile keeps its original swipe-only photo carousel.
  if(mobileLayout.matches)return;
  const stops=[...spine.querySelectorAll('.orca-history-stop')];
  if(!stops.length)return;
  const spineRect=spine.getBoundingClientRect();
  const stems=stops.map(stop=>stop.querySelector('.orca-history-stem').getBoundingClientRect());
  const points=stems.map(rect=>[
   Math.round(rect.left+rect.width/2-spineRect.left),
   Math.round(rect.bottom-spineRect.top)
  ]);
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
  svg.append(base);
  spine.append(svg);

  // Recycle a small viewport pool, even for an open-ended company archive.
  // Scroll/resize measures geometry; animation frames only update SVG attributes.
  const pitch=stops[0].offsetWidth;
  const spineInset=spineRect.left-rail.getBoundingClientRect().left+rail.scrollLeft;
  const poolSize=Math.min(stops.length,Math.ceil(rail.clientWidth/pitch)+2,18);
  const groups=Array.from({length:poolSize},()=>{
   const element=document.createElementNS(ns,'g');
   element.classList.add('orca-history-dust-group');
   element.dataset.excitement='0';
   const particles=Array.from({length:32},(_,i)=>{
    const circle=document.createElementNS(ns,'circle');
    circle.classList.add('orca-history-dust');
    circle.dataset.region=i<14?'rail':i<24?'connector':'card';
    circle.setAttribute('fill',i%7===0?'#ffedc1':'#d6b67d');
    element.append(circle);
    return {circle,x:0,y:0,phase:0,seed:0,extra:i%4===3};
   });
   svg.append(element);
   return {element,particles,index:-1,excitement:0};
  });
  // One reusable background layer belongs to the spine, NOT the hovered stop.
  // With z-index below every photo card, motes visible beyond the hovered photo
  // cannot paint over its neighbors. Two denser side ribbons fill the open gaps.
  const orbit=document.createElementNS(ns,'svg');
  orbit.classList.add('orca-history-orbit');
  orbit.setAttribute('viewBox','-235 0 470 300');
  orbit.setAttribute('aria-hidden','true');
  orbit.setAttribute('width','470');
  orbit.setAttribute('height','300');
  const perimeterCount=112,sideCount=28;
  const orbitMotes=Array.from({length:perimeterCount+sideCount*2},(_,i)=>{
   const mote=document.createElementNS(ns,'circle');
   mote.classList.add('orca-history-orbit-mote');
   const region=i<perimeterCount?'halo':i<perimeterCount+sideCount?'left-gap':'right-gap';
   const hue=i%41===0?'red':i%37===0?'green':'gold';
   mote.dataset.region=region;
   mote.dataset.hue=hue;
   mote.setAttribute('fill',hue==='red'?'#f47768':hue==='green'?'#80cc8f':
    (i%5===0?'#fff0b7':'#d9b775'));
   mote.setAttribute('opacity','0');
   orbit.append(mote);
   const seed=(i*0.61803398875+0.37)%1;
   return {mote,seed,angle:Math.PI*2*(i/perimeterCount),hue,region,
    sideFraction:region==='halo'?0:((i%sideCount+0.5)/sideCount)};
  });
  let orbitIntensity=0,orbitIndex=-1,orbitTime=0;
  const paintOrbit=(elapsed)=>{
   const active=groups.find(group=>group.index>=0&&
    stops[group.index].classList.contains('orca-history-excited'));
   const next=active?.index??-1;
   if(next>=0&&next!==orbitIndex){
    // offsetLeft is measured in spine coordinates; position never follows the
    // viewport or travels along the rail, only the currently hovered photo.
    const stop=stops[next];
    orbit.style.left=(stop.offsetLeft+stop.offsetWidth/2)+'px';
    if(!orbit.isConnected)spine.append(orbit);
    orbitIndex=next;orbitIntensity=0;
   }
   orbitIntensity+=(Number(next>=0)-orbitIntensity)*
    (1-Math.exp(-elapsed/(next>=0?0.20:0.31)));
   if(orbitIndex<0)return;
   if(orbitIntensity<0.006&&next<0){
    orbit.remove();orbitIndex=-1;
    return;
   }
   orbitTime+=elapsed;
   const card=stops[orbitIndex].querySelector('.orca-timeline-event');
   const centerY=card.offsetTop+card.offsetHeight/2;
   const bloom=0.23+0.77*Math.min(1,orbitIntensity*1.6);
   for(const {mote,seed,angle,hue,region,sideFraction} of orbitMotes){
    const shimmer=0.72+0.28*Math.sin(orbitTime*(3+seed*3)+seed*17);
    let x,y;
    if(region==='halo'){
     const rotation=angle+Math.sin(orbitTime*1.5+seed*14)*0.065;
     const radiusX=(card.offsetWidth/2+62+seed*50)*bloom;
     const radiusY=(card.offsetHeight/2+18+seed*13)*bloom;
     x=Math.cos(rotation)*radiusX+Math.sin(orbitTime*2+seed*12)*3;
     y=centerY+Math.sin(rotation)*radiusY+Math.cos(orbitTime*1.7+seed*9)*2;
    }else{
     // Concentrate motes in the ~20px gaps bordering the enlarged card;
     // the field begins behind the image then blossoms into those gaps.
     const spread=0.24+0.76*Math.min(1,orbitIntensity*1.6);
     const side=region==='left-gap'?-1:1;
     const offset=card.offsetWidth/2+6+seed*11;
     x=side*offset*spread+Math.sin(orbitTime*2.4+seed*12)*1.1;
     y=centerY+(sideFraction-0.5)*(card.offsetHeight-12)*spread+
      Math.cos(orbitTime*2+seed*9)*1.8;
    }
    const strength=hue==='gold'?(region==='halo'?0.40+0.36*seed:0.58+0.27*seed):0.34+0.20*seed;
    mote.setAttribute('cx',x.toFixed(2));
    mote.setAttribute('cy',y.toFixed(2));
    mote.setAttribute('r',(0.85+seed*1.05+Math.max(0,shimmer-0.7)*0.55).toFixed(2));
    mote.setAttribute('opacity',(orbitIntensity*strength*shimmer).toFixed(3));
   }
   orbit.dataset.excitement=orbitIntensity.toFixed(3);
  };
  const paint=(group,elapsed,staticDust)=>{
   const target=!staticDust&&hoverPointer.matches&&
    stops[group.index].classList.contains('orca-history-excited')?1:0;
   // Time-based easing keeps quick entries/exits smooth at any frame rate.
   group.excitement+=(target-group.excitement)*(1-Math.exp(-elapsed/(target?0.18:0.32)));
   const excitement=group.excitement;
   group.element.dataset.excitement=excitement.toFixed(3);
   for(const particle of group.particles){
    const {circle,seed}=particle;
    particle.phase+=elapsed*(0.55+seed*0.35+excitement*1.1);
    const phase=particle.phase;
    const driftX=staticDust?0:Math.sin(phase)*(1.6+excitement*5.2);
    const driftY=staticDust?0:Math.cos(phase*0.83+seed*8)*(1.8+excitement*4.6);
    const shimmer=staticDust?0.84:0.84+Math.sin(phase*1.3+seed*12)*0.16;
    // Extra motes fade in locally; no particles are allocated on hover.
    const strength=particle.extra?excitement*0.65:0.20+seed*0.20+excitement*0.40;
    circle.setAttribute('cx',(particle.x+driftX).toFixed(2));
    circle.setAttribute('cy',(particle.y+driftY).toFixed(2));
    circle.setAttribute('r',(0.8+seed*0.65+excitement*0.25).toFixed(2));
    circle.setAttribute('opacity',(strength*shimmer).toFixed(3));
   }
  };
  const assign=(group,index)=>{
   group.index=index;
   group.excitement=0;
   group.element.dataset.index=String(index);
   const [x,y]=points[index];
   const stemTop=stems[index].top-spineRect.top;
   const card=stops[index].querySelector('.orca-timeline-event');
   const cardHalf=card.offsetWidth/2;
   const railFrom=index?x-pitch/2:x;
   const railTo=index<stops.length-1?x+pitch/2:x;
   group.particles.forEach((particle,i)=>{
    // Independent deterministic seeds prevent synchronized sweeps or flashing.
    const seed=((index+1)*0.754877666+i*0.618033989)%1;
    const fraction=(i*0.381966011+index*0.141421356)%1;
    particle.seed=seed;particle.phase=seed*Math.PI*2;
    if(i<14){
     particle.x=railFrom+(railTo-railFrom)*fraction;
     particle.y=y+(seed-0.5)*12;
    }else if(i<24){
     particle.x=x+(seed-0.5)*12;
     particle.y=stemTop+(y-stemTop)*fraction;
    }else{
     particle.x=x+(fraction-0.5)*cardHalf*1.85;
     particle.y=stemTop+3+seed*5;
    }
    particle.circle.dataset.anchorX=particle.x.toFixed(2);
    particle.circle.dataset.anchorY=particle.y.toFixed(2);
   });
   paint(group,0,reducedMotion.matches);
  };
  updateDustWindow=()=>{
   const from=rail.scrollLeft-spineInset;
   const first=Math.max(0,Math.min(stops.length-poolSize,
    Math.floor((from-points[0][0])/pitch)));
   const wanted=new Set(Array.from({length:poolSize},(_,i)=>first+i));
   const available=groups.filter(group=>!wanted.has(group.index));
   for(const index of wanted){
    if(groups.some(group=>group.index===index))continue;
    assign(available.pop(),index);
   }
  };
  updateDustWindow();
  if(reducedMotion.matches||document.visibilityState==='hidden')return;
  let previousTime=0;
  const animate=now=>{
   if(!svg.isConnected||document.visibilityState==='hidden'){stopDust();return}
   const elapsed=previousTime?Math.min((now-previousTime)/1000,0.05):0;
   previousTime=now;
   for(const group of groups)paint(group,elapsed,false);
   paintOrbit(elapsed);
   dustFrame=requestAnimationFrame(animate);
  };
  dustFrame=requestAnimationFrame(animate);
 }
 function refreshDustPreferences(){
  clearDustExcitement();
  drawHistoryTrack();
 }
 reducedMotion.addEventListener('change',refreshDustPreferences);
 hoverPointer.addEventListener('change',refreshDustPreferences);
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
  updateDustWindow();
  if(!mobileLayout.matches||mobileScrollFrame)return;
  mobileScrollFrame=requestAnimationFrame(()=>{mobileScrollFrame=0;updateMobileProgress()});
 },{passive:true});
 window.addEventListener('resize',()=>{
  clearDustExcitement();
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
  if(document.visibilityState==='hidden'){clearDustExcitement();stopDust();}
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
  stopDust();
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
   card.addEventListener('pointerenter',event=>{
    if(event.pointerType!=='touch'&&hoverPointer.matches&&!mobileLayout.matches&&!reducedMotion.matches){
     clearDustExcitement();
     stop.classList.add('orca-history-excited');
    }
   });
   const calm=()=>stop.classList.remove('orca-history-excited');
   card.addEventListener('pointerleave',calm);
   card.addEventListener('pointercancel',calm);
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
 const pollEvents=()=>{if(document.visibilityState==='visible')loadEvents()};
 let poll=setInterval(pollEvents,60000);
 window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  fitRailEdges();drawHistoryTrack();
  clearInterval(poll);poll=setInterval(pollEvents,60000);
 });
 window.addEventListener('pagehide',event=>{
  clearDustExcitement();stopDust();cancelAnimationFrame(mobileScrollFrame);mobileScrollFrame=0;clearInterval(poll);
  // A cached page resumes with the same listeners and live motion preferences.
  if(!event.persisted){
   reducedMotion.removeEventListener('change',refreshDustPreferences);
   hoverPointer.removeEventListener('change',refreshDustPreferences);
  }
 });
}
