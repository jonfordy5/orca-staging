import test from 'node:test';
import assert from 'node:assert/strict';
import {createExistingResearcherSupabaseHttp} from
  '../services/orca-owned-oauth/supabase-existing-researcher-http.mjs';
import {verifyExistingResearcher} from
  '../services/orca-owned-oauth/existing-researcher.mjs';

const base='https://vbziibatnejoswsdggga.supabase.co';
const key='sb_publishable_'+'X'.repeat(32);
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const jwtA='testheader.testpayload.testsignature111111';
const jwtB='testheader.testpayload.testsignature222222';
const json=(status,data)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'}
});

function fixture(){
  let activeA=true,corruptProfile=false,userStatus=200,profileStatus=200;
  let userIdOverride=null;
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.method,'GET','do not allow a write operation');
    assert.equal(options.redirect,'manual','do not forward bearer to redirected host');
    assert.equal(options.headers.apikey,key);
    assert.equal(options.headers.accept,'application/json');
    assert.equal(options.cache,'no-store');
    assert.ok([jwtA,jwtB].map(x=>'Bearer '+x).includes(
      options.headers.authorization));
    const token=options.headers.authorization.slice('Bearer '.length);
    const owner=token===jwtA?ownerA:ownerB;
    if(url===base+'/auth/v1/user')
      return json(userStatus,userStatus===200?
        {id:userIdOverride||owner,is_anonymous:false}:{error:'expired'});
    const parsed=new URL(url);
    assert.equal(parsed.origin,base);
    assert.equal(parsed.pathname,'/rest/v1/agent_profiles');
    assert.equal(parsed.searchParams.get('select'),'owner_id,opted_in');
    assert.equal(parsed.searchParams.get('limit'),'2');
    const selected=parsed.searchParams.get('owner_id');
    if(selected!=='eq.'+owner)return json(profileStatus,[]);
    if(!activeA&&owner===ownerA)return json(profileStatus,
      [{owner_id:owner,opted_in:false}]);
    return json(profileStatus,[{
      owner_id:corruptProfile?ownerB:owner,opted_in:true
    }]);
  };
  const bridge=createExistingResearcherSupabaseHttp({
    supabaseUrl:base,publishableKey:key,fetchImpl
  });
  const verify=token=>verifyExistingResearcher({
    ...bridge,supabaseBearer:token
  });
  return {bridge,verify,calls,
    setAActive:v=>activeA=v,
    corruptProfile:v=>corruptProfile=v,
    setUserStatus:v=>userStatus=v,
    setProfileStatus:v=>profileStatus=v,
    setUserId:v=>userIdOverride=v};
}
test('real-shaped Supabase getUser and RLS profile GET verify two distinct existing owners',async()=>{
  const f=fixture();
  assert.deepEqual(await f.verify(jwtA),{
    ownerId:ownerA,existingResearcher:true
  });
  assert.deepEqual(await f.verify(jwtB),{
    ownerId:ownerB,existingResearcher:true
  });
  assert.equal(f.calls.length,4);
  assert.deepEqual(f.calls.map(x=>new URL(x.url).pathname),[
    '/auth/v1/user','/rest/v1/agent_profiles',
    '/auth/v1/user','/rest/v1/agent_profiles'
  ]);
  assert.ok(f.calls.every(x=>x.options.method==='GET'));
  assert.ok(f.calls.every(x=>!Object.hasOwn(x.options.headers,'service_role')));
});
test('cannot request a different owner profile with a valid signed-in user',async()=>{
  const f=fixture();
  await assert.rejects(f.bridge.ownerScopedProfileRead(ownerB,jwtA),
    /supabase_existing_user_verification_unavailable/);
  assert.equal(f.calls.length,1);
});
test('opted-out researcher, mismatched returned owner or absent profile deny access',async()=>{
  const f=fixture();
  f.setAActive(false);
  await assert.rejects(f.verify(jwtA),
    /supabase_existing_user_verification_unavailable/);
  f.setAActive(true);f.corruptProfile(true);
  await assert.rejects(f.verify(jwtA),
    /supabase_existing_user_verification_unavailable/);
  f.corruptProfile(false);
  f.setProfileStatus(403);
  await assert.rejects(f.verify(jwtA),
    /supabase_existing_user_verification_unavailable/);
});
test('Supabase user missing, expired or anonymous cannot pass user verification',async()=>{
  const f=fixture();
  f.setUserStatus(401);
  await assert.rejects(f.verify(jwtA),/supabase_user_not_verified/);
  f.setUserStatus(200);
  f.setUserId('not-a-uuid');
  await assert.rejects(f.verify(jwtA),/supabase_user_not_verified/);
});
test('no secret keys or arbitrary origins are allowed in issuer configuration',()=>{
  for(const bad of [
    'https://vbziibatnejoswsdggga.supabase.co.attacker.invalid',
    'http://vbziibatnejoswsdggga.supabase.co',
    'https://vbziibatnejoswsdggga.supabase.co/some/path',
    'https://127.0.0.1',
    'https://attacker.example.com',
    'https://vbziibatnejoswsdggga.supabase.co?access_token=foo'
  ])assert.throws(()=>createExistingResearcherSupabaseHttp({
    supabaseUrl:bad,publishableKey:key
  }),/supabase_existing_user_verification_unavailable/);
  for(const badKey of [
    'sb_secret_'+'A'.repeat(32),'service_role_secret',
    'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature'
  ])assert.throws(()=>createExistingResearcherSupabaseHttp({
    supabaseUrl:base,publishableKey:badKey
  }),/supabase_existing_user_verification_unavailable/);
});
test('redirects, network failure and oversized auth responses never pass',async()=>{
  for(const status of [302,500]){
    const f=fixture();f.setUserStatus(status);
    await assert.rejects(f.verify(jwtA),/supabase_user_not_verified/);
  }
  const failFetch=()=>{throw Error('network_fails');};
  const bridge=createExistingResearcherSupabaseHttp({
    supabaseUrl:base,publishableKey:key,fetchImpl:failFetch
  });
  await assert.rejects(verifyExistingResearcher({
    ...bridge,supabaseBearer:jwtA
  }),/supabase_user_not_verified/);
  const largeBridge=createExistingResearcherSupabaseHttp({
    supabaseUrl:base,publishableKey:key,
    fetchImpl:async()=>json(200,{id:ownerA,padding:'x'.repeat(40000)})
  });
  await assert.rejects(verifyExistingResearcher({
    ...largeBridge,supabaseBearer:jwtA
  }),/supabase_user_not_verified/);
});
