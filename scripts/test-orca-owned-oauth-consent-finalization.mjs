import test from 'node:test';
import assert from 'node:assert/strict';
import {createSafeConsentFinalizer} from
  '../services/orca-owned-oauth/consent-finalization.mjs';

const owner='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const other='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const client='https://ai.example.invalid/client.json';
const resource='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const ownedId='11111111-2222-4333-8444-555555555555';
const providerId='opaque-provider-grant-1234567890';

function fixture({linkSucceeds=true,saveSucceeds=true,finishSucceeds=true,
  verifiedOwner=owner,details={
    missingResourceScopes:{[resource]:['orca:research.read']},
    missingOIDCScope:['openid']
  }}={}){
  const order=[];
  let used=false;
  let expired=false;
  const controller={
    async consumeVerifiedConsent(_req,_res,form){
      order.push('consume_csrf');
      if(used || form.csrfToken!=='server-issued-test-csrf'||expired)
        throw Error('csrf_rejected_or_replayed');
      used=true;
      return {
        interaction:{
          prompt:{name:'consent',details},params:{client_id:client,resource}
        },
        researcher:{ownerId:verifiedOwner}
      };
    }
  };
  const finished=[];
  const grantModels=[];
  class Grant {
    constructor(args){order.push('new_provider_grant');this.args=args;grantModels.push(this);}
    addOIDCScope(x){this.oidc=x;}
    addResourceScope(audience,scope){this.audience=audience;this.scope=scope;}
    async save(){
      order.push('save_provider_grant');
      if(!saveSucceeds)throw Error('provider_save_failed');
      return providerId;
    }
    async destroy(){order.push('destroy_provider_grant');}
  }
  const provider={
    Grant,
    async interactionFinished(_req,_res,result,opts){
      order.push('finish_interaction');
      if(!finishSucceeds)throw Error('finish_failed');
      finished.push({result,opts});
    }
  };
  const grants={
    async createGrant(input){
      order.push('create_owned_grant');
      const expected={ownerId:verifiedOwner,clientId:client,
        resource,scope:'orca:research.read'};
      assert.equal(await input.assertApprovedConsent(expected),true);
      assert.equal(await input.assertApprovedConsent({...expected,ownerId:other}),false);
      return {grantId:ownedId,ownerId:verifiedOwner,clientId:client,active:true};
    },
    async linkProviderGrant(input){
      order.push('link_provider_grant');
      assert.deepEqual(input,{verifiedOwnerId:verifiedOwner,clientId:client,
        grantId:ownedId,providerGrantId:providerId});
      return linkSucceeds;
    },
    async revokeGrant(input){
      order.push('revoke_owned_grant');
      assert.deepEqual(input,{verifiedOwnerId:verifiedOwner,grantId:ownedId});
      return true;
    }
  };
  return {order,finished,grantModels,expire:()=>{expired=true;},
    finalize:createSafeConsentFinalizer({
      controller,provider,grantRegistry:grants,resource
    }).finalize};
}

const form={decision:'approve',csrfToken:'server-issued-test-csrf',
  interactionUid:'opaque-interaction-123456789',challengeId:ownedId};
test('Explicit approval creates linked provider and ORCA grants BEFORE redirect',async()=>{
  const f=fixture();
  const result=await f.finalize({}, {},form);
  assert.deepEqual(result,{approved:true,ownerId:owner,grantId:ownedId});
  assert.deepEqual(f.order,[
    'consume_csrf','new_provider_grant','create_owned_grant',
    'save_provider_grant','link_provider_grant','finish_interaction'
  ]);
  assert.equal(f.grantModels[0].args.accountId,owner);
  assert.equal(f.grantModels[0].args.clientId,client);
  assert.equal(f.grantModels[0].scope,'orca:research.read');
  assert.equal(f.grantModels[0].audience,resource);
  assert.equal(f.grantModels[0].oidc,'openid');
  assert.deepEqual(f.finished,[{
    result:{consent:{grantId:providerId}},opts:{mergeWithLastSubmission:true}
  }]);
  await assert.rejects(f.finalize({}, {},form),/csrf_rejected_or_replayed/);
  assert.equal(f.finished.length,1);
});

test('Missing approval / invalid consent scope never creates a grant',async()=>{
  const f=fixture();
  await assert.rejects(f.finalize({}, {},{...form,decision:'deny'}),
    /explicit_approval_required/);
  assert.deepEqual(f.order,[]);
  for(const bad of [
    {missingResourceScopes:{}},
    {missingResourceScopes:{[resource]:['orca:research.write']}},
    {missingResourceScopes:{[resource]:['orca:research.read','extra']}},
    {missingResourceScopes:{[resource]:['orca:research.read'],other:['read']}},
    {missingResourceScopes:{[resource]:['orca:research.read']},
      missingOIDCScope:['email']},
    {missingResourceScopes:{[resource]:['orca:research.read']},rar:[{type:'payment'}]}
  ]){
    const attempt=fixture({details:bad});
    await assert.rejects(attempt.finalize({}, {},form));
    assert.ok(!attempt.order.includes('create_owned_grant'));
    assert.ok(!attempt.order.includes('finish_interaction'));
  }
});

test('Failed provider save or grant link revokes partial consent without issuing token',async()=>{
  const providerFail=fixture({saveSucceeds:false});
  await assert.rejects(providerFail.finalize({}, {},form),/provider_save_failed/);
  assert.ok(providerFail.order.includes('revoke_owned_grant'));
  assert.ok(!providerFail.order.includes('finish_interaction'));
  const linkFail=fixture({linkSucceeds:false});
  await assert.rejects(linkFail.finalize({}, {},form),/provider_grant_link_failed/);
  assert.deepEqual(linkFail.order.slice(-2),[
    'revoke_owned_grant','destroy_provider_grant'
  ]);
  assert.equal(linkFail.finished.length,0);
});
test('Failed provider interaction continuation revokes owned and destroys provider grant',async()=>{
  const f=fixture({finishSucceeds:false});
  await assert.rejects(f.finalize({}, {},form),/finish_failed/);
  assert.deepEqual(f.order.slice(-3),[
    'finish_interaction','revoke_owned_grant','destroy_provider_grant'
  ]);
});
test('No public approval when authenticated session/CSRF is expired',async()=>{
  const f=fixture();f.expire();
  await assert.rejects(f.finalize({}, {},form),/csrf_rejected_or_replayed/);
  assert.deepEqual(f.order,['consume_csrf']);
});
test('Missing dependencies, mismatched resources, extensions or reuse all fail closed',async()=>{
  assert.throws(()=>createSafeConsentFinalizer({}),/private_verified_consent_integration_required/);
  const f=fixture({details:{
    missingResourceScopes:{[resource]:['orca:research.read']},
    missingOIDCClaims:['email']
  }});
  await assert.rejects(f.finalize({}, {},form),/unsupported_consent_extension/);
});
