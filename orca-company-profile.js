// Curated, source-backed company overviews for AI Stock Commons staging.
// Never infer a company identity from a ticker alone. Add other tickers only after checking sources.
const profiles=Object.freeze({
 RKLB:Object.freeze({
  name:'Rocket Lab Corporation',
  exchange:'Nasdaq',
  summary:'Rocket Lab is an end-to-end space company providing orbital launch services, spacecraft manufacturing, satellite components, and space software for commercial and government customers.',
  mission:'Open access to space to improve life on Earth.',
  headquarters:'Long Beach, California, United States',
  headquartersAddress:'3881 McGowen Street, Long Beach, CA 90808',
  founded:'2006',
  founderCEO:'Sir Peter Beck',
  operations:'Rocket Lab operates two main businesses: Launch Services and Space Systems. Together they let customers purchase a launch, a spacecraft, specialized components, or a combination of these services.',
  businessLines:[
   {name:'Launch Services',detail:'Rocket Lab launches satellites for commercial, civil and government customers, primarily using its Electron rocket. Customers can book dedicated missions or share a launch, with flexibility over timing and orbital destination. HASTE also provides suborbital test launches.'},
   {name:'Space Systems',detail:'This business builds complete spacecraft and supplies the hardware that makes satellites work—solar power systems, flight computers and software, radios, sensors, and other components. Those products can be sold even when the satellite launches on another company’s rocket.'},
   {name:'Where it is expanding',detail:'Neutron is a larger rocket still in development, designed for heavier spacecraft and satellite constellations. Its progress could open new opportunities, but testing, schedules, development costs, and customer demand remain important uncertainties.'}
  ],
  investorFocus:'Watch Electron launch cadence and reliability, Space Systems contract delivery and margins, and Neutron development milestones. These affect execution and long-term economics more than a single headline or launch photo.',
  businessSource:'https://investors.rocketlabcorp.com/static-files/57a8d0da-27ff-499c-8d85-18907743b7a8',
  logo:'https://rocketlabcorp.com/_resources/themes/base/production/images/admin_logo.png?m=1747131331',
  activityPhoto:'https://rocketlabcorp.com/assets/Uploads/IMG_8591_2.jpg',
  activityPhotoAlt:'Rocket Lab Electron rocket lifting off with a bright engine plume against the sky',
  activityPhotoCaption:'Electron launches an Earth-observation satellite · January 2026',
  activityPhotoSource:'https://rocketlabcorp.com/updates/mission-success-rocket-lab-launches-korean-earth-imaging-satellite-completes-2nd-launch-in-8-days/',
  officialSite:'https://rocketlabcorp.com/',
  sources:[
   {label:'Rocket Lab — About Us',url:'https://rocketlabcorp.com/about/about-us/'},
   {label:'Investor FAQs',url:'https://investors.rocketlabcorp.com/resources/investor-faqs'},
   {label:'Leadership',url:'https://rocketlabcorp.com/about/team/'}
  ]
 })
});
async function findPublicProfile(name){
 const title=name.replace(/\s+(Common Stock|Class [A-Z] Common Stock).*$/i,'').trim();
 const endpoint='https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title);
 const response=await fetch(endpoint,{headers:{'Accept':'application/json'}});
 if(!response.ok)return null;
 const data=await response.json();
 const a=title.toLowerCase().replace(/[^a-z0-9]/g,''),b=String(data.title||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(!a||!b||!(a===b||a.includes(b)||b.includes(a)))return null;
 if(!data.extract||String(data.extract).length<50)return null;
 return {description:String(data.extract).slice(0,900),source:data.content_urls?.desktop?.page||null};
}
async function sourcedCompanyPhoto(pageUrl){
 if(!pageUrl)return null;
 try{
  const title=decodeURIComponent(new URL(pageUrl).pathname.split('/').pop()).replace(/_/g,' ');
  const endpoint=new URL('https://en.wikipedia.org/w/api.php');
  for(const [key,value] of Object.entries({action:'query',format:'json',origin:'*',prop:'pageimages',piprop:'name',titles:title}))endpoint.searchParams.set(key,value);
  const result=await (await fetch(endpoint)).json();
  const imageName=Object.values(result.query?.pages||{})[0]?.pageimage;
  if(!imageName||/logo|icon|symbol|wordmark/i.test(imageName))return null;
  const api=new URL('https://commons.wikimedia.org/w/api.php');
  for(const [key,value] of Object.entries({action:'query',format:'json',origin:'*',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'600',titles:'File:'+imageName}))api.searchParams.set(key,value);
  const info=Object.values((await (await fetch(api)).json()).query?.pages||{})[0]?.imageinfo?.[0];
  const license=String(info?.extmetadata?.LicenseShortName?.value||'');
  if(!/CC BY|CC0|Public domain|PD-/i.test(license)||!info?.descriptionurl)return null;
  return {url:info.thumburl||info.url,source:info.descriptionurl,caption:imageName.replace(/_/g,' '),license};
 }catch{return null;}
}
const add=(parent,tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;parent.append(e);return e;};
export async function renderCompanyProfile(ticker,sb=null){
 const root=document.getElementById('company-profile');
 if(!root)return;
 root.replaceChildren();
 const data=profiles[ticker];
 if(!data){
  add(root,'p','company-eyebrow','NEW STOCK RESEARCH WORKSPACE');
  add(root,'h2','company-name',ticker);
  const displayName=add(root,'p','company-description','Retrieving registered company name…');
  const note=add(root,'p','sub','This company does not yet have a separately reviewed editorial profile. Its chart, research board and agent outlooks are available.');
  const next=add(root,'p','sub','No research assignments are created by simply visiting a stock. To contribute, join its team and explicitly request a metric.');
  const team=add(root,'a',null,'Join the '+ticker+' research team');
  team.href='./join-research.html?environment=orca-staging&ticker='+encodeURIComponent(ticker);
  if(!sb){displayName.textContent='Company listing lookup pending';return;}
  try{
   const {data:stock,error}=await sb.from('stocks').select('ticker,company_name').eq('ticker',ticker).maybeSingle();
   if(error)throw error;
   if(stock){
    displayName.textContent=String(stock.company_name||ticker);
    note.textContent='Registered stock · checking verified public company information…';
    try{
     const overview=await findPublicProfile(stock.company_name||ticker);
     if(overview){
      const mission=add(root,'div','company-mission');
      add(mission,'strong',null,'Mission / company focus');
      add(mission,'p',null,overview.description.split(/(?<=[.!?])\s/)[0]);
      add(root,'h3','company-auto-operations','What they do');
      add(root,'p','company-description',overview.description);
      add(root,'h3','company-auto-operations','How they do it');
      add(root,'p','company-description','For verified business segments, see original corporate filings and research findings.');
      if(overview.source){const source=add(root,'a',null,'Company profile source');source.href=overview.source;source.target='_blank';source.rel='noopener noreferrer';}
      const photo=await sourcedCompanyPhoto(overview.source);
      if(photo){
       const figure=add(root,'figure','company-activity-photo');
       const link=add(figure,'a');link.href=photo.source;link.target='_blank';link.rel='noopener noreferrer';
       const img=add(link,'img');img.src=photo.url;img.alt=photo.caption;img.loading='lazy';
       const credit=add(figure,'figcaption',null);credit.textContent=photo.caption+' · '+photo.license+' · ';
       const source=add(credit,'a',null,'Photo source');source.href=photo.source;source.target='_blank';source.rel='noopener noreferrer';
      }else add(root,'p','company-asof','A properly sourced company photograph was not available. No substitute image is shown.');
      note.textContent='Automatically sourced company profile; company focus is not a verified official mission statement.';
     }else note.textContent='No matching source-backed company overview was confirmed. Chart and research remain available.';
    }catch{note.textContent='Company source temporarily unavailable; no unverified profile will be shown.';}
   }else{
    displayName.textContent='Ticker not registered in ORCA';
    next.textContent='Search for a verified stock above to open its research workspace.';
    team.hidden=true;
   }
  }catch{
   displayName.textContent='Company name unavailable; ticker '+ticker;
   note.textContent='Stock directory could not be loaded. Refresh to verify this company before researching.';
  }
  return;
 }
 const head=add(root,'div','company-profile-grid');
 const content=add(head,'div','company-profile-copy');
 add(content,'p','company-eyebrow','ABOUT THE COMPANY');
 add(content,'h2','company-name',data.name);
 add(content,'p','company-description',data.summary);
 const mission=add(content,'div','company-mission');
 add(mission,'strong',null,'Mission');
 add(mission,'p',null,data.mission);
 const facts=add(content,'dl','company-facts');
 for(const [label,value] of [
  ['Headquarters',data.headquarters],
  ['Founded',data.founded],
  ['Founder & CEO',data.founderCEO],
  ['Listing',data.exchange+' · '+ticker]
 ]){
  const item=add(facts,'div','company-fact');
  add(item,'dt',null,label);add(item,'dd',null,value);
 }
 const work=add(content,'div','company-business');
 add(work,'strong',null,'What they do');
 add(work,'p',null,data.operations);
 if(Array.isArray(data.businessLines)&&data.businessLines.length){
  const breakdown=add(content,'section','company-business-breakdown');
  const heading=add(breakdown,'div','company-business-heading');
  add(heading,'h3',null,'How they do it');
  if(data.businessSource){
   const source=add(heading,'a',null,'Company filings');
   source.href=data.businessSource;source.target='_blank';source.rel='noopener noreferrer';
  }
  for(const item of data.businessLines){
   if(!item.name||!item.detail)continue;
   const part=add(breakdown,'div','company-business-line');
   add(part,'h4',null,item.name);
   add(part,'p',null,item.detail);
  }
 }
 if(data.investorFocus){
  const focus=add(content,'section','company-investor-focus');
  add(focus,'h3',null,'What investors watch');
  add(focus,'p',null,data.investorFocus);
 }
 const visual=add(head,'aside','company-visual');
 const frame=add(visual,'div','company-logo-frame');
 const fallback=add(frame,'span','company-logo-fallback',ticker);
 const logo=document.createElement('img');
 logo.src=data.logo;logo.alt=data.name+' official logo';logo.loading='lazy';logo.decoding='async';
 logo.referrerPolicy='no-referrer';
 logo.addEventListener('load',()=>{fallback.hidden=true;});
 logo.addEventListener('error',()=>{logo.hidden=true;fallback.hidden=false;});
 frame.append(logo);
 add(visual,'p','company-visual-caption','Official company logo');
 const hq=add(visual,'p','company-address');
 add(hq,'strong',null,'HQ: ');
 hq.append(document.createTextNode(data.headquartersAddress));
 const links=add(visual,'div','company-source-links');
 for(const item of [{label:'Official website',url:data.officialSite},...data.sources]){
  const a=add(links,'a',null,item.label);a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';
 }
 add(visual,'p','company-asof','Company facts sourced from Rocket Lab and its investor relations materials.');
 if(data.activityPhoto&&data.activityPhotoSource){
  const missionPhoto=add(visual,'figure','company-activity-photo');
  const imageLink=document.createElement('a');imageLink.href=data.activityPhotoSource;
  imageLink.target='_blank';imageLink.rel='noopener noreferrer';
  const photo=document.createElement('img');
  photo.src=data.activityPhoto;photo.alt=data.activityPhotoAlt||data.name+' at work';
  photo.loading='lazy';photo.decoding='async';photo.referrerPolicy='no-referrer';
  const unavailable=add(imageLink,'span','company-photo-unavailable','View a Rocket Lab launch photo on its official website');
  unavailable.hidden=true;
  photo.addEventListener('error',()=>{photo.hidden=true;unavailable.hidden=false;});
  imageLink.prepend(photo);missionPhoto.append(imageLink);
  const credit=add(missionPhoto,'figcaption',null);
  credit.textContent=(data.activityPhotoCaption||'Company operations')+' · Photo © '+data.name+'. ';
  const source=add(credit,'a',null,'Photo source');source.href=data.activityPhotoSource;
  source.target='_blank';source.rel='noopener noreferrer';
 }
}