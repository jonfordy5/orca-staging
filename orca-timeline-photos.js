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
// Optional visual layer for ORCA's sourced company milestones. Research remains unchanged.
export async function mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute}){
 const nav=frame.querySelector('.orca-timeline-navigation');
 if(!nav)return;
 const button=document.createElement('button');
 button.type='button';button.textContent='Find photos';button.className='orca-photo-fill';
 button.title='Find company-first illustrative photos. Replace weak cached images without changing research.';
 button.hidden=!(getUser()&&canContribute());
 nav.append(button);
 const notice=document.createElement('p');
 notice.className='orca-photo-notice';notice.hidden=true;
 notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 nav.after(notice);
 const showNotice=text=>{notice.textContent=text;notice.hidden=!text;status.textContent=text};
 let photos=new Map();
 let autoRepairAttempted=false;
 let duplicateCount=0;
 let remainingPhotos=0;
 let actionPending=false;
 function updatePhotoAction(){
  const needsAction=duplicateCount>0||remainingPhotos>0;
  // A finished timeline should show its photos, not a disabled "Photos ready" button.
  button.hidden=!needsAction||!(getUser()&&canContribute());
  button.disabled=actionPending;
  if(!actionPending)button.textContent=duplicateCount>0?'Improve photos':'Find photos';
 }
 async function refresh(){
  const data=[];
  for(let offset=0;;offset+=250){
   const {data:page,error}=await sb.from('orca_timeline_photo_selections')
    .select('event_id,photo_id,image_url,full_image_url,photo_url,photographer,photographer_url,needs_review,strategy_version,match_type')
    .eq('ticker',ticker).range(offset,offset+249);
   if(error){button.hidden=true;return}
   data.push(...(page||[]));
   if(!page||page.length<250)break;
  }
  // Keep existing flagged illustrations visible while seeking better images:
  // never turn a completed full-photo card into a white placeholder.
  const rawPhotos=new Map((data||[]).map(p=>[p.event_id,p]));
  // Do not visually reproduce the same image across many event cards.
  // Old flagged duplicates remain available for repair, but are not
  // misrepresented as ten different photographs to public visitors.
  const seen=new Set(),visibleCards=Array.from(rail.querySelectorAll('button[data-event-id]'));
  photos=new Map();
  for(const card of visibleCards){
   const p=rawPhotos.get(card.dataset.eventId);
   if(!p?.image_url||!p.photo_id||seen.has(p.photo_id))continue;
   seen.add(p.photo_id);
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
   const fallback=fallbackPool.find(p=>!seen.has(p.photo_id));
   if(!fallback)continue;
   seen.add(fallback.photo_id);
   photos.set(card.dataset.eventId,{...fallback,temporary:true});
  }
  const ids=usablePhotos.map(p=>{
   try{return new URL(p.photo_url).pathname}catch{return p.image_url||''}
  });
  duplicateCount=ids.length-new Set(ids).size;
  duplicateCount+=visiblePhotos.filter(p=>p.needs_review).length;
  const related=visiblePhotos.filter(p=>/woman-holding.*product.*store|woman-holding.*skincare.*beauty-store/.test(p.photo_url||''));
  if(related.length>1&&new Set(related.map(p=>p.photographer)).size===1)duplicateCount=Math.max(1,duplicateCount);
  if(ticker==='ULTA'&&visiblePhotos.some(p=>(p.photo_url||'').includes('SeKYOXD_Jac')))duplicateCount=Math.max(1,duplicateCount);
  updatePhotoAction();
  for(const card of rail.querySelectorAll('button[data-event-id]')){
   const p=photos.get(card.dataset.eventId);
   if(!p){
    // Previously duplicated images must disappear when a better candidate
    // has not yet been retrieved; the existing dark card remains readable.
    const slot=card.querySelector('.orca-timeline-event-media');
    if(slot?.querySelector('img')){
     slot.replaceChildren(document.createTextNode('◆'));
     slot.classList.remove('orca-history-thumb');
    }
    card.querySelector('.orca-photo-context')?.remove();
    continue;
   }
   const existing=card.querySelector('.orca-photo-image');
   // Clear old photo context label; the image credit is retained in details.
   card.querySelector('.orca-photo-context')?.remove();
   if(existing&&existing.dataset.photoUrl===p.image_url)continue;
   const slot=card.querySelector('.orca-timeline-event-media');
   if(!slot||(!existing&&slot.querySelector('img')))continue;
   const original=existing?'◆':slot.textContent;
   const img=document.createElement('img');img.className='orca-photo-image';
   img.dataset.photoUrl=p.image_url;img.src=p.image_url;img.alt='Illustrative photography, not the historical event';img.loading='lazy';
   img.addEventListener('error',()=>{slot.textContent=original;slot.classList.remove('orca-history-thumb')},{once:true});
   slot.replaceChildren(img);slot.classList.add('orca-history-thumb');
   card.title=(p.temporary?'Temporary company illustration · ':p.needs_review?'Illustrative photo awaiting improvement · ':'Illustrative photo · ')+
    'Photo by '+p.photographer+' on Unsplash.';
  }
 }
 async function fillPhotos(){
  if(actionPending||!getUser()||!canContribute()||!(remainingPhotos>0||duplicateCount>0))return;
  actionPending=true;button.disabled=true;button.textContent='Finding…';
  try{
   const {data,error}=await sb.functions.invoke('orca-timeline-photo-fill',{body:{ticker,improve:duplicateCount>0}});
   if(error){
    let detail={};
    try{detail=await error.context?.json()||{}}catch{}
    showNotice(photoFailureMessage(detail));
    return;
   }
   await refresh();
   const saved=Number(data?.added||0);
   const left=Number(data?.remaining||0);
   const statusInfo=Number.isInteger(data?.provider_http_status)?
    ' Unsplash HTTP '+data.provider_http_status+
    (Number.isInteger(data?.provider_rate_remaining)?', remaining '+data.provider_rate_remaining:'')+'.':'';
   showNotice(saved>0?saved+' illustrative photo'+(saved===1?'':'s')+' saved.'+(left?' '+left+' events remain.':'')+statusInfo:
    data?.state==='cached'?'All featured milestones have cached photographs.':
    data?.state==='save_failed'?'ORCA found potential images, but the photo database rejected the save. No historical research changed.':
    data?.state==='provider_error'?'Unsplash provider error.'+statusInfo:
    data?.state==='rate_limited'?'Unsplash rate limit reached.'+statusInfo:
    'No sufficiently relevant photos found.'+statusInfo+' Existing imagery is unchanged.');
  }catch{showNotice(photoFailureMessage())}
  finally{actionPending=false;updatePhotoAction()}
 }
 button.addEventListener('click',()=>void fillPhotos());
 rail.addEventListener('click',event=>{
  const card=event.target.closest?.('button[data-event-id]');
  if(!card)return;
  const p=photos.get(card.dataset.eventId);
  if(!p)return;
  const popup=frame.querySelector('.orca-history-popover');
  if(!popup)return;
  const credit=document.createElement('small');credit.className='orca-photo-attribution';
  const link=(url,text)=>{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=text;return a};
  credit.append('Illustrative photo · Photo by ',link(p.photographer_url,p.photographer),' on ',link('https://unsplash.com/?utm_source=ai_stock_commons_orca&utm_medium=referral','Unsplash'));
  popup.append(credit);
 },false);
 async function refreshAndMaybeFill(){
  await refresh();
  // With an opted-in researcher present, repair a stock page once per
  // browser session. Public anonymous visits NEVER spend API quota.
  if(autoRepairAttempted||!getUser()||!canContribute()||
     !(duplicateCount>0||remainingPhotos>0))return;
  autoRepairAttempted=true;
  try{
   const key='orca-auto-photo-repair-v11:'+ticker;
   const previous=Number(sessionStorage.getItem(key)||0);
   if(Date.now()-previous<6*60*60*1000)return;
   sessionStorage.setItem(key,String(Date.now()));
  }catch{ /* Session storage is optional; the in-memory guard still applies. */ }
  await fillPhotos();
 }
 await refreshAndMaybeFill();
 return {refresh:refreshAndMaybeFill};
}
