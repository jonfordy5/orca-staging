import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createTrustedBrowserSession} from '../services/orca-owned-oauth/trusted-browser-session.mjs';

const issuer='https://auth.orca.example';
const owner='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const token='header.payload.signature';
function fixture(){
  let clock=2000000000000;
  let currentOwner=owner,approved=true,verified=true,calls=0;
  const opts={
    issuerOrigin:issuer,
    keyring:[{id:'session-key-01',key:randomBytes(32)}],
    auth:{getUser:async supplied=>{
      calls++;
      assert.equal(supplied,token);
      return verified?{data:{user:{id:currentOwner}}}:{error:Error('expired')};
    }},
    ownerScopedProfileRead:async id=>({owner_id:id,opted_in:approved}),
    isTrustedHttps:req=>req.verifiedTls===true,
    now:()=>clock,
    maxAgeSeconds:600
  };
  const bridge=createTrustedBrowserSession(opts);
  const request=(overrides={})=>({
    method:'POST',headers:{
      host:'auth.orca.example',origin:issuer,
      'content-type':'application/json','sec-fetch-site':'same-origin'
    },verifiedTls:true,...overrides
  });
  return {bridge,opts,request,advance:ms=>clock+=ms,
    setVerified:x=>verified=x,setApproved:x=>approved=x,
    setOwner:x=>currentOwner=x,verifiedCount:()=>calls};
}
test('sealed host-only session requires existing Supabase researcher and is usable by trusted interaction controller',async()=>{
  const f=fixture();
  const issued=await f.bridge.issueSessionCookie(f.request(),{supabaseAccessToken:token});
  assert.match(issued.setCookie,/^__Host-orca_oauth_session=v1\./);
  assert.match(issued.setCookie,/; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.ok(!issued.setCookie.includes(token));
  const cookie=issued.setCookie.split(';')[0];
  const session=await f.bridge.readTrustedBrowserSession(f.request({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  }));
  assert.equal(session.supabaseAccessToken,token);
  assert.match(session.browserSessionId,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(f.verifiedCount(),1,'issue verifies Supabase now; interaction verifies it again');
  assert.match(f.bridge.clearSessionCookie(f.request()),/Max-Age=0; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  f.advance(600001);
  await assert.rejects(f.bridge.readTrustedBrowserSession(f.request({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  })),/invalid_or_expired_browser_session/);
});

test('reject wrong TLS, host, origin, method, content type, bearer and cross-site fetch',async()=>{
  const f=fixture();
  const requests=[
    f.request({verifiedTls:false}),
    f.request({headers:{host:'evil.orca.example',origin:issuer,'content-type':'application/json'}}),
    f.request({headers:{host:'auth.orca.example',origin:'https://evil.example','content-type':'application/json'}}),
    f.request({method:'GET'}),
    f.request({headers:{host:'auth.orca.example',origin:issuer,'content-type':'text/plain'}}),
    f.request({headers:{host:'auth.orca.example',origin:issuer,'content-type':'application/json','sec-fetch-site':'cross-site'}}),
    f.request({headers:{host:'auth.orca.example',origin:issuer,'content-type':'application/json',authorization:'Bearer injected'}})
  ];
  for(const req of requests)
    await assert.rejects(f.bridge.issueSessionCookie(req,{supabaseAccessToken:token}));
  assert.equal(f.verifiedCount(),0);
});

test('expired Supabase user or missing profile consent denies cookie creation',async()=>{
  const f=fixture();
  f.setVerified(false);
  await assert.rejects(f.bridge.issueSessionCookie(f.request(),{supabaseAccessToken:token}),/supabase_user_not_verified/);
  f.setVerified(true);f.setApproved(false);
  await assert.rejects(f.bridge.issueSessionCookie(f.request(),{supabaseAccessToken:token}),/existing_orca_profile_or_consent_required/);
});

test('tampering, duplicate cookies, wrong keys and agent authorization header deny reading',async()=>{
  const f=fixture();
  const cookie=(await f.bridge.issueSessionCookie(f.request(),{supabaseAccessToken:token})).setCookie.split(';')[0];
  const get=headers=>f.bridge.readTrustedBrowserSession(f.request({
    method:'GET',headers:{host:'auth.orca.example',...headers}
  }));
  await assert.rejects(get({cookie:cookie+'x'}),/invalid_sealed_cookie/);
  await assert.rejects(get({cookie:cookie+'; '+cookie}),/missing_or_invalid_browser_cookie/);
  await assert.rejects(get({cookie,authorization:'Bearer agent'}),/agent_bearer_is_not_a_browser_session/);
  await assert.rejects(get({cookie:'unrelated=1'}),/missing_or_invalid_browser_cookie/);
  const different=createTrustedBrowserSession({
    ...f.opts,keyring:[{id:'session-key-01',key:randomBytes(32)}]
  });
  await assert.rejects(different.readTrustedBrowserSession(f.request({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  })),/invalid_sealed_cookie/);
});

test('key rotation accepts old key temporarily, changed issuer cannot read, new sessions use primary',async()=>{
  const f=fixture();
  const cookie=(await f.bridge.issueSessionCookie(f.request(),{supabaseAccessToken:token})).setCookie.split(';')[0];
  const keys=f.opts.keyring;
  const rotate=createTrustedBrowserSession({
    ...f.opts,keyring:[{id:'session-key-02',key:randomBytes(32)},keys[0]]
  });
  assert.equal((await rotate.readTrustedBrowserSession(f.request({
    method:'GET',headers:{host:'auth.orca.example',cookie}
  }))).supabaseAccessToken,token);
  const newCookie=(await rotate.issueSessionCookie(f.request(),{supabaseAccessToken:token})).setCookie;
  assert.match(newCookie,/v1\.session-key-02\./);
  const oldOnly=createTrustedBrowserSession({...f.opts,keyring:[keys[0]]});
  await assert.rejects(oldOnly.readTrustedBrowserSession(f.request({
    method:'GET',headers:{host:'auth.orca.example',cookie:newCookie.split(';')[0]}
  })),/unknown_session_key/);
  const otherIssuer=createTrustedBrowserSession({...f.opts,issuerOrigin:'https://different.orca.example'});
  await assert.rejects(otherIssuer.readTrustedBrowserSession(f.request({
    method:'GET',headers:{host:'different.orca.example',cookie}
  })),/invalid_sealed_cookie/);
});
