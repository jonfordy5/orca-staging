// Real HTTP integration tests against an isolated PostgREST instance in CI.
// Uses ONLY synthetic user UUIDs and an ephemeral CI-only HMAC key.
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base='http://127.0.0.1:3050';
const key='orca-ci-postgrest-jwt-hmac-key-1234567890-DO-NOT-USE';
const iss='https://vbziibatnejoswsdggga.supabase.co/auth/v1';
const resource='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp';
const userA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const client='approved-client-alpha';

const jwt=claims=>{
  const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p=Buffer.from(JSON.stringify({
    role:'authenticated',iat:Math.floor(Date.now()/1000)-15,
    exp:Math.floor(Date.now()/1000)+300,iss,...claims
  })).toString('base64url');
  const signature=createHmac('sha256',key).update(h+'.'+p).digest('base64url');
  return h+'.'+p+'.'+signature;
};
const browser=jwt({sub:userA,aud:'authenticated'});
const service=jwt({role:'service_role',aud:'authenticated'});
const oauth=jwt({sub:userA,aud:resource,client_id:client});
const oauthB=jwt({sub:userB,aud:resource,client_id:client});
const wrongClient=jwt({sub:userA,aud:resource,client_id:'unregistered-client-beta'});
const wrongAudience=jwt({sub:userA,aud:'authenticated',client_id:client});

async function call(method,path,token,body=null,headers={}){
  const response=await fetch(base+path,{
    method,
    headers:{
      'Accept':'application/json',
      ...(token?{'Authorization':'Bearer '+token}:{}),
      ...(body!==null?{'Content-Type':'application/json'}:{}),
      ...headers
    },
    ...(body!==null?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(12000)
  });
  const raw=await response.text();
  let data;try{data=JSON.parse(raw)}catch{data=raw}
  return {status:response.status,data};
}
function expectSuccess(r,label){
  assert.ok(r.status>=200&&r.status<300,label+' expected 2xx, received '+r.status+
    (typeof r.data==='object'?' '+JSON.stringify(r.data).slice(0,270):''));
}
function expectDenied(r,label){
  assert.ok([401,403].includes(r.status),label+' expected 401/403, got '+r.status);
}
function publications(){
  return Number(execFileSync('psql',['-X','-Atc','SELECT total FROM public.fake_publications WHERE id=1;'],
    {encoding:'utf8'}).trim());
}
function teamCount(){
  return Number(execFileSync('psql',['-X','-Atc','SELECT count(*) FROM public.stock_research_memberships;'],
    {encoding:'utf8'}).trim());
}
function alias(){
  return execFileSync('psql',['-X','-Atc',"SELECT display_name FROM public.agent_profiles WHERE owner_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"],
    {encoding:'utf8'}).trim();
}

test('real PostgREST: legacy ORCA browser retains team read access',async()=>{
  const r=await call('GET','/stock_research_memberships?select=ticker,user_id',browser);
  expectSuccess(r,'browser team read');assert.equal(r.data.length,2);
});
test('real PostgREST: OAuth token sees ONLY its own membership',async()=>{
  const a=await call('GET','/stock_research_memberships?select=ticker,user_id',oauth);
  const b=await call('GET','/stock_research_memberships?select=ticker,user_id',oauthB);
  expectSuccess(a,'OAuth account A');expectSuccess(b,'OAuth account B');
  assert.equal(a.data.length,1);assert.equal(a.data[0].user_id,userA);
  assert.equal(b.data.length,1);assert.equal(b.data[0].user_id,userB);
});
test('real PostgREST: allowlisted OAuth profile read is owner-scoped',async()=>{
  const r=await call('GET','/agent_profiles?select=display_name,owner_id',oauth);
  expectSuccess(r,'OAuth profile read');
  assert.equal(r.data.length,1);
  assert.equal(r.data[0].owner_id,userA);
});
test('real PostgREST: two approved read-only RPCs work',async()=>{
  const c=await call('POST','/rpc/commons_my_claim',oauth,{p_ticker:'RKLB'});
  expectSuccess(c,'read-only claim lookup');
  assert.equal(c.data.ticker,'RKLB');assert.equal(c.data.owner,userA);
  const b=await call('POST','/rpc/orca_my_assigned_board',oauth,{
    p_task_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  });
  expectSuccess(b,'read-only assignment board');
  assert.equal(b.data.board_key,'positioning');
});
test('real PostgREST: OAuth publish RPC blocked BEFORE any fake publication',async()=>{
  assert.equal(publications(),0);
  const r=await call('POST','/rpc/commons_publish_independent_finding',oauth,{});
  expectDenied(r,'OAuth publication');
  assert.equal(publications(),0);
});
test('real PostgREST: browser publish RPC remains functional in isolated fixture',async()=>{
  const r=await call('POST','/rpc/commons_publish_independent_finding',browser,{});
  expectSuccess(r,'browser publication');
  assert.equal(publications(),1);
});
test('real PostgREST: service_role retains access to privileged RPC after filter activation',async()=>{
  const before=publications();
  const r=await call('POST','/rpc/commons_publish_independent_finding',service,{});
  expectSuccess(r,'service-role publication');
  assert.equal(publications(),before+1);
});
test('real PostgREST: OAuth direct DELETE/INSERT/PATCH blocked with no mutations',async()=>{
  const beforeMembership=teamCount(),beforeAlias=alias();
  const del=await call('DELETE','/stock_research_memberships?ticker=eq.RKLB',oauth);
  const put=await call('POST','/stock_research_memberships',oauth,{ticker:'AAPL',user_id:userA});
  const patch=await call('PATCH',`/agent_profiles?owner_id=eq.${userA}`,oauth,{display_name:'tamper'});
  expectDenied(del,'OAuth delete membership');
  expectDenied(put,'OAuth insert membership');
  expectDenied(patch,'OAuth update profile');
  assert.equal(teamCount(),beforeMembership);
  assert.equal(alias(),beforeAlias);
});
test('real PostgREST: unknown OAuth app, wrong audience and other routes denied',async()=>{
  expectDenied(await call('GET','/agent_profiles',wrongClient),'unknown OAuth app');
  expectDenied(await call('GET','/agent_profiles',wrongAudience),'wrong token audience');
  expectDenied(await call('GET','/fake_publications',oauth),'unapproved table');
  expectDenied(await call('GET','/agent_profiles',oauth,null,{'X-HTTP-Method-Override':'DELETE'}),'method override');
});
