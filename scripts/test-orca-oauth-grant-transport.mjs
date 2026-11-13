import test from 'node:test';
import assert from 'node:assert/strict';
import {readCurrentGrants,ORCA_AUTH_GRANTS_ENDPOINT} from '../supabase/functions/orca-agent-mcp/grant-request.mjs';
import {hasCurrentOAuthGrant} from '../supabase/functions/orca-agent-mcp/grant-policy.mjs';
import {authorizeReadOnlyMcpClaims,ORCA_MCP_STAGING_ISSUER,ORCA_MCP_STAGING_RESOURCE}
  from '../supabase/functions/orca-agent-mcp/token-policy.mjs';

const owner='11111111-2222-4333-8444-555555555555';
const otherOwner='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const client='bbbbbbbb-2222-4333-8444-cccccccccccc';
const otherClient='ffffffff-2222-4333-8444-ffffffffffff';
const grant={client:{id:client,name:'Vetted app'},scopes:['openid','profile'],granted_at:'2026-11-12T15:00:00Z'};
const fakeSignedJwt=['a'.repeat(48),'b'.repeat(48),'c'.repeat(48)].join('.');
const request=new Request('https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp',{
  method:'POST',headers:{Authorization:'Bearer '+fakeSignedJwt}
});
const claims={iss:ORCA_MCP_STAGING_ISSUER,aud:['authenticated',ORCA_MCP_STAGING_RESOURCE],
  sub:owner,client_id:client};
const apiKey='sb_publishable_test_key_no_secret';

function stub(body=()=>[grant],status=200) {
  const calls=[];
  const fetcher=async (url,init)=>{
    calls.push({url,init});
    return {ok:status>=200&&status<300,status,json:async()=>body()};
  };
  return {fetcher,calls};
}

test('Fresh grant lookup uses fixed staging Auth host and identical caller bearer without cookies, redirects or caching',async()=>{
  const mock=stub();
  const output=await readCurrentGrants(request,{fetcher:mock.fetcher,publishableKey:apiKey});
  assert.deepEqual(output,[grant]);
  assert.equal(mock.calls.length,1);
  const {url,init}=mock.calls[0];
  assert.equal(url,ORCA_AUTH_GRANTS_ENDPOINT);
  assert.equal(url,'https://vbziibatnejoswsdggga.supabase.co/auth/v1/user/oauth/grants');
  assert.equal(init.method,'GET');
  assert.equal(init.headers.Authorization,'Bearer '+fakeSignedJwt);
  assert.equal(init.headers.apikey,apiKey);
  assert.equal(init.headers.Accept,'application/json');
  assert.equal(init.credentials,'omit');
  assert.equal(init.redirect,'error');
  assert.equal(init.cache,'no-store');
  assert.ok(init.signal instanceof AbortSignal);
});

test('A current read works only when signed claims, exact client and fresh owner grant all agree',async()=>{
  assert.equal(authorizeReadOnlyMcpClaims(claims,new Set([client]),owner).ok,true);
  const mock=stub();
  const grants=await readCurrentGrants(request,{fetcher:mock.fetcher,publishableKey:apiKey});
  assert.equal(hasCurrentOAuthGrant(grants,claims.client_id),true);
  assert.equal(hasCurrentOAuthGrant(grants,otherClient),false);
  assert.equal(authorizeReadOnlyMcpClaims(claims,new Set([client]),otherOwner).ok,false);
  assert.equal(authorizeReadOnlyMcpClaims({...claims,aud:'authenticated'},new Set([client]),owner).ok,false);
  assert.equal(authorizeReadOnlyMcpClaims({...claims,client_id:otherClient},new Set([client]),owner).ok,false);
  assert.equal(authorizeReadOnlyMcpClaims({...claims,iss:'https://attacker.test'},new Set([client]),owner).ok,false);
  assert.equal(authorizeReadOnlyMcpClaims(claims,new Set(),owner).ok,false);
});

test('Same bearer loses read access immediately after client grant disappears, without cache reuse',async()=>{
  let stored=[grant];
  const mock=stub(()=>stored);
  const first=await readCurrentGrants(request,{fetcher:mock.fetcher,publishableKey:apiKey});
  assert.equal(hasCurrentOAuthGrant(first,client),true);
  stored=[];
  const second=await readCurrentGrants(request,{fetcher:mock.fetcher,publishableKey:apiKey});
  assert.equal(hasCurrentOAuthGrant(second,client),false);
  assert.equal(mock.calls.length,2);
});

test('Revocation and failures deny rather than silently accepting a missing, corrupted or other-client grant',async()=>{
  for(const response of [
    [],[{...grant,client:{id:otherClient}}],[{...grant,revoked_at:'2026-11-12T16:00:00Z'}],
    [{...grant,revoked:true}],[{...grant,scopes:null}],[{...grant,granted_at:'broken'}]
  ]){
    const mock=stub(()=>response);
    const grants=await readCurrentGrants(request,{fetcher:mock.fetcher,publishableKey:apiKey});
    assert.equal(hasCurrentOAuthGrant(grants,client),false);
  }
  for(const response of [null,{grants:[grant]},'ok']){
    const mock=stub(()=>response);
    await assert.rejects(readCurrentGrants(request,{fetcher:mock.fetcher,publishableKey:apiKey}),/Invalid active OAuth grant response/);
  }
  const unavailable=stub(()=>[grant],403);
  await assert.rejects(readCurrentGrants(request,{fetcher:unavailable.fetcher,publishableKey:apiKey}),/could not be verified/);
  const networkFailure=async()=>{throw new Error('network unavailable')};
  await assert.rejects(readCurrentGrants(request,{fetcher:networkFailure,publishableKey:apiKey}),/network unavailable/);
});

test('Malformed bearer or missing publishable key are rejected before any outbound request',async()=>{
  const reqs=[
    new Request(request.url),new Request(request.url,{headers:{Authorization:'Bearer fake'}}),
    new Request(request.url,{headers:{Authorization:'Basic '+fakeSignedJwt}})
  ];
  for(const req of reqs){
    const mock=stub();
    await assert.rejects(readCurrentGrants(req,{fetcher:mock.fetcher,publishableKey:apiKey}),/Verified OAuth bearer required/);
    assert.equal(mock.calls.length,0);
  }
  const mock=stub();
  await assert.rejects(readCurrentGrants(request,{fetcher:mock.fetcher,publishableKey:''}),/Auth API key not configured/);
  assert.equal(mock.calls.length,0);
});
