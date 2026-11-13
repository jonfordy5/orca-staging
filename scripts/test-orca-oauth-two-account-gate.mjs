import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAuthorizedOAuthOwner} from '../supabase/functions/orca-agent-mcp/owner-authorization.mjs';
import {ORCA_MCP_STAGING_ISSUER,ORCA_MCP_STAGING_RESOURCE} from '../supabase/functions/orca-agent-mcp/token-policy.mjs';

const accountA='11111111-2222-4333-8444-555555555555';
const accountB='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const clientA='bbbbbbbb-2222-4333-8444-cccccccccccc';
const clientB='ffffffff-2222-4333-8444-ffffffffffff';
const jwt=(x)=>[x.repeat(36),x.repeat(36),x.repeat(36)].join('.');
const bearerA='Bearer '+jwt('a');
const bearerB='Bearer '+jwt('b');
const grantsForA=[{client:{id:clientA},scopes:['openid'],granted_at:'2026-11-12T01:00:00Z'}];
const grantsForB=[{client:{id:clientB},scopes:['openid'],granted_at:'2026-11-12T02:00:00Z'}];
const issuer=ORCA_MCP_STAGING_ISSUER,resource=ORCA_MCP_STAGING_RESOURCE;
const expectedUrl=issuer+'/user/oauth/grants';

function claims(owner,client=clientA){
  return {iss:issuer,aud:['authenticated',resource],sub:owner,client_id:client};
}
function caller(owner,client,token){
  const calls={claims:0,user:0,grants:0};
  const auth={
    async getClaims(){calls.claims++;return {data:{claims:claims(owner,client)},error:null}},
    async getUser(){calls.user++;return {data:{user:{id:owner}},error:null}}
  };
  const request=new Request(resource,{method:'POST',headers:{Authorization:token}});
  return {auth,request,calls};
}
function transport(grantsByToken){
  const seen=[];
  const fetcher=async(url,init)=>{
    seen.push({url,auth:init.headers.Authorization,method:init.method});
    return {ok:true,async json(){return grantsByToken.get(init.headers.Authorization)||[]}};
  };
  return {seen,fetcher};
}
async function attempt(c,approvedClientIds,fetcher){
  return verifyAuthorizedOAuthOwner({request:c.request,auth:c.auth,
    approvedClientIds,fetcher,publishableKey:'sb_publishable_test_only'});
}

test('Two existing accounts can each read only while their own client grant is present',async()=>{
  const a=caller(accountA,clientA,bearerA);
  const b=caller(accountB,clientB,bearerB);
  const store=new Map([[bearerA,grantsForA],[bearerB,grantsForB]]);
  const t=transport(store);
  const approved=new Set([clientA,clientB]);
  assert.equal(await attempt(a,approved,t.fetcher),accountA);
  assert.equal(await attempt(b,approved,t.fetcher),accountB);
  assert.deepEqual(t.seen.map(x=>x.url),[expectedUrl,expectedUrl]);
  assert.deepEqual(t.seen.map(x=>x.auth),[bearerA,bearerB]);
  assert.deepEqual([a.calls.grants,b.calls.grants],[0,0]);
});

test('Disconnecting account A denies its existing bearer on next call without affecting account B',async()=>{
  const a=caller(accountA,clientA,bearerA);
  const b=caller(accountB,clientB,bearerB);
  const store=new Map([[bearerA,grantsForA],[bearerB,grantsForB]]);
  const t=transport(store);
  const approved=new Set([clientA,clientB]);
  assert.equal(await attempt(a,approved,t.fetcher),accountA);
  store.set(bearerA,[]);
  await assert.rejects(attempt(a,approved,t.fetcher),/revoked/);
  assert.equal(await attempt(b,approved,t.fetcher),accountB);
  assert.equal(t.seen.length,3);
});

test('A valid OAuth grant never overrides a conflicting independently verified user identity',async()=>{
  const a=caller(accountA,clientA,bearerA);
  a.auth.getUser=async()=>({data:{user:{id:accountB}},error:null});
  const t=transport(new Map([[bearerA,grantsForA]]));
  await assert.rejects(attempt(a,new Set([clientA]),t.fetcher),/not authorized/);
  assert.equal(t.seen.length,0,'Reject before reading grants or research');
});

test('Unauthorized client, wrong resource audience and missing Auth verification deny before grants',async()=>{
  const a=caller(accountA,clientA,bearerA);
  const t=transport(new Map([[bearerA,grantsForA]]));
  await assert.rejects(attempt(a,new Set(),t.fetcher),/not authorized/);
  a.auth.getClaims=async()=>({data:{claims:{...claims(accountA),aud:'authenticated'}},error:null});
  await assert.rejects(attempt(a,new Set([clientA]),t.fetcher),/not authorized/);
  a.auth.getClaims=async()=>({data:null,error:new Error('invalid token')});
  await assert.rejects(attempt(a,new Set([clientA]),t.fetcher),/cannot be verified/);
  assert.equal(t.seen.length,0);
});

test('Other-user grants and unavailable Auth server are rejected; no task claim or publication',async()=>{
  const a=caller(accountA,clientA,bearerA);
  const t=transport(new Map([[bearerA,grantsForB]]));
  await assert.rejects(attempt(a,new Set([clientA]),t.fetcher),/revoked/);
  const down=async()=>{throw new Error('Auth server unavailable')};
  await assert.rejects(attempt(a,new Set([clientA]),down),/Auth server unavailable/);
  assert.ok(a.calls.claims>0&&a.calls.user>0);
});
