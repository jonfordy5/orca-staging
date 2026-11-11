// ORCA R6: read-only, owner-bound Guild Hall. NO task claims, publication,
// consent mutation, fabricated game awards, or background AI work.
import {selectSupabaseConfig,orcaStagingHref,showOrcaStagingIndicator} from './orca-staging-config.js';
import {metricDisplayParts} from './orca-metric-labels.js';

const $=id=>document.getElementById(id);
const TICKER=/^[A-Z][A-Z0-9.]{0,9}$/;
const requestedTicker=(new URLSearchParams(location.search).get('ticker')||'').trim().toUpperCase();
let sb=null,user=null,memberships=[],fetchingMission=0,ownerVersion=0;
let missionExpiryCancel=null,connectionExpiryCancel=null;
const isCurrent=(owner,version)=>user?.id===owner&&ownerVersion===version;
// Browser timeouts are signed 32-bit; recheck long leases instead of expiring
// an otherwise valid assignment early when the maximum timer delay is reached.
function atExpiry(deadline,callback){
 let timer=null,cancelled=false;
 const check=()=>{
  if(cancelled)return;
  const remaining=deadline-Date.now();
  if(remaining<=0){callback();return;}
  timer=setTimeout(check,Math.min(remaining+20,2147483647));
 };
 check();
 return ()=>{cancelled=true;clearTimeout(timer)};
}
const href=(path,ticker)=>orcaStagingHref(path,ticker&&TICKER.test(ticker)?{ticker}:{});
const setText=(id,text)=>{$(id).textContent=String(text)};
const show=(id,visible)=>{$(id).hidden=!visible};
const time=value=>{
 const dt=new Date(value||'');
 return Number.isFinite(dt.getTime())?dt.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not available';
};
const status=(text,kind='info')=>{
 const node=$('guild-status');node.textContent=text;node.dataset.kind=kind;
};
function permission(id,enabled,label){
 const node=$(id);
 node.textContent=label||(enabled===true?'ON':enabled===false?'OFF':'Unavailable');
 node.dataset.kind=enabled===true?'on':enabled===false?'off':'unknown';
}
function bindLinks(ticker){
 const valid=!!ticker&&TICKER.test(ticker);
 $('guild-open-workspace').href=valid?href('./research-workspace-staging.html',ticker):href('./index.html#discover');
 $('guild-open-workspace').textContent=valid?'Open '+ticker+' Workspace':'Explore registered companies';
 $('guild-launch-work').href=valid?href('./connect-work.html',ticker):href('./index.html#journey');
 $('guild-launch-work').textContent=valid?'Prepare ChatGPT Work Mission':'How research missions work';
 $('guild-join-team').href=valid?href('./join-research.html',ticker):href('./index.html#discover');
}
function renderTeamOptions(){
 const select=$('guild-ticker');select.replaceChildren();
 for(const m of memberships){
  const option=document.createElement('option');option.value=m.ticker;
  option.textContent=m.ticker+' · '+(m.display_name||'Your research team');select.append(option);
 }
 const first=memberships.find(m=>m.ticker===requestedTicker)||memberships[0];
 if(first){select.value=first.ticker;select.disabled=false;}
 else{
  const option=document.createElement('option');option.value='';
  option.textContent='No joined stock teams';select.append(option);select.disabled=true;
 }
 const count=memberships.length;
 setText('guild-count-teams',count);
 setText('guild-team-count',count+' team'+(count===1?'':'s'));
 bindLinks(first?.ticker||null);
}
async function getOwnerProfile(owner,version){
 try{
  const {data,error}=await sb.from('agent_profiles')
   .select('id,display_name,opted_in,independent_publish_enabled')
   .eq('owner_id',owner).maybeSingle();
  if(!isCurrent(owner,version))return;
  if(error)throw error;
  if(!data){
   setText('guild-profile-name','No agent profile yet');
   permission('guild-consent',null,'Not configured');
   permission('guild-publish-permission',null,'Not configured');
   permission('guild-connected',false,'Not connected');
   return;
  }
  setText('guild-profile-name',String(data.display_name||'Unnamed profile'));
  permission('guild-consent',data.opted_in,data.opted_in===true?'ON — approved':data.opted_in===false?'OFF — not authorized':'Unavailable');
  permission('guild-publish-permission',data.independent_publish_enabled,data.independent_publish_enabled===true?'ON — owner approved':data.independent_publish_enabled===false?'OFF':'Unavailable');
  if(data.opted_in!==true){permission('guild-connected',data.opted_in===false?false:null,data.opted_in===false?'Not connected':'Unavailable');return;}
  if(!data.id){permission('guild-connected',null,'Unavailable');return;}
  try{
   const {data:sessions,error:sessionError}=await sb.from('agent_sessions')
    .select('status,lease_expires_at').eq('agent_profile_id',data.id)
    .eq('status','connected').order('lease_expires_at',{ascending:false}).limit(5);
   if(!isCurrent(owner,version))return;
   if(sessionError||!Array.isArray(sessions))throw sessionError||new Error('Session data unavailable');
   const leaseEnd=Math.max(0,...sessions.filter(row=>row.status==='connected').map(row=>Date.parse(row.lease_expires_at)||0));
   const isConnected=leaseEnd>Date.now();
   permission('guild-connected',isConnected,isConnected?'Active lease':'Not connected');
   if(isConnected)connectionExpiryCancel=atExpiry(leaseEnd,()=>{
    if(isCurrent(owner,version))permission('guild-connected',false,'Lease expired');
   });
  }catch{
   if(!isCurrent(owner,version))return;
   permission('guild-connected',null,'Unavailable');
  }
 }catch{
  if(!isCurrent(owner,version))return;
  setText('guild-profile-name','Profile unavailable');
  for(const id of ['guild-consent','guild-publish-permission','guild-connected'])permission(id,null,'Unable to verify');
 }
}
async function getOwnerTeams(owner,version){
 try{
  // Page the owner-filtered query so a large team roster is never silently
  // presented as a complete total after a client/server row limit.
  const rows=[];
  let total=null;
  do{
   const {data,error,count}=await sb.from('stock_research_memberships')
    .select('ticker,display_name,joined_at',{count:'exact'}).eq('user_id',owner)
    .order('joined_at',{ascending:false}).order('ticker',{ascending:true}).range(rows.length,rows.length+99);
   if(!isCurrent(owner,version))return false;
   if(error||!Array.isArray(data)||!Number.isInteger(count)||count<0)throw error||new Error('Team total unavailable');
   if(total!==null&&count!==total)throw new Error('Team roster changed; refresh to verify');
   total=count;
   if(data.some(row=>!TICKER.test(String(row?.ticker||'')))||(!data.length&&rows.length<total))throw new Error('Team roster incomplete');
   rows.push(...data);
  }while(rows.length<total);
  if(rows.length!==total)throw new Error('Team total could not be reconciled');
  memberships=[...new Map(rows.map(row=>[row.ticker,row])).values()];
  renderTeamOptions();
  return true;
 }catch{
  if(!isCurrent(owner,version))return false;
  memberships=[];renderTeamOptions();setText('guild-team-count','Unavailable');setText('guild-count-teams','—');
  $('guild-ticker').options[0].textContent='Teams unavailable';
  return false;
 }
}
async function getOwnerPublications(owner,version){
 const list=$('guild-evidence-list');list.replaceChildren();
 try{
  // contributor_id is the authenticated owner UUID in commons_publish_finding.
  // Use an exact PostgREST count rather than a public alias or a page-sample count.
  const {data,error,count}=await sb.from('commons_research_findings')
   .select('id,ticker,research_area,published_at',{count:'exact'})
   .eq('contributor_id',owner).order('published_at',{ascending:false}).limit(8);
  if(!isCurrent(owner,version))return;
  if(error||!Array.isArray(data)||!Number.isInteger(count)||count<0)throw error||new Error('Owner total unavailable');
  setText('guild-count-publications',count);
  setText('guild-published-status',count===0
   ?'No owner-linked published findings yet. Complete an authorized research mission to begin your record.'
   :count+' published finding'+(count===1?'':'s')+' linked to your verified account. Recent entries:');
  for(const f of data){
   if(!TICKER.test(String(f.ticker||'')))continue;
   const li=document.createElement('li'),title=document.createElement('strong');
   const alias=metricDisplayParts(f.research_area).title;
   title.textContent=f.ticker+' · '+alias;li.append(title);
   const when=document.createElement('small');when.textContent='Published '+time(f.published_at)+' · '+String(f.research_area||'Research metric');li.append(when);
   const link=document.createElement('a');link.href=href('./research-workspace-staging.html',f.ticker);
   link.textContent='View sourced research on '+f.ticker+' →';li.append(link);list.append(li);
  }
 }catch{
  if(!isCurrent(owner,version))return;
  setText('guild-count-publications','—');
  setText('guild-published-status','Owner-linked publication totals are unavailable. Your existing research has not been changed.');
 }
}
function resetMission(){
 missionExpiryCancel?.();
 show('guild-mission-data',false);show('guild-mission-empty',false);show('guild-mission-loading',true);
 setText('guild-mission-loading','Checking your current owner-bound assignment…');
}
async function loadMission(ticker){
 const ticket=++fetchingMission;
 resetMission();bindLinks(ticker);
 if(!ticker||!TICKER.test(ticker)||!memberships.some(m=>m.ticker===ticker)){
  show('guild-mission-loading',false);
  show('guild-mission-empty',true);
  setText('guild-mission-empty','No research team selected. Explore a company and join its research team first. No assignment has been claimed.');
  return;
 }
 try{
  const {data:claim,error}=await sb.rpc('commons_my_claim',{p_ticker:ticker});
  if(ticket!==fetchingMission)return;
  if(error)throw error;
  if(!claim?.id){
   show('guild-mission-loading',false);show('guild-mission-empty',true);
   setText('guild-mission-empty','No active assignment is claimed for '+ticker+'. Open the research workspace to verify eligibility, then request a research mission if you choose.');
   return;
  }
  if(claim.ticker&&claim.ticker!==ticker)throw new Error('Assignment company mismatch');
  const expiry=Date.parse(claim.claimed_until||'');
  if(!Number.isFinite(expiry)||expiry<=Date.now()){
   show('guild-mission-loading',false);show('guild-mission-empty',true);
   setText('guild-mission-empty','The previous assignment lease is not current. Refresh the research workspace before working. No new claim was made.');
   return;
  }
  const {data:board,error:boardError}=await sb.rpc('orca_my_assigned_board',{p_task_id:claim.id});
  if(ticket!==fetchingMission)return;
  if(boardError||!board||board.task_id!==claim.id||typeof board.board_key!=='string'||!board.board_key.trim())throw boardError||new Error('Assigned board unverified');
  const realms={execution:"The King's Keep · Management",pricing:"The Vault · Earnings",positioning:"The Frontier · Positioning"};
  const original=String(claim.research_area||'Research metric');
  const label=metricDisplayParts(original).title;
  const realm=realms[board.board_key]||(String(board.board_label||board.board_key)+' · server assigned ('+board.board_key+')');
  setText('guild-mission-title',label);
  setText('guild-mission-ticker',ticker);
  setText('guild-mission-realm',realm);
  setText('guild-mission-metric',original);
  setText('guild-mission-deadline',time(claim.claimed_until));
  setText('guild-mission-question',String(claim.research_question||'Research question unavailable. Open the authorized workspace to verify it.'));
  setText('guild-mission-badge','Active · Owner-verified mission');
  show('guild-mission-loading',false);show('guild-mission-data',true);
  missionExpiryCancel=atExpiry(expiry,()=>{
   if(ticket!==fetchingMission)return;
   show('guild-mission-data',false);show('guild-mission-empty',true);
   setText('guild-mission-empty','This assignment lease has expired. Open the research workspace to verify the current assignment.');
  });
 }catch{
  if(ticket!==fetchingMission)return;
  show('guild-mission-loading',false);show('guild-mission-empty',true);
  setText('guild-mission-empty','ORCA could not verify your active assignment and research board. Open the original stock workspace to refresh and check your permissions. No claim or publication was attempted.');
 }
}
function clearPrivateView(){
 ownerVersion++;fetchingMission++;
 missionExpiryCancel?.();connectionExpiryCancel?.();
 user=null;memberships=[];
 show('guild-dashboard',false);
 $('guild-evidence-list').replaceChildren();
 renderTeamOptions();resetMission();setText('guild-mission-empty','');
 for(const id of ['guild-profile-name','guild-team-count','guild-count-teams','guild-count-publications',
  'guild-mission-title','guild-mission-ticker','guild-mission-realm','guild-mission-metric','guild-mission-deadline','guild-mission-question'])setText(id,'—');
 for(const id of ['guild-consent','guild-publish-permission','guild-connected'])permission(id,null,'Checking');
 setText('guild-published-status','Checking your recorded publications…');
}
async function loadVerifiedOwner(){
 clearPrivateView();
 const version=ownerVersion;
 show('guild-locked',false);
 status('Checking your ORCA account and researcher permissions…');
 try{
  const {data,error}=await sb.auth.getUser();
  if(version!==ownerVersion)return;
  if(error&&error.name!=='AuthSessionMissingError')throw error;
  user=data?.user||null;
  if(!user){
   status('Browse research freely, or sign in to view your own Guild Hall.');
   show('guild-locked',true);return;
  }
  const owner=user.id;
  show('guild-dashboard',true);
  status('Signed in. Checking your owner-linked research profile and assignments…');
  const teams=await Promise.all([getOwnerProfile(owner,version),getOwnerTeams(owner,version),getOwnerPublications(owner,version)]);
  if(!isCurrent(owner,version))return;
  const selected=$('guild-ticker').value;
  if(selected&&TICKER.test(selected))await loadMission(selected);
  else{
   await loadMission(null);
   if(teams[1]===false)setText('guild-mission-empty','Team membership could not be verified; personal assignments are unavailable. No research was changed.');
  }
  if(!isCurrent(owner,version))return;
  status('Guild Hall ready · Read-only profile and mission overview. All publishing stays inside your authorized research workspace.','success');
 }catch{
  if(version!==ownerVersion)return;
  clearPrivateView();
  status('ORCA could not verify your account session. No permissions, assignments or research have changed. Sign in again or refresh.','error');
  show('guild-locked',true);
 }
}
async function initialize(){
 showOrcaStagingIndicator();
 $('guild-sign-in').href=href('./account.html?returnTo=guild-hall.html');
 bindLinks(null);
 try{
  const {projectUrl,publishableKey}=await selectSupabaseConfig();
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  sb=createClient(projectUrl,publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  // Hide owner data synchronously on a cross-tab sign-out/account change. Any
  // Auth API refresh runs outside this callback to avoid the auth lock.
  sb.auth.onAuthStateChange((event,session)=>{
   if(event==='SIGNED_OUT'){
    clearPrivateView();show('guild-locked',true);
    status('Signed out. Sign in to view your own Guild Hall.');
   }else if(event==='SIGNED_IN'&&session?.user?.id!==user?.id){
    clearPrivateView();
    setTimeout(()=>void loadVerifiedOwner(),0);
   }
  });
  await loadVerifiedOwner();
 }catch{
  clearPrivateView();
  status('ORCA could not verify your account session. No permissions, assignments or research have changed. Sign in again or refresh.','error');
  show('guild-locked',true);
 }
}
$('guild-ticker').addEventListener('change',()=>void loadMission($('guild-ticker').value));
void initialize();
