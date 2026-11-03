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
 async function refresh(){
  const {data,error}=await sb.from('orca_timeline_photo_selections')
   .select('event_id,image_url,full_image_url,photo_url,photographer,photographer_url,needs_review,strategy_version').eq('ticker',ticker).limit(500);
  if(error)return;
  photos=new Map((data||[]).map(p=>[p.event_id,p]));
  const allEvents=rail.querySelectorAll('button[data-event-id]').length;
  remainingPhotos=Math.max(0,allEvents-photos.size);
  const ids=(data||[]).map(p=>new URL(p.photo_url).pathname);
  duplicateCount=ids.length-new Set(ids).size;
  const needsReview=(data||[]).filter(p=>p.needs_review).length;
  duplicateCount+=needsReview;
  const badMatch=(data||[]).some(p=>ticker==='ULTA'&&(p.photo_url||'').includes('SeKYOXD_Jac'));
  if(badMatch)duplicateCount=Math.max(1,duplicateCount);
  button.textContent=duplicateCount>0?'Improve photos':remainingPhotos>0?'Find photos':'Photos ready';
  button.disabled=duplicateCount===0&&remainingPhotos===0;
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
   card.title='Illustrative stock photograph. Photo by '+p.photographer+' on Unsplash.';
  }
 }
 button.addEventListener('click',async()=>{
  if(!getUser()||!canContribute())return;
  button.disabled=true;button.textContent='Finding…';
  try{
   const {data,error}=await sb.functions.invoke('orca-timeline-photo-fill',{body:{ticker,improve:duplicateCount>0}});
   if(error)throw error;
   await refresh();
   const saved=Number(data?.added||0);
   const left=Number(data?.remaining||0);
   status.textContent=saved>0?saved+' company-relevant photo'+(saved===1?'':'s')+' saved.'+(left?' '+left+' event'+(left===1?'':'s')+' still need better photos.':'')+' Research sources unchanged.':
    data?.state==='cached'?'Photographs are already cached. No changes needed.':'No suitable replacement found; existing photographs preserved.';
  }catch{status.textContent='Unable to select photos right now; existing timeline is unchanged.'}
  finally{button.disabled=duplicateCount===0&&remainingPhotos===0;button.textContent=duplicateCount>0?'Improve photos':remainingPhotos>0?'Find photos':'Photos ready'}
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
  credit.append('Illustrative photo · Photo by ',link(p.photographer_url,p.photographer),' on ',link('https://unsplash.com/?utm_source=ai_stock_commons_orca&utm_medium=referral','Unsplash'));
  popup.append(credit);
 },false);
 await refresh();
 return {refresh};
}
