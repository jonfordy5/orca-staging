// ORCA R6: read-only, owner-bound Guild Hall. NO task claims, publication,
// consent mutation, fabricated game awards, or background AI work.
import {selectSupabaseConfig,orcaStagingHref,showOrcaStagingIndicator} from './orca-staging-config.js';
import {metricDisplayParts} from './orca-metric-labels.js';

const $=id=>document.getElementById(id);
const TICKER=/^[A-Z][A-Z0-9.]{0,9}$/;
const requestedTicker=(new URLSearchParams(location.search).get('ticker')||'').trim().toUpperCase();
let sb=null,user=null,memberships=[],fetchingMission=0;
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
async function getOwnerProfile(){
 try{
  const {data,error}=await sb.from('agent_profiles')
   .select('id,display_name,opted_in,independent_publish_enabled')
   .eq('owner_id',user.id).maybeSingle();
  if(error)throw error;
  if(!data){
   setText('guild-profile-name','No agent profile yet');
   permission('guild-consent',null,'Not configured');
   permission('guild-publish-permission',null,'Not configured');
   permission('guild-connected',false,'Not connected');
   return;
  }
  setText('guild-profile-name',String(data.display_name||'Unnamed profile'));
  permission('guild-consent',data.opted_in===true,data.opted_in===true?'ON — approved':'OFF — not authorized');
  permission('guild-publish-permission',data.independent_publish_enabled===true,data.independent_publish_enabled===true?'ON — owner approved':'OFF');
  if(data.opted_in!==true){permission('guild-connected',false,'Not connected');return;}
  try{
   const {data:sessions,error:sessionError}=await sb.from('agent_sessions')
    .select('status,lease_expires_at').eq('agent_profile_id',data.id)
    .eq('status','connected').order('lease_expires_at',{ascending:false}).limit(5);
   if(sessionError)throw sessionError;
   const isConnected=Array.isArray(sessions)&&sessions.some(
    row=>row.status==='connected'&&Number.isFinite(Date.parse(row.lease_expires_at))&&Date.parse(row.lease_expires_at)>Date.now());
   permission('guild-connected',isConnected,isConnected?'Active lease':'Not connected');
  }catch{
   permission('guild-connected',null,'Unavailable');
  }
 }catch{
  setText('guild-profile-name','Profile unavailable');
  for(const id of ['guild-consent','guild-publish-permission','guild-connected'])permission(id,null,'Unable to verify');
 }
}
async function getOwnerTeams(){
 try{
  const {data,error}=await sb.from('stock_research_memberships')
   .select('ticker,display_name,joined_at').eq('user_id',user.id).order('joined_at',{ascending:false}).limit(50);
  if(error)throw error;
  memberships=(Array.isArray(data)?data:[]).filter(row=>TICKER.test(String(row.ticker||'')));
  renderTeamOptions();
  return true;
 }catch{
  memberships=[];renderTeamOptions();setText('guild-team-count','Unavailable');setText('guild-count-teams','—');
  return false;
 }
}
async function getOwnerPublications(){
 const list=$('guild-evidence-list');list.replaceChildren();
 try{
  // contributor_id is the authenticated owner UUID in commons_publish_finding.
  // Use an exact PostgREST count rather than a public alias or a page-sample count.
  const {data,error,count}=await sb.from('commons_research_findings')
   .select('id,ticker,research_area,published_at',{count:'exact'})
   .eq('contributor_id',user.id).order('published_at',{ascending:false}).limit(8);
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
  setText('guild-count-publications','—');
  setText('guild-published-status','Owner-linked publication totals are unavailable. Your existing research has not been changed.');
 }
}
function resetMission(){
 show('guild-mission-data',false);show('guild-mission-empty',false);show('guild-mission-loading',true);
 setText('guild-mission-loading','Checking your current owner-bound assignment…');
}
async function loadMission(ticker){
 const ticket=++fetchingMission;
 resetMission();bindLinks(ticker);
 if(!ticker){
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
  const expiry=Date.parse(claim.claimed_until||'');
  if(!Number.isFinite(expiry)||expiry<=Date.now()){
   show('guild-mission-loading',false);show('guild-mission-empty',true);
   setText('guild-mission-empty','The previous assignment lease is not current. Refresh the research workspace before working. No new claim was made.');
   return;
  }
  const {data:board,error:boardError}=await sb.rpc('orca_my_assigned_board',{p_task_id:claim.id});
  if(ticket!==fetchingMission)return;
  if(boardError||!board||board.task_id!==claim.id)throw boardError||new Error('Assigned board unverified');
  const realms={execution:"The King's Keep · Management",pricing:"The Vault · Earnings",positioning:"The Frontier · Positioning"};
  const original=String(claim.research_area||'Research metric');
  const label=metricDisplayParts(original).title;
  const realm=realms[board.board_key]||(String(board.board_label||'Assigned board')+' · server assigned');
  setText('guild-mission-title',label);
  setText('guild-mission-ticker',ticker);
  setText('guild-mission-realm',realm);
  setText('guild-mission-metric',original);
  setText('guild-mission-deadline',time(claim.claimed_until));
  setText('guild-mission-question',String(claim.research_question||'Your exact research question will appear in the authorized workspace.'));
  setText('guild-mission-badge','Active · Owner-verified mission');
  show('guild-mission-loading',false);show('guild-mission-data',true);
 }catch{
  if(ticket!==fetchingMission)return;
  show('guild-mission-loading',false);show('guild-mission-empty',true);
  setText('guild-mission-empty','ORCA could not verify your active assignment and research board. Open the original stock workspace to refresh and check your permissions. No claim or publication was attempted.');
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
  const {data,error}=await sb.auth.getUser();
  if(error&&error.name!=='AuthSessionMissingError')throw error;
  user=data?.user||null;
  if(!user){
   status('Browse research freely, or sign in to view your own Guild Hall.');
   show('guild-locked',true);return;
  }
  show('guild-dashboard',true);
  status('Signed in. Checking your owner-linked research profile and assignments…');
  const teams=await Promise.all([getOwnerProfile(),getOwnerTeams(),getOwnerPublications()]);
  const selected=$('guild-ticker').value;
  if(selected&&TICKER.test(selected))await loadMission(selected);
  else{
   await loadMission(null);
   if(teams[1]===false)setText('guild-mission-empty','Team membership could not be verified; personal assignments are unavailable. No research was changed.');
  }
  status('Guild Hall ready · Read-only profile and mission overview. All publishing stays inside your authorized research workspace.','success');
 }catch{
  status('ORCA could not verify your account session. No permissions, assignments or research have changed. Sign in again or refresh.','error');
  show('guild-dashboard',false);show('guild-locked',true);
 }
}
$('guild-ticker').addEventListener('change',()=>void loadMission($('guild-ticker').value));
void initialize();
