// Optional visual layer for ORCA's sourced company milestones. Research remains unchanged.
export async function mountTimelinePhotos({sb,ticker,frame,rail,status,getUser,canContribute}){
 const nav=frame.querySelector('.orca-timeline-navigation');
 if(!nav)return;
 const button=document.createElement('button');
 button.type='button';button.textContent='Find photos';button.className='orca-photo-fill';
 button.title='Find up to three illustrative Unsplash photos. Research sources stay unchanged.';
 button.hidden=!(getUser()&&canContribute());
 nav.append(button);
 let photos=new Map();
 async function refresh(){
  const {data,error}=await sb.from('orca_timeline_photo_selections')
   .select('event_id,image_url,full_image_url,photo_url,photographer,photographer_url').eq('ticker',ticker).limit(500);
  if(error)return;
  photos=new Map((data||[]).map(p=>[p.event_id,p]));
  for(const card of rail.querySelectorAll('button[data-event-id]')){
   const p=photos.get(card.dataset.eventId);
   if(!p||card.querySelector('.orca-photo-image'))continue;
   const slot=card.querySelector('.orca-timeline-event-media');
   if(!slot||slot.querySelector('img'))continue;
   const original=slot.textContent;
   const img=document.createElement('img');img.className='orca-photo-image';
   img.src=p.image_url;img.alt='Illustrative photography, not the historical event';img.loading='lazy';
   img.addEventListener('error',()=>{slot.textContent=original;slot.classList.remove('orca-history-thumb')},{once:true});
   slot.replaceChildren(img);slot.classList.add('orca-history-thumb');
   card.title='Illustrative stock photograph. Photo by '+p.photographer+' on Unsplash.';
  }
 }
 button.addEventListener('click',async()=>{
  if(!getUser()||!canContribute())return;
  button.disabled=true;button.textContent='Finding…';
  try{
   const {data,error}=await sb.functions.invoke('orca-timeline-photo-fill',{body:{ticker}});
   if(error)throw error;
   await refresh();
   status.textContent=(data?.added||0)+' illustrative photographs selected and cached; research sources unchanged.';
  }catch{status.textContent='Unable to select photos right now; existing timeline is unchanged.'}
  finally{button.disabled=false;button.textContent='Find photos'}
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
