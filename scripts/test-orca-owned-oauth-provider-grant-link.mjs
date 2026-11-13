import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnedGrantRegistry} from
  '../services/orca-owned-oauth/grant-registry.mjs';
import {claimForProviderAccessToken} from
  '../services/orca-owned-oauth/issued-token-binding.mjs';

const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientA='https://agent.example.invalid/metadata.json';
const clientB='https://other.example.invalid/metadata.json';
const audience='https://vbziibatnejoswsdggga.supabase.co/functions/v1/orca-agent-mcp-owned';
const scope='orca:research.read';
const opaque='provider-opaque-grant-123456789000000';

function testDatabase(){
  const stored=new Map(),calls=[];
  const same=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
  async function query(sql,args){
    calls.push({sql,args});
    if(sql.startsWith('insert into')){
      const [id,ownerId,clientId,resource,scope,expiresAt]=args;
      stored.set(id,{id,ownerId,clientId,resource,scope,expiresAt,
        providerHash:null,revoked:false});
      return {rowCount:1,rows:[{id}]};
    }
    if(sql.startsWith('update')&&sql.includes('provider_grant_hash=$4')){
      const [id,ownerId,clientId,hash,resource,scope]=args;
      const row=stored.get(id);
      if(!row||row.ownerId!==ownerId||row.clientId!==clientId||
         row.resource!==resource||row.scope!==scope||row.revoked||
         row.providerHash!==null)return {rowCount:0,rows:[]};
      // Mirrors the UNIQUE constraint, across different owner grants.
      if([...stored.values()].some(v=>v.providerHash&&same(v.providerHash,hash)))
        throw Error('duplicate_provider_grant');
      row.providerHash=Buffer.from(hash);
      return {rowCount:1,rows:[{id}]};
    }
    if(sql.startsWith('select id from')){
      const [hash,ownerId,clientId,resource,scope]=args;
      const row=[...stored.values()].find(v=>v.providerHash&&
        same(v.providerHash,hash)&&v.ownerId===ownerId&&
        v.clientId===clientId&&v.resource===resource&&v.scope===scope&&
        !v.revoked&&Date.parse(v.expiresAt)>Date.now());
      return row?{rowCount:1,rows:[{id:row.id}]}:{rowCount:0,rows:[]};
    }
    if(sql.startsWith('update')&&sql.includes('set revoked_at=')){
      const [id,ownerId]=args,row=stored.get(id);
      if(!row||row.ownerId!==ownerId||row.revoked)
        return {rowCount:0,rows:[]};
      row.revoked=true;
      return {rowCount:1,rows:[{id}]};
    }
    throw Error('unexpected_test_sql');
  }
  return {query,stored,calls};
}
function expiry(){return new Date(Date.now()+60000).toISOString();}
function candidate(ownerId,clientId,providerGrantId){
  return {kind:'AccessToken',accountId:ownerId,clientId,
    grantId:providerGrantId,resource:audience,scope};
}

test('Approved existing owner maps opaque provider grant to a unique ORCA-owned grant',async()=>{
  const db=testDatabase(),registry=createOwnedGrantRegistry({
    query:db.query,resource:audience
  });
  const grant=await registry.createGrant({
    ownerId:ownerA,clientId:clientA,expiresAt:expiry(),
    assertApprovedConsent:async()=>true
  });
  const lookupArgs={
    providerGrantId:opaque,ownerId:ownerA,clientId:clientA,
    resource:audience,scope
  };
  assert.equal(await registry.lookupOwnedGrant(lookupArgs),null,
    'A consent grant without provider linkage must not allow token issuance');
  assert.equal(await registry.linkProviderGrant({
    verifiedOwnerId:ownerB,clientId:clientA,
    grantId:grant.grantId,providerGrantId:opaque
  }),false);
  assert.equal(await registry.linkProviderGrant({
    verifiedOwnerId:ownerA,clientId:clientB,
    grantId:grant.grantId,providerGrantId:opaque
  }),false);
  assert.equal(await registry.linkProviderGrant({
    verifiedOwnerId:ownerA,clientId:clientA,
    grantId:grant.grantId,providerGrantId:opaque
  }),true);
  assert.equal(await registry.linkProviderGrant({
    verifiedOwnerId:ownerA,clientId:clientA,
    grantId:grant.grantId,providerGrantId:opaque
  }),false,'Provider binding cannot be overwritten');
  assert.deepEqual(await registry.lookupOwnedGrant(lookupArgs),{
    active:true,grantId:grant.grantId,ownerId:ownerA,
    clientId:clientA,resource:audience,scope
  });
  assert.equal(db.stored.get(grant.grantId).providerHash.length,32);
  assert.equal(db.calls.some(c=>c.args?.includes(opaque)),false,
    'The raw oidc-provider grant ID must never enter PostgreSQL');
  assert.deepEqual(await claimForProviderAccessToken(
    candidate(ownerA,clientA,opaque),{
      resource:audience,approvedClientId:clientA,
      lookupOwnedGrant:registry.lookupOwnedGrant
    }),{client_id:clientA,grant_id:grant.grantId,scope});
  assert.equal(await registry.revokeGrant({
    verifiedOwnerId:ownerA,grantId:grant.grantId
  }),true);
  assert.equal(await registry.lookupOwnedGrant(lookupArgs),null);
  await assert.rejects(claimForProviderAccessToken(
    candidate(ownerA,clientA,opaque),{
      resource:audience,approvedClientId:clientA,
      lookupOwnedGrant:registry.lookupOwnedGrant
    }),/owned_grant_missing_or_revoked/);
});

test('Provider grant cannot be moved to another client or another existing researcher',async()=>{
  const db=testDatabase(),registry=createOwnedGrantRegistry({
    query:db.query,resource:audience
  });
  const a=await registry.createGrant({ownerId:ownerA,clientId:clientA,
    expiresAt:expiry(),assertApprovedConsent:async()=>true});
  const b=await registry.createGrant({ownerId:ownerB,clientId:clientB,
    expiresAt:expiry(),assertApprovedConsent:async()=>true});
  assert.equal(await registry.linkProviderGrant({
    verifiedOwnerId:ownerA,clientId:clientA,
    grantId:a.grantId,providerGrantId:opaque
  }),true);
  await assert.rejects(registry.linkProviderGrant({
    verifiedOwnerId:ownerB,clientId:clientB,
    grantId:b.grantId,providerGrantId:opaque
  }),/duplicate_provider_grant/);
  assert.equal(await registry.lookupOwnedGrant({
    providerGrantId:opaque,ownerId:ownerB,clientId:clientB,
    resource:audience,scope
  }),null);
  await assert.rejects(registry.linkProviderGrant({
    verifiedOwnerId:ownerA,clientId:clientA,
    grantId:a.grantId,providerGrantId:'short'
  }),/invalid_provider_grant/);
});
