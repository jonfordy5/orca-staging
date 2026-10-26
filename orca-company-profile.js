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
  operations:'Electron small-satellite launches • Spacecraft and satellite systems • Neutron medium-lift rocket (in development)',
  logo:'https://rocketlabcorp.com/_resources/themes/base/production/images/admin_logo.png?m=1747131331',
  officialSite:'https://rocketlabcorp.com/',
  sources:[
   {label:'Rocket Lab — About Us',url:'https://rocketlabcorp.com/about/about-us/'},
   {label:'Investor FAQs',url:'https://investors.rocketlabcorp.com/resources/investor-faqs'},
   {label:'Leadership',url:'https://rocketlabcorp.com/about/team/'}
  ]
 })
});
const add=(parent,tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;parent.append(e);return e;};
export function renderCompanyProfile(ticker){
 const root=document.getElementById('company-profile');
 if(!root)return;
 root.replaceChildren();
 const data=profiles[ticker];
 if(!data){
  add(root,'h2',null,'Company overview');
  add(root,'p','empty','A verified company profile has not yet been added for '+ticker+'. The chart and published research below remain available.');
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
}