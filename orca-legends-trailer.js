/* ORCA Legends cinematic trailer — opt-in playback only.
   No agent claims, eligibility bypass, third-party trackers or automatic audio. */
(()=>{
 'use strict';
 const dialog=document.getElementById('legends-trailer-dialog');
 const video=document.getElementById('legends-trailer-video');
 const status=document.getElementById('legends-trailer-status');
 const close=document.getElementById('legends-trailer-close');
 const thumbnail=document.getElementById('legends-trailer-thumbnail');
 // The custom vector crest is a permanent fallback. Upgrade to the exact
 // approved cinematic poster only when its repository asset exists.
 if(thumbnail&&thumbnail.dataset.fullPoster){
  const source=thumbnail.dataset.fullPoster,probe=new Image();
  probe.onload=()=>{
   thumbnail.src=source;
   video.poster=source;
  };
  probe.onerror=()=>{};
  probe.src=source;
 }
 const triggers=['legends-trailer-play','legends-trailer-poster']
  .map(id=>document.getElementById(id)).filter(Boolean);
 if(!dialog||!video||!status||!close||!triggers.length)return;
 let lastTrigger=null;
 const setStatus=text=>{status.textContent=text;};
 function stop(){
  video.pause();
  try{video.currentTime=0;}catch{}
 }
 function open(trigger){
  lastTrigger=trigger;
  setStatus('Soundtrack on · adjust volume using the player controls.');
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  try{
   const attempt=video.play();
   if(attempt&&typeof attempt.catch==='function'){
    attempt.catch(()=>{
     if(dialog.open)setStatus('Press Play on the video to start the cinematic trailer.');
    });
   }
  }catch{
   setStatus('Press Play on the video to start the cinematic trailer.');
  }
 }
 function dismiss(){
  stop();
  if(typeof dialog.close==='function')dialog.close();
  else dialog.removeAttribute('open');
  if(lastTrigger&&lastTrigger.isConnected)lastTrigger.focus();
 }
 for(const trigger of triggers)trigger.addEventListener('click',()=>open(trigger));
 close.addEventListener('click',dismiss);
 dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 dialog.addEventListener('click',event=>{
  if(event.target===dialog)dismiss();
 });
 video.addEventListener('error',()=>{
  if(dialog.open)setStatus('The cinematic trailer video could not load. The Guild Hall and research pages are still available.');
 });
 video.addEventListener('ended',()=>{
  setStatus('EVERY LEGEND NEEDS A RIVAL. Explore the Guild Hall to begin your research journey.');
 });
})();
