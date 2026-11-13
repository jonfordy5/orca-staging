import test from 'node:test';
import assert from 'node:assert/strict';
import {claimForProviderAccessToken} from
  '../services/orca-owned-oauth/issued-token-binding.mjs';
import {buildOidcProviderProposal} from
  '../services/orca-owned-oauth/oidc-provider-proposal.mjs';

const owner='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const otherOwner='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const client='https://agent.example.invalid/.well-known/oauth-client.json';
const otherClient='https://attacker.example.invalid/client.json';
const resource='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const storedGrant='11111111-2222-4333-8444-555555555555';
const providerGrant='provider-opaque-grant-id-123456789';
const scope='orca:research.read';
const token={
  kind:'AccessToken',accountId:owner,clientId:client,grantId:providerGrant,
  scope,resource
};
const record={
  grantId:storedGrant,ownerId:owner,clientId:client,
  scope,resource,active:true
};
const lookup=async ({providerGrantId,ownerId,clientId,resource:a,scope:s})=>
  providerGrantId===providerGrant&&ownerId===owner&&clientId===client&&
  a===resource&&s===scope?record:null;
const opts={resource,approvedClientId:client,lookupOwnedGrant:lookup};

test('Never issue custom ORCA claims without a persistent provider-grant mapping',async()=>{
  await assert.rejects(claimForProviderAccessToken(token,{
    resource,approvedClientId:client
  }),/owned_grant_binding_required/);
  assert.deepEqual(await claimForProviderAccessToken(token,opts),{
    client_id:client,grant_id:storedGrant,scope
  });
  const proposed=buildOidcProviderProposal({
    resource,clientId:client,
    redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',
    kid:'approved-staging-test-key',
    findAccount:async()=>undefined,
    persistentAdapter:class PrivateStore{},
    interactionUrl:'/interaction/not-live'
  });
  await assert.rejects(proposed.extraTokenClaims({},token),
    /owned_grant_binding_required/);
});

test('Provider JWT customization denies swapped owner, client, grant, audience and scope',async()=>{
  for(const replacement of [
    {accountId:otherOwner},
    {clientId:otherClient},
    {grantId:'other-provider-grant-id-1234567'},
    {resource:'https://vbziibatnejoswsdggga.supabase.co/rest/v1'},
    {scope:'orca:research.write'},
    {scope:scope+' admin'},
    {scope:'openid'},
    {kind:'ClientCredentials'},
    {accountId:'not-uuid'},
    {grantId:''},
    {resource:[resource]}
  ]){
    await assert.rejects(claimForProviderAccessToken(
      {...token,...replacement},opts
    ));
  }
});

test('Revoked and inconsistent private ORCA grant mappings deny issuance',async()=>{
  for(const change of [
    {active:false},{grantId:'not-uuid'},
    {ownerId:otherOwner},{clientId:otherClient},
    {scope:'orca:research.write'},
    {resource:'https://wrong.example.invalid/mcp'}
  ]){
    await assert.rejects(claimForProviderAccessToken(token,{
      ...opts,lookupOwnedGrant:async()=>({...record,...change})
    }),/owned_grant_missing_or_revoked/);
  }
  await assert.rejects(claimForProviderAccessToken(token,{
    ...opts,lookupOwnedGrant:async()=>{throw Error('database_unreachable')}
  }),/database_unreachable/);
});

test('The configured OAuth library asks for a current approved ORCA grant on token mint',async()=>{
  let calls=0;
  const proposal=buildOidcProviderProposal({
    resource,clientId:client,
    redirectUri:'https://chatgpt.com/connector_platform_oauth_redirect',
    kid:'approved-staging-test-key',
    findAccount:async()=>undefined,
    persistentAdapter:class PrivateStore{},
    interactionUrl:'/interaction/not-live',
    lookupOwnedGrant:async args=>{calls++;return lookup(args);}
  });
  assert.deepEqual(await proposal.extraTokenClaims({},token),{
    client_id:client,grant_id:storedGrant,scope
  });
  assert.equal(calls,1);
  assert.equal(proposal.issueRefreshToken(),false);
  assert.deepEqual(proposal.clients[0].grant_types,['authorization_code']);
});
