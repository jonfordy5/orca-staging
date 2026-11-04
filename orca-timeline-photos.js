// Optional visual layer for ORCA's sourced company milestones. Research remains unchanged.
export async function mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute}){
 const nav=frame.querySelector('.orca-timeline-navigation');
 if(!nav)return;
 const button=document.createElement('button');
 button.type='button';button.textContent='Find photos';button.className='orca-photo-fill';
 button.title='Find rights-cleared historical images. Unverified or unrelated photos will not be selected.';
 button.hidden=!(getUser()&&canContribute());
 nav.append(button);
 let photos=new Map();
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
  const {data,error}=await sb.from('orca_timeline_photo_selections')
   .select('event_id,image_url,full_image_url,photo_url,photographer,photographer_url,needs_review,strategy_version,source_type,source_page_url,creator,license_name,license_url,attribution_text,rights_status,match_type,relevance_score,image_title').eq('ticker',ticker).limit(500);
  if(error){button.hidden=true;return;}
  // Never display photos flagged as misleading: keep cached records for audit,
  // but show a clean card until an appropriate replacement has been selected.
  const rawPhotos=new Map((data||[]).map(p=>[p.event_id,p]));
  photos=new Map((data||[]).filter(p=>!p.needs_review&&(p.source_type==='unsplash_legacy'||(p.rights_status==='reuse_verified'&&p.license_url))).map(p=>[p.event_id,p]));
  const visibleCards=Array.from(rail.querySelectorAll('button[data-event-id]'));
  for(const card of visibleCards){
   if(!rawPhotos.get(card.dataset.eventId)?.needs_review)continue;
   const slot=card.querySelector('.orca-timeline-event-media');
   if(slot){slot.replaceChildren(document.createTextNode('◆'));slot.classList.remove('orca-history-thumb');}
   card.title='This milestone photo is awaiting a relevant replacement.';
  }
  const visiblePhotos=visibleCards.map(card=>rawPhotos.get(card.dataset.eventId)).filter(Boolean);
  remainingPhotos=visibleCards.filter(card=>!rawPhotos.has(card.dataset.eventId)).length;
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
   img.dataset.photoUrl=p.image_url;img.src=p.image_url;img.alt=p.match_type==='exact_event'?'Historical photograph of the event':p.match_type==='exact_subject'?'Licensed photo of an event subject':'Contextual illustrative photograph, not the historical event';img.loading='lazy';
   img.addEventListener('error',()=>{slot.textContent=original;slot.classList.remove('orca-history-thumb')},{once:true});
   slot.replaceChildren(img);slot.classList.add('orca-history-thumb');
   card.title=(p.match_type==='exact_subject'?'Licensed subject photograph':'Illustrative photograph')+' · '+(p.creator||p.photographer)+(p.license_name?' · '+p.license_name:'');
  }
 }
 button.addEventListener('click',async()=>{
  if(button.hidden||actionPending||!getUser()||!canContribute())return;
  actionPending=true;button.disabled=true;button.textContent='Finding…';
  try{
   const {data,error}=await sb.functions.invoke('orca-timeline-photo-fill',{body:{ticker,improve:duplicateCount>0}});
   if(error)throw error;
   await refresh();
   const saved=Number(data?.added||0);
   const left=Number(data?.remaining||0);
   status.textContent=saved>0?saved+' company-relevant photo'+(saved===1?'':'s')+' saved.'+(left?' '+left+' event'+(left===1?'':'s')+' still need better photos.':'')+' Research sources unchanged.':
    data?.state==='cached'?'Photographs are already cached. No changes needed.':'No rights-verified matching image found; text-only cards retained.';
  }catch{status.textContent='Unable to select photos right now; existing timeline is unchanged.'}
  finally{actionPending=false;updatePhotoAction()}
 });
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
   const kind=p.match_type==='exact_event'?'Event photo':p.match_type==='exact_subject'?'Subject photograph':'Contextual photograph';
   credit.append(kind+' · ',link(p.source_page_url||p.photo_url,p.creator||p.photographer),
    ' · ',link(p.license_url,p.license_name||'License'),' · ',link(p.source_page_url||p.photo_url,'Wikimedia Commons'));
  }else if(p.source_type==='official_press'||p.source_type==='flickr_cc'){
   credit.append((p.match_type==='exact_event'?'Event image':'Contextual image')+' · ',
    link(p.source_page_url||p.photo_url,p.creator||p.photographer),
    ' · ',link(p.license_url,p.license_name||'Reuse license'));
  }else{
   credit.append('Illustrative photo · Photo by ',link(p.photographer_url,p.photographer),
    ' on ',link('https://unsplash.com/?utm_source=ai_stock_commons_orca&utm_medium=referral','Unsplash'));
  }
  popup.append(credit);
 },false);
 await refresh();
 return {refresh};
}
