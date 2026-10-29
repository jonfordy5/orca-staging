import { renderAutomaticCompanyProfile, renderUnifiedCompanyProfile } from './orca-auto-company-profile.js';
import { getCompanySize } from './orca-company-size.js';
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
  await renderAutomaticCompanyProfile(root,ticker,sb);
  return;
 }
 const metrics=await getCompanySize(ticker,data.name,{source:'https://en.wikipedia.org/wiki/Rocket_Lab'}).catch(()=>({}));
 renderUnifiedCompanyProfile(root,ticker,{
  metrics,name:data.name,description:data.summary,mission:data.mission,missionHeading:'Mission',
  headquarters:data.headquarters,headquartersAddress:data.headquartersAddress,
  founded:data.founded,founderCEO:data.founderCEO,listing:data.exchange+' · '+ticker,
  operations:data.operations,businessLines:data.businessLines,
  businessSource:data.businessSource,businessSourceLabel:'Company filings',
  investorFocus:data.investorFocus,
  logo:{url:data.logo,alt:data.name+' official company logo',caption:'Official company logo'},
  photo:{url:data.activityPhoto,source:data.activityPhotoSource,alt:data.activityPhotoAlt,
    caption:data.activityPhotoCaption,credit:'Photo © '+data.name},
  links:[{label:'Official website',url:data.officialSite},...data.sources.map(s=>({label:s.label,url:s.url}))],
  sourceNote:'Company facts sourced from Rocket Lab and its investor relations materials.'
 });
}
