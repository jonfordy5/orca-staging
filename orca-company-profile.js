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
    note.textContent='Registered public stock listing · detailed company profile pending independent source review. Chart and research are ready to explore.';
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