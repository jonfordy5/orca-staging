import test from 'node:test';
import assert from 'node:assert/strict';
import {createExistingResearcherInteractionController} from
  '../services/orca-owned-oauth/existing-researcher-interaction.mjs';
import {createPrivateConsentChallenges} from
  '../services/orca-owned-oauth/consent-challenge.mjs';
import {createHash} from 'node:crypto';

const resource='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const client='https://agent.example.invalid/.well-known/oauth-client.json';
const callback='https://chatgpt.com/connector_platform_oauth_redirect';
const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const uid='oidc-interaction-uid-0000000001';
const scope='openid orca:research.read';
const hash=x=>createHash('sha256').update(x).digest('base64url');
const params={
  client_id:client,redirect_uri:callback,response_type:'code',
  scope,resource,code_challenge:hash('v'.repeat(60)),
  code_challenge_method:'S256',state:'s'.repeat(40)
};

function fixture(){
  let owner=ownerA,session='browser-session-opaque-0000001';
  let prompt='login',currentParams={...params};
  let oauthSession=null,optedIn=true;
  let verificationFails=false;
  let checked=0;
  const finished=[],queries=[];
  const challenges=new Map();
  const query=async(sql,p)=>{
    queries.push(sql);
    if(sql.startsWith('insert')){
      const [id,ownerId,clientId,audience,interactionHash,sessionHash,csrfHash,ttl]=p;
      challenges.set(id,{ownerId,clientId,audience,interactionHash,sessionHash,csrfHash,
        expiresAt:Date.now()+ttl*1000,consumed:false});
      return {rowCount:1,rows:[{id}]};
    }
    if(sql.startsWith('update')){
      const [id,ownerId,clientId,audience,interactionHash,sessionHash,csrfHash]=p;
      const entry=challenges.get(id);
      const eq=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
      const match=entry&&!entry.consumed&&entry.expiresAt>Date.now()&&
        entry.ownerId===ownerId&&entry.clientId===clientId&&
        entry.audience===audience&&
        eq(entry.interactionHash,interactionHash)&&eq(entry.sessionHash,sessionHash)&&
        eq(entry.csrfHash,csrfHash);
      if(!match)return {rowCount:0,rows:[]};
      entry.consumed=true;
      return {rowCount:1,rows:[{id}]};
    }
    throw Error('unexpected_private_sql');
  };
  const provider={
    interactionDetails:async()=>({
      uid,params:currentParams,prompt:{name:prompt},
      session:oauthSession
    }),
    interactionFinished:async(_req,_res,result,opts)=>{
      finished.push({result,opts});
    }
  };
  const supabaseAuth={
    getUser:async()=>{
      checked++;
      if(verificationFails)return {error:new Error('expired'),data:{user:null}};
      return {data:{user:{id:owner}}};
    }
  };
  const privateChallenges=createPrivateConsentChallenges({query,resource});
  const service=createExistingResearcherInteractionController({
    provider,supabaseAuth,
    // Server-side signed HttpOnly cookie session, not a bearer from request.form
    readTrustedBrowserSession:async()=>({
      supabaseAccessToken:'supabase.test.jwt',
      browserSessionId:session
    }),
    ownerScopedProfileRead:async(id)=>({
      owner_id:id,opted_in:optedIn
    }),
    challenges:privateChallenges,
    approvedClients:{[client]:[callback]},resource
  });
  return {service,finished,queries,challenges,
    setOwner:x=>owner=x,setSession:x=>session=x,
    setPrompt:x=>prompt=x,setOauthSession:x=>oauthSession=x,
    setParams:x=>currentParams=x,setOptedIn:x=>optedIn=x,
    failVerification:x=>verificationFails=x,
    verificationCount:()=>checked};
}
const req={method:'POST',body:{owner_id:ownerB,role:'admin'}};
const res={};
const form=x=>({
  interactionUid:x.interactionUid,
  challengeId:x.challengeId,
  csrfToken:x.csrfToken
});

test('Valid, existing Supabase researcher can continue login only after one-use CSRF',async()=>{
  const f=fixture();
  const page=await f.service.prepare(req,res,{interactionUid:uid});
  assert.equal(page.prompt,'login');
  assert.equal(page.clientId,client);
  assert.equal(page.resource,resource);
  assert.match(page.csrfToken,/^[a-zA-Z0-9_-]{43}$/);
  assert.equal(typeof f.service.approve,'undefined',
    'Consent/token issuing intentionally unavailable');
  const done=await f.service.continueVerifiedLogin(req,res,form(page));
  assert.deepEqual(done,{continued:true});
  assert.deepEqual(f.finished,[{
    result:{login:{accountId:ownerA}},
    opts:{mergeWithLastSubmission:false}
  }]);
  assert.equal(f.verificationCount(),2,'fresh Auth.getUser verification on GET and POST');
  await assert.rejects(f.service.continueVerifiedLogin(req,res,form(page)),
    /csrf_rejected_or_replayed/);
  assert.equal(f.finished.length,1);
});

test('Swapped owner or browser session is denied before provider login continuation',async()=>{
  const f=fixture();
  const page=await f.service.prepare(req,res,{interactionUid:uid});
  f.setOwner(ownerB);
  await assert.rejects(f.service.continueVerifiedLogin(req,res,form(page)),
    /csrf_rejected_or_replayed/);
  f.setOwner(ownerA);
  f.setSession('another-signed-browser-session-2');
  await assert.rejects(f.service.continueVerifiedLogin(req,res,form(page)),
    /csrf_rejected_or_replayed/);
  assert.equal(f.finished.length,0);
});

test('Unapproved callback, client, scope or resource cannot generate consent challenge',async()=>{
  const f=fixture();
  for(const changed of [
    {...params,client_id:'https://attacker.example/agent.json'},
    {...params,redirect_uri:'https://evil.example/callback'},
    {...params,scope:'orca:research.write'},
    {...params,resource:'https://vbziibatnejoswsdggga.supabase.co/rest/v1'},
    {...params,code_challenge_method:'plain'},
    {...params,state:'short'}
  ]){
    f.setParams(changed);
    await assert.rejects(f.service.prepare(req,res,{interactionUid:uid}),
      /unapproved_oauth_request/);
  }
  assert.equal(f.queries.length,0);
  assert.equal(f.finished.length,0);
});

test('Consent must match existing OAuth session account and can only be denied for now',async()=>{
  const f=fixture();
  f.setPrompt('consent');
  f.setOauthSession({accountId:ownerB});
  await assert.rejects(f.service.prepare(req,res,{interactionUid:uid}),
    /oauth_session_owner_mismatch/);
  f.setOauthSession({accountId:ownerA});
  const page=await f.service.prepare(req,res,{interactionUid:uid});
  assert.equal(page.prompt,'consent');
  await assert.rejects(f.service.continueVerifiedLogin(req,res,form(page)),
    /interaction_phase_mismatch/);
  const done=await f.service.denyWithVerifiedSession(req,res,{
    ...form(page),expectedPrompt:'consent'
  });
  assert.deepEqual(done,{denied:true,prompt:'consent'});
  assert.deepEqual(f.finished,[{
    result:{error:'access_denied'},
    opts:{mergeWithLastSubmission:false}
  }]);
  assert.equal(typeof f.service.approve,'undefined');
});

test('Expired Supabase login, opt-out, stale interaction or lost trusted cookie fail closed',async()=>{
  const f=fixture();
  f.failVerification(true);
  await assert.rejects(f.service.prepare(req,res,{interactionUid:uid}),
    /supabase_user_not_verified/);
  f.failVerification(false);
  f.setOptedIn(false);
  await assert.rejects(f.service.prepare(req,res,{interactionUid:uid}),
    /existing_orca_profile_or_consent_required/);
  f.setOptedIn(true);
  await assert.rejects(f.service.prepare(req,res,{
    interactionUid:'another-oidc-interaction-uid-999'
  }),/untrusted_or_missing_interaction/);
  assert.equal(f.queries.length,0);
  assert.equal(f.finished.length,0);
});
