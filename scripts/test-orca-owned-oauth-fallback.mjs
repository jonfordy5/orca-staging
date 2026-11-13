import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {ORCA_OWNED_ISSUER_ENABLED,ORCA_READ_SCOPE,assessOwnedIssuerConfiguration,
  assessAuthorizationRequest,checkCodeExchange} from '../services/orca-owned-oauth/issuer-policy.mjs';
import {signBoundAccessToken,verifyBoundAccessToken} from '../services/orca-owned-oauth/bound-token.mjs';
import {verifyExistingResearcher} from '../services/orca-owned-oauth/existing-researcher.mjs';

const issuer='https://auth.orca.test';
const resource='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const clientId='11111111-2222-4333-8444-555555555555';
const otherClientId='22222222-3333-4444-8555-666666666666';
const ownerId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const otherOwnerId='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const grantId='cccccccc-dddd-4eee-8fff-111111111111';
const callback='https://chatgpt.com/connector_platform_oauth_redirect';
const code='P'.repeat(64),codeVerifier='v'.repeat(64);
const sha=x=>createHash('sha256').update(x).digest('base64url');
const clients={[clientId]:[callback]};
const authorize={
  client_id:clientId,redirect_uri:callback,response_type:'code',
  scope:'openid '+ORCA_READ_SCOPE,state:'s'.repeat(32),
  code_challenge:sha(codeVerifier),code_challenge_method:'S256',resource
};
const exchange={
  grant_type:'authorization_code',code,code_verifier:codeVerifier,
  client_id:clientId,redirect_uri:callback,resource
};
const saved={
  clientId,redirectUri:callback,resource,codeChallenge:authorize.code_challenge,
  codeHash:sha(code),expiresAt:Date.now()+60000,used:false
};
const keys=generateKeyPairSync('ec',{namedCurve:'P-256'});
const kid='orca-staging-test-key';
const grant={ownerId,clientId,grantId,resource,scope:'orca:research.read',active:true};
const tokenConfig={issuer,resource,approvedClientIds:new Set([clientId]),kid,
  publicKey:keys.publicKey,currentGrant:async g=>g.ownerId===ownerId&&
    g.clientId===clientId&&g.grantId===grantId&&g.resource===resource};

test('Plan B is disabled even when all setup requirements are configured',()=>{
  assert.equal(ORCA_OWNED_ISSUER_ENABLED,false);
  const result=assessOwnedIssuerConfiguration({
    issuer,resource,identityProvider:'supabase-staging',
    supabaseProject:'vbziibatnejoswsdggga',signingAlgorithm:'ES256',
    persistentAdapter:true,privateSigningKeyConfigured:true,
    consentCsrfProtection:true,validatedRedirects:true,revocationCheck:true
  });
  assert.equal(result.ok,false);
  assert.deepEqual(result.blockers,['pilot_disabled']);
});
test('Issuer requires persistent state, signing keys, CSRF and revocation',()=>{
  const result=assessOwnedIssuerConfiguration({issuer,resource,identityProvider:'supabase-staging',
    supabaseProject:'vbziibatnejoswsdggga',signingAlgorithm:'none'});
  for(const blocker of ['signing_algorithm_must_be_ES256','persistent_atomic_state_required',
    'private_signing_key_required','consent_csrf_protection_required',
    'validated_redirect_registry_required','revocation_check_required','pilot_disabled'])
    assert.ok(result.blockers.includes(blocker));
});
test('Only registered client, exact HTTPS callback, exact resource, code and S256 accepted',()=>{
  assert.equal(assessAuthorizationRequest(authorize,{resource,clients}).ok,true);
  const invalid=[
    {...authorize,client_id:otherClientId},
    {...authorize,redirect_uri:'https://attacker.example/cb'},
    {...authorize,redirect_uri:'http://chatgpt.com/connector_platform_oauth_redirect'},
    {...authorize,redirect_uri:callback+'?jump=1'},
    {...authorize,resource:'https://vbziibatnejoswsdggga.supabase.co/rest/v1'},
    {...authorize,resource:issuer},
    {...authorize,response_type:'token'},
    {...authorize,code_challenge_method:'plain'},
    {...authorize,code_challenge:'short'},
    {...authorize,state:'short'},
    {...authorize,scope:'openid'},
    {...authorize,scope:ORCA_READ_SCOPE+' admin:write'},
    {...authorize,scope:ORCA_READ_SCOPE+' '+ORCA_READ_SCOPE},
    {...authorize,code_verifier:'evil-extra'},null
  ];
  for(const attempt of invalid)assert.equal(
    assessAuthorizationRequest(attempt,{resource,clients}).ok,false,JSON.stringify(attempt));
});
test('Authorization code, PKCE verifier and token-time resource must match',()=>{
  assert.equal(checkCodeExchange(exchange,saved,resource).ok,true);
  const invalid=[
    {...exchange,code_verifier:'x'.repeat(64)},
    {...exchange,code:'Q'.repeat(64)},
    {...exchange,client_id:otherClientId},
    {...exchange,redirect_uri:'https://other.example/callback'},
    {...exchange,resource:issuer},
    {...exchange,grant_type:'refresh_token'},
    {...exchange,client_secret:'not-allowed'}
  ];
  for(const attempt of invalid)assert.equal(checkCodeExchange(attempt,saved,resource).ok,false);
  for(const change of [{used:true},{expiresAt:Date.now()-1000},{codeHash:''}])
    assert.equal(checkCodeExchange(exchange,{...saved,...change},resource).ok,false);
});
test('ES256 signed token has exact issuer, subject, audience and short expiry',async()=>{
  const now=Math.floor(Date.now()/1000);
  const token=signBoundAccessToken({issuer,resource,grant,kid,privateKey:keys.privateKey,now});
  const header=JSON.parse(Buffer.from(token.split('.')[0],'base64url'));
  const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
  assert.equal(header.alg,'ES256');assert.equal(header.typ,'at+jwt');
  assert.equal(claims.iss,issuer);assert.equal(claims.aud,resource);
  assert.equal(claims.sub,ownerId);assert.equal(claims.exp-now,300);
  assert.deepEqual(await verifyBoundAccessToken(token,{...tokenConfig,now}),
    {ok:true,ownerId,clientId,grantId});
  assert.equal((await verifyBoundAccessToken(token,{...tokenConfig,resource:issuer,now})).ok,false);
  assert.equal((await verifyBoundAccessToken(token,{...tokenConfig,issuer:'https://supabase.example',now})).ok,false);
  assert.equal((await verifyBoundAccessToken(token,{...tokenConfig,approvedClientIds:new Set(),now})).ok,false);
  assert.equal((await verifyBoundAccessToken(token,{...tokenConfig,now:now+301})).ok,false);
});
test('Forged signatures, modified payload and alg none are rejected',async()=>{
  const token=signBoundAccessToken({issuer,resource,grant,kid,privateKey:keys.privateKey});
  const [header,body,signature]=token.split('.');
  const tampered=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(body,'base64url')),
    sub:otherOwnerId})).toString('base64url');
  const forgedHeader=Buffer.from(JSON.stringify({alg:'none',typ:'at+jwt',kid})).toString('base64url');
  const wrongKeys=generateKeyPairSync('ec',{namedCurve:'P-256'});
  for(const attempt of [header+'.'+tampered+'.'+signature,
    forgedHeader+'.'+body+'.'+signature,'garbage','a.b.c'])
    assert.equal((await verifyBoundAccessToken(attempt,tokenConfig)).ok,false);
  assert.equal((await verifyBoundAccessToken(token,{...tokenConfig,
    publicKey:wrongKeys.publicKey})).ok,false);
});
test('Disconnect denies an unexpired JWT on next call without grant cache',async()=>{
  const token=signBoundAccessToken({issuer,resource,grant,kid,privateKey:keys.privateKey});
  let revoked=false,calls=0;
  const opts={...tokenConfig,currentGrant:async()=>{calls++;return !revoked;}};
  assert.equal((await verifyBoundAccessToken(token,opts)).ok,true);
  revoked=true;
  assert.equal((await verifyBoundAccessToken(token,opts)).reason,'grant_revoked_or_mismatched');
  assert.equal(calls,2);
  assert.equal((await verifyBoundAccessToken(token,{...tokenConfig,currentGrant:null})).ok,false);
});
test('Signer rejects inactive consent, wrong resource, wrong owner and excessive TTL',()=>{
  for(const change of [{active:false},{ownerId:'not-a-uuid'},
    {resource:'https://another.example'},{scope:'orca:research.write'}])
    assert.throws(()=>signBoundAccessToken({issuer,resource,
      grant:{...grant,...change},kid,privateKey:keys.privateKey}));
  assert.throws(()=>signBoundAccessToken({
    issuer,resource,grant,kid,privateKey:keys.privateKey,ttl:3600
  }));
});
test('Existing ORCA identity comes from Supabase getUser, never alias or email',async()=>{
  const bearer='a.b.c';
  const auth={async getUser(x){assert.equal(x,bearer);return {data:{user:{id:ownerId}}};}};
  const read=async (id,token)=>{
    assert.equal(id,ownerId);assert.equal(token,bearer);
    return {owner_id:ownerId,opted_in:true,display_name:'Existing account'};
  };
  assert.deepEqual(await verifyExistingResearcher({
    auth,ownerScopedProfileRead:read,supabaseBearer:bearer
  }),{ownerId,existingResearcher:true});
  await assert.rejects(verifyExistingResearcher({auth,
    ownerScopedProfileRead:async()=>({owner_id:otherOwnerId,opted_in:true}),
    supabaseBearer:bearer}),/existing_orca_profile/);
  await assert.rejects(verifyExistingResearcher({auth,
    ownerScopedProfileRead:async()=>({owner_id:ownerId,opted_in:false}),
    supabaseBearer:bearer}),/existing_orca_profile/);
  await assert.rejects(verifyExistingResearcher({
    auth:{getUser:async()=>({data:{user:{id:otherOwnerId}},error:new Error('expired')})},
    ownerScopedProfileRead:read,supabaseBearer:bearer
  }),/supabase_user_not_verified/);
});


test('OIDC provider proposal forces PKCE/resource indicators and disables dev login/DCR',async()=>{
  const {buildOidcProviderProposal}=await import('../services/orca-owned-oauth/oidc-provider-proposal.mjs');
  const proposal=buildOidcProviderProposal({
    resource,clientId,redirectUri:callback,kid,
    findAccount:async()=>({accountId:ownerId,claims:async()=>({sub:ownerId})}),
    persistentAdapter:class DurableAdapter {},
    interactionUrl:'/interaction/consent'
  });
  assert.equal(proposal.features.devInteractions.enabled,false);
  assert.equal(proposal.features.registration.enabled,false);
  assert.equal(proposal.features.resourceIndicators.enabled,true);
  assert.equal(proposal.pkce.required(),true);
  assert.equal(proposal.clients[0].token_endpoint_auth_method,'none');
  assert.deepEqual(proposal.clients[0].grant_types,['authorization_code']);
  assert.equal(await proposal.features.resourceIndicators.defaultResource(),undefined);
  assert.equal(await proposal.features.resourceIndicators.useGrantedResource(),false);
  assert.equal(proposal.issueRefreshToken(),false);
  const getResourceServerInfo=proposal.features.resourceIndicators.getResourceServerInfo;
  assert.deepEqual(await getResourceServerInfo(null,resource,{clientId}),{
    scope:ORCA_READ_SCOPE,audience:resource,accessTokenTTL:300,
    accessTokenFormat:'jwt',jwt:{sign:{alg:'ES256',kid}}
  });
  await assert.rejects(getResourceServerInfo(null,'https://attacker.example',{clientId}),
    /unapproved_mcp_resource/);
  await assert.rejects(getResourceServerInfo(null,resource,{clientId:otherClientId}),
    /unapproved_mcp_resource/);
  assert.throws(()=>buildOidcProviderProposal({resource,clientId,
    redirectUri:'http://untrusted.example',kid,
    persistentAdapter:class DurableAdapter {},findAccount:()=>{},
    interactionUrl:'/interaction/consent'}),/vetted_issuer_configuration_required/);
});


test('Standalone ORCA-owned MCP request gate rejects other resources, Supabase tokens and revoked grants',async()=>{
  const {authorizeOwnedMcpRequest,makeProtectedResourceMetadata}=await import(
    '../services/orca-owned-oauth/mcp-resource-policy.mjs'
  );
  assert.deepEqual(makeProtectedResourceMetadata({issuer,resource}),{
    resource,authorization_servers:[issuer],scopes_supported:['orca:research.read'],
    bearer_methods_supported:['header']
  });
  const signed=signBoundAccessToken({issuer,resource,grant,kid,privateKey:keys.privateKey});
  const req=(url,token,method='POST')=>new Request(url,{
    method,headers:token?{authorization:'Bearer '+token}:{}
  });
  const valid=await authorizeOwnedMcpRequest(req(resource,signed),tokenConfig);
  assert.deepEqual(valid,{ok:true,ownerId,clientId,grantId});
  assert.equal((await authorizeOwnedMcpRequest(req(resource,signed,'GET'),tokenConfig)).ok,false);
  assert.equal((await authorizeOwnedMcpRequest(req(resource+'?access_token=x',signed),tokenConfig)).ok,false);
  assert.equal((await authorizeOwnedMcpRequest(req('https://attacker.example/mcp',signed),tokenConfig)).ok,false);
  assert.equal((await authorizeOwnedMcpRequest(req(resource,null),tokenConfig)).ok,false);
  assert.equal((await authorizeOwnedMcpRequest(req(resource,'supabase.jwt.token'),tokenConfig)).ok,false);
  assert.equal((await authorizeOwnedMcpRequest(req(resource,signed),
    {...tokenConfig,currentGrant:async()=>false})).ok,false);
  assert.equal((await authorizeOwnedMcpRequest(req(resource,signed),
    {...tokenConfig,currentGrant:null})).ok,false);
});
