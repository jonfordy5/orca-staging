// Translate provider failures into useful, nontechnical timeline status.
export function photoFailureMessage(payload={}){
 if(payload.state==='daily_limit'||payload.error==='Photo-selection daily safety limit reached'){
  const date=new Date(payload.retry_at);
  const when=payload.retry_at&&Number.isFinite(date.getTime())?' Next capacity opens '+date.toLocaleString()+'.':'';
  const limit=Number.isInteger(payload.limit)&&payload.limit>0?payload.limit:300;
  return 'Photo selection paused: the shared '+limit+'-photo daily allowance is used.'+when+' Existing photos are unchanged.';
 }
 return payload.error==='Opted-in ORCA researcher required'?'Enable ORCA research consent to find timeline photos.':
  payload.error==='Invalid sign-in'||payload.error==='Sign in required'?'Sign in again to find timeline photos.':
  'Unable to select photos right now; existing timeline is unchanged.';
}
// Original vector fallback is generated locally from the ticker and event ID.
// It is explicitly artwork, never a sourced historical photo. This ensures
// every card has a distinctive dark cover even during CDN/API outages.
export function timelineIllustration(ticker,eventId,index=0){
 const seed=Array.from(String(ticker)+':'+String(eventId)).reduce((v,ch)=>((v*31+ch.charCodeAt(0))>>>0),2166136261);
 const hue=194+(seed%32),second=(hue+29+index%16)%360;
 const x=55+seed%230,y=38+(seed>>>5)%96;
 const symbol=String(ticker||'STOCK').replace(/[^A-Z0-9.]/gi,'').slice(0,7).toUpperCase()||'STOCK';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img" aria-label="Abstract company illustration">'+
 '<defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl('+hue+',56%,22%)"/><stop offset="1" stop-color="hsl('+second+',61%,10%)"/></linearGradient>'+
 '<radialGradient id="l"><stop stop-color="#67bfff" stop-opacity=".3"/><stop offset="1" stop-color="#67bfff" stop-opacity="0"/></radialGradient></defs>'+
 '<rect width="640" height="400" fill="url(#g)"/><circle cx="'+(x+190)+'" cy="'+(y+60)+'" r="260" fill="url(#l)"/>'+
 '<g fill="none" stroke="#b4e3ff" stroke-opacity=".21" stroke-width="3">'+
 '<path d="M-50 '+(y+70)+' L200 '+y+' L450 '+(y+115)+' L690 '+(y+25)+'"/>'+
 '<path d="M-40 '+(y+155)+' L220 '+(y+90)+' L430 '+(y+190)+' L690 '+(y+102)+'"/>'+
 '<circle cx="'+(350+seed%70)+'" cy="'+(75+index%55)+'" r="84"/></g>'+
 '<text x="38" y="105" font-family="system-ui,Arial,sans-serif" font-weight="800" font-size="65" letter-spacing="5" fill="#c9edff" opacity=".28">'+symbol+'</text>'+
 '<g opacity=".22"><circle cx="'+(520+seed%32)+'" cy="255" r="9" fill="#a7e5ff"/><circle cx="90" cy="250" r="5" fill="#a7e5ff"/></g>'+
 '</svg>';
 return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
// Optional visual layer for ORCA's sourced company milestones. Research remains unchanged.
export async function mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute}){
 const nav=frame.querySelector('.orca-timeline-navigation');
 if(!nav)return;
 // Photo selection is now exclusively triggered by Complete company timeline.
 // Keep one inert control reference for the existing internal status handling.
 const button=document.createElement('button');
 button.hidden=true;
 const notice=document.createElement('p');
 notice.className='orca-photo-notice';notice.hidden=true;
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 nav.after(notice);
 // Render photo feedback once, within the timeline; keep history status separate.
 const showNotice=text=>{notice.textContent=text;notice.hidden=!text};
 let photos=new Map();
 let duplicateCount=0;
 let remainingPhotos=0;
 let actionPending=false;
 function renderIllustration(card){
  const slot=card.querySelector('.orca-timeline-event-media');
  if(!slot)return;
  const img=document.createElement('img');
  img.className='orca-photo-image orca-generated-art';
  img.src=timelineIllustration(ticker,card.dataset.eventId,Number(card.dataset.index||0));
  img.alt='Original abstract illustration; not a historical photograph';
  img.loading='lazy';
  slot.replaceChildren(img);slot.classList.add('orca-history-thumb');
  card.title='Original ORCA decorative illustration. Historical event details are sourced separately.';
 }
 function updatePhotoAction(){button.hidden=true;button.disabled=actionPending;}
 function getCoverage(){
  return {missing:remainingPhotos,duplicates:Math.max(0,duplicateCount),
   saved:photos.size,total:rail.querySelectorAll('button[data-event-id]').length};
 }
 async function refresh(){
  const data=[];
  for(let offset=0;;offset+=250){
   const {data:page,error}=await sb.from('orca_timeline_photo_selections')
    .select('event_id,photo_id,image_url,full_image_url,photo_url,photographer,photographer_url,needs_review,strategy_version,match_type,source_type,source_page_url,license_name,license_url,attribution_text')
    .eq('ticker',ticker).range(offset,offset+249);
   if(error){button.hidden=true;return getCoverage()}
   data.push(...(page||[]));
   if(!page||page.length<250)break;
  }
  // Keep existing flagged illustrations visible while seeking better images:
  // never turn a completed full-photo card into a white placeholder.
  const rawPhotos=new Map((data||[]).map(p=>[p.event_id,p]));
  // Do not visually reproduce the same image across many event cards.
  // Old flagged duplicates remain available for repair, but are not
  // misrepresented as ten different photographs to public visitors.
  const originalKey=p=>{try{const u=new URL(p.full_image_url||p.image_url);return u.origin+u.pathname}catch{return p.image_url}};
  const seen=new Set(),seenUrls=new Set(),visibleCards=Array.from(rail.querySelectorAll('button[data-event-id]'));
  photos=new Map();
  for(const card of visibleCards){
   const p=rawPhotos.get(card.dataset.eventId);
   if(!p?.image_url||!p.photo_id||seen.has(p.photo_id)||seenUrls.has(originalKey(p)))continue;
   seen.add(p.photo_id);seenUrls.add(originalKey(p));
   photos.set(card.dataset.eventId,p);
  }
  const visiblePhotos=visibleCards.map(card=>rawPhotos.get(card.dataset.eventId)).filter(Boolean);
  const usablePhotos=visiblePhotos.filter(p=>!p.needs_review&&p.image_url);
  remainingPhotos=visibleCards.filter(card=>!photos.has(card.dataset.eventId)).length;
  // A temporary fallback can only use a DIFFERENT, verified photo
  // from this ticker. Never recycle the same image to fill empty cards.
  const fallbackPool=(data||[]).filter(p=>p.photo_id&&p.image_url&&p.photo_url&&p.photographer_url&&!p.needs_review);
  for(const card of visibleCards){
   if(photos.has(card.dataset.eventId))continue;
   const fallback=fallbackPool.find(p=>!seen.has(p.photo_id)&&!seenUrls.has(originalKey(p)));
   if(!fallback)continue;
   seen.add(fallback.photo_id);seenUrls.add(originalKey(fallback));
   photos.set(card.dataset.eventId,{...fallback,temporary:true});
  }
  duplicateCount=visiblePhotos.length-photos.size;
  updatePhotoAction();
  for(const card of rail.querySelectorAll('button[data-event-id]')){
   const p=photos.get(card.dataset.eventId);
   if(!p){
    // A distinct original SVG cover is always available without consuming
    // search quota. It is never counted as a sourced photograph.
    if(!card.querySelector('.orca-generated-art'))renderIllustration(card);
    card.querySelector('.orca-photo-context')?.remove();
    continue;
   }
   const existing=card.querySelector('.orca-photo-image');
   let badge=card.querySelector('.orca-photo-context');
   if(p.strategy_version>=7){
    if(!badge){badge=document.createElement('small');badge.className='orca-photo-context';card.append(badge)}
    badge.textContent='Illustrative photo · not the event';
   }
   if(existing&&existing.dataset.photoUrl===p.image_url)continue;
   const slot=card.querySelector('.orca-timeline-event-media');
   if(!slot||(!existing&&slot.querySelector('img')&&!slot.querySelector('.orca-generated-art')))continue;
   const original=existing?'◆':slot.textContent;
   const img=document.createElement('img');img.className='orca-photo-image';
   img.dataset.photoUrl=p.image_url;img.src=p.image_url;img.alt='Illustrative photography, not the historical event';img.loading='lazy';
   img.addEventListener('error',()=>{renderIllustration(card)},{once:true});
   slot.replaceChildren(img);slot.classList.add('orca-history-thumb');
   const provider=p.source_type==='wikimedia_commons'?'Wikimedia Commons':'Unsplash';
   card.title=(p.temporary?'Temporary company illustration · ':p.needs_review?'Illustrative photo awaiting improvement · ':'Illustrative photo · ')+
    'Image: '+p.photographer+' on '+provider+'.'+(p.license_name?' License: '+p.license_name+'.':'');
  }
  return getCoverage();
 }
 async function fillPhotos(){
  if(actionPending||!getUser()||!canContribute()||!(remainingPhotos>0||duplicateCount>0))
   return {added:0,skipped:true,...getCoverage()};
  actionPending=true;updatePhotoAction();
  try{
   const {data,error}=await sb.functions.invoke('orca-timeline-photo-fill',
    {body:{ticker,improve:duplicateCount>0}});
   if(error){
    let detail={};
    try{detail=await error.context?.json()||{}}catch{}
    showNotice(photoFailureMessage(detail));
    return {added:0,error:true,...getCoverage()};
   }
   await refresh();
   const saved=Math.max(0,Number(data?.added||0));
   const left=Math.max(0,Number(data?.remaining||0));
   showNotice(saved>0?saved+' illustrative photo'+(saved===1?'':'s')+' saved.'+
    (left?' '+left+' events remain.':''):
    data?.state==='cached'?'All timeline cards have saved photographs.':
    data?.state==='building'?'Photo selection is already underway.':
    data?.state==='rate_limited'?'Photo provider limit reached.':
    'No additional photographs could be saved.');
   return {added:saved,state:data?.state,...getCoverage()};
  }catch{
   showNotice(photoFailureMessage());
   return {added:0,error:true,...getCoverage()};
  }finally{actionPending=false;updatePhotoAction()}
 }
 async function fillMissing(){
  await refresh();
  return fillPhotos();
 }
 rail.addEventListener('click',event=>{
  const card=event.target.closest?.('button[data-event-id]');
  if(!card)return;
  const p=photos.get(card.dataset.eventId);
  if(!p)return;
  const popup=frame.querySelector('.orca-history-popover');
  if(!popup)return;
  const credit=document.createElement('small');credit.className='orca-photo-attribution';
  const link=(url,text)=>{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=text;return a};
  if(p.source_type==='wikimedia_commons'){
   credit.append('Illustrative photo · ',link(p.source_page_url||p.photo_url,p.photographer),' via ',
    link(p.source_page_url||p.photo_url,'Wikimedia Commons'));
   if(p.license_name&&p.license_url)credit.append(' · ',link(p.license_url,p.license_name));
  }else credit.append('Illustrative photo · Photo by ',link(p.photographer_url,p.photographer),' on ',link('https://unsplash.com/?utm_source=ai_stock_commons_orca&utm_medium=referral','Unsplash'));
  popup.append(credit);
 },false);
 async function refreshAndMaybeFill(){
  // Browsing never triggers an automatic API call.
  return refresh();
 }
 await refreshAndMaybeFill();
 return {refresh,fillMissing,getCoverage};
}
