// Optional visual layer for ORCA's sourced company milestones. Research remains unchanged.
export async function mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute}){
 const nav=frame.querySelector('.orca-timeline-navigation');
 if(!nav)return;
 const button=document.createElement('button');
 button.type='button';button.textContent='Find photos';button.className='orca-photo-fill';
 button.title='Find company-first illustrative photos. Replace weak cached images without changing research.';
 button.hidden=!(getUser()&&canContribute());
 nav.append(button);
 let photos=new Map();
 let duplicateCount=0;
 let remainingPhotos=0;
 let actionPending=false;
 let autoFillAttempted=false;
 function updatePhotoAction(){
  const needsAction=duplicateCount>0||remainingPhotos>0;
  // A finished timeline should show its photos, not a disabled "Photos ready" button.
  button.hidden=!needsAction||!(getUser()&&canContribute());
  button.disabled=actionPending;
  if(!actionPending)button.textContent=duplicateCount>0?'Improve photos':'Find photos';
 }
 async function refresh(){
  const {data,error}=await sb.from('orca_timeline_photo_selections')
   .select('event_id,image_url,full_image_url,photo_url,photographer,photographer_url,needs_review,strategy_version').eq('ticker',ticker).limit(500);
  if(error){button.hidden=true;return;}
  // Keep existing flagged illustrations visible while seeking better images:
  // never turn a completed full-photo card into a white placeholder.
  const rawPhotos=new Map((data||[]).map(p=>[p.event_id,p]));
  photos=new Map(rawPhotos);
  const visibleCards=Array.from(rail.querySelectorAll('button[data-event-id]'));
  const visiblePhotos=visibleCards.map(card=>rawPhotos.get(card.dataset.eventId)).filter(Boolean);
  remainingPhotos=visibleCards.filter(card=>!rawPhotos.has(card.dataset.eventId)).length;
  // Temporary images may only come from THIS ticker. Cross-company fallback was
  // displaying NVIDIA graphics and auto engines on Apple historical events.
  const fallbackPool=(data||[]).filter(p=>p.image_url&&p.photo_url&&p.photographer_url&&!p.needs_review);
  const fallbackIds=new Set();
  for(const [index,card] of visibleCards.entries()){
   if(photos.has(card.dataset.eventId)||!fallbackPool.length)continue;
   const choices=fallbackPool.filter(p=>!fallbackIds.has(p.photo_url));
   const fallback=(choices.length?choices:fallbackPool)[index%(choices.length||fallbackPool.length)];
   fallbackIds.add(fallback.photo_url);
   photos.set(card.dataset.eventId,{...fallback,temporary:true});
  }
  const ids=visiblePhotos.map(p=>{
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
   if(!p)continue;
   const existing=card.querySelector('.orca-photo-image');
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
   if(error)throw error;
   await refresh();
   const saved=Number(data?.added||0);
   const left=Number(data?.remaining||0);
   status.textContent=saved>0?saved+' company-relevant photo'+(saved===1?'':'s')+' saved.'+(left?' '+left+' event'+(left===1?'':'s')+' still need better photos.':'')+' Research sources unchanged.':
    data?.state==='cached'?'All featured milestones have cached photographs.':'No new photos selected; existing imagery kept while broader searches are considered.';
  }catch{status.textContent='Unable to select photos right now; existing timeline is unchanged.'}
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
  // New history may be generated after initial mount. Run photo filling exactly once
  // per browser session when the first eligible sourced milestones appear.
  if(!autoFillAttempted&&(remainingPhotos>0||duplicateCount>0)&&getUser()&&canContribute()){
   autoFillAttempted=true;
   void fillPhotos();
  }
 }
 await refreshAndMaybeFill();
 return {refresh:refreshAndMaybeFill};
}
