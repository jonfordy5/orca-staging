import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createOwnedGrantRegistry,OWNED_READ_SCOPE} from
  '../services/orca-owned-oauth/grant-registry.mjs';
import {signBoundAccessToken,verifyBoundAccessToken} from
  '../services/orca-owned-oauth/bound-token.mjs';
import {authorizeOwnedMcpRequest} from
  '../services/orca-owned-oauth/mcp-resource-policy.mjs';

const ownerA='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ownerB='bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const clientA='11111111-2222-4333-8444-555555555555';
const clientB='22222222-3333-4444-8555-666666666666';
const resource='https://staging.orca.example/mcp';
const issuer='https://auth.orca.example';
const expiresAt=()=>new Date(Date.now()+60_000).toISOString();

function fakePg(){
  const rows=new Map(),sql=[];
  async function query(statement,parameters){
    sql.push({statement,parameters});
    assert.ok(statement.includes('orca_owned_oauth_private.grants'));
    assert.ok(!statement.includes(ownerA)&&!statement.includes(ownerB),
      'owner IDs must only appear in SQL parameters');
    if(statement.startsWith('insert into ')){
      const [id,owner_id,client_id,resource,scope,expires_at]=parameters;
      if(rows.has(id))throw Error('unique violation');
      rows.set(id,{id,owner_id,client_id,resource,scope,expires_at,
        created_at:new Date().toISOString(),revoked_at:null});
      return {rowCount:1,rows:[{id}]};
    }
    if(statement.startsWith('select 1 as active')){
      const [id,owner,client,audience,scope]=parameters;
      const row=rows.get(id);
      const active=row && row.owner_id===owner && row.client_id===client &&
        row.resource===audience && row.scope===scope &&
        row.revoked_at===null && Date.parse(row.expires_at)>Date.now();
      return active?{rowCount:1,rows:[{active:1}]}:{rowCount:0,rows:[]};
    }
    if(statement.startsWith('update ')){
      const [id,owner]=parameters,row=rows.get(id);
      if(!row||row.owner_id!==owner||row.revoked_at!==null)
        return {rowCount:0,rows:[]};
      row.revoked_at=new Date().toISOString();
      return {rowCount:1,rows:[{id}]};
    }
    if(statement.startsWith('select id,client_id')){
      const [owner]=parameters;
      return {rows:[...rows.values()].filter(r=>r.owner_id===owner)
        .sort((a,b)=>b.created_at.localeCompare(a.created_at))
        .slice(0,100)};
    }
    throw Error('unexpected database query');
  }
  return {query,rows,sql};
}

test('Real consent callback is required and SQL writes are private/parameterized',async()=>{
  const db=fakePg();
  const registry=createOwnedGrantRegistry({query:db.query,resource});
  await assert.rejects(registry.createGrant({
    ownerId:ownerA,clientId:clientA,expiresAt:expiresAt()
  }),/trusted_consent_verification_required/);
  await assert.rejects(registry.createGrant({
    ownerId:ownerA,clientId:clientA,expiresAt:expiresAt(),
    assertApprovedConsent:async()=>false
  }),/consent_not_verified/);
  assert.equal(db.sql.length,0,'no persistence without consent verification');
  let calls=0;
  const granted=await registry.createGrant({
    ownerId:ownerA,clientId:clientA,expiresAt:expiresAt(),
    assertApprovedConsent:async input=>{
      calls++;
      assert.deepEqual(input,{ownerId:ownerA,clientId:clientA,
        resource,scope:OWNED_READ_SCOPE});
      return true;
    }
  });
  assert.equal(calls,1);
  assert.equal(granted.active,true);
  assert.equal(db.sql.length,1);
  assert.ok(db.sql[0].statement.includes('values ($1,$2,$3,$4,$5,$6)'));
  assert.equal(db.sql[0].parameters[1],ownerA);
  assert.equal(db.sql[0].parameters[2],clientA);
  assert.equal(db.sql[0].parameters[3],resource);
});

test('Two existing researchers remain isolated and revoke takes effect on NEXT read',async()=>{
  const db=fakePg(),r=createOwnedGrantRegistry({query:db.query,resource});
  const approval=async()=>true;
  const a=await r.createGrant({ownerId:ownerA,clientId:clientA,
    expiresAt:expiresAt(),assertApprovedConsent:approval});
  const b=await r.createGrant({ownerId:ownerB,clientId:clientB,
    expiresAt:expiresAt(),assertApprovedConsent:approval});
  assert.equal(await r.isCurrentGrant(a),true);
  assert.equal(await r.isCurrentGrant(b),true);
  assert.equal(await r.isCurrentGrant({...a,ownerId:ownerB}),false);
  assert.equal(await r.isCurrentGrant({...a,clientId:clientB}),false);
  assert.equal(await r.isCurrentGrant({...a,resource:'https://wrong.example/mcp'}),false);
  assert.equal(await r.isCurrentGrant({...a,scope:'orca:research.write'}),false);
  assert.equal(await r.revokeGrant({verifiedOwnerId:ownerB,grantId:a.grantId}),false);
  assert.equal(await r.revokeGrant({verifiedOwnerId:ownerA,grantId:a.grantId}),true);
  assert.equal(await r.isCurrentGrant(a),false);
  assert.equal(await r.isCurrentGrant(b),true);
  assert.equal(await r.revokeGrant({verifiedOwnerId:ownerA,grantId:a.grantId}),false);
  const listA=await r.listOwnerGrants(ownerA);
  const listB=await r.listOwnerGrants(ownerB);
  assert.equal(listA.length,1);
  assert.equal(listB.length,1);
  assert.equal(listA[0].id,a.grantId);
  assert.equal(listB[0].id,b.grantId);
});

test('Two concurrent revocations are idempotent at the conditional SQL UPDATE',async()=>{
  const db=fakePg(),r=createOwnedGrantRegistry({query:db.query,resource});
  const a=await r.createGrant({ownerId:ownerA,clientId:clientA,
    expiresAt:expiresAt(),assertApprovedConsent:async()=>true});
  const outcomes=await Promise.all([
    r.revokeGrant({verifiedOwnerId:ownerA,grantId:a.grantId}),
    r.revokeGrant({verifiedOwnerId:ownerA,grantId:a.grantId})
  ]);
  assert.deepEqual(outcomes.sort(),[false,true]);
  const revokeQueries=db.sql.filter(q=>q.statement.startsWith('update '));
  assert.equal(revokeQueries.length,2);
  assert.ok(revokeQueries.every(q=>q.statement.includes('revoked_at is null')));
});

test('Invalid inputs, expired grants and database outages fail closed',async()=>{
  const db=fakePg(),r=createOwnedGrantRegistry({query:db.query,resource});
  await assert.rejects(r.createGrant({ownerId:'not-a-uuid',clientId:clientA,
    expiresAt:expiresAt(),assertApprovedConsent:async()=>true}),/invalid_owner/);
  await assert.rejects(r.createGrant({ownerId:ownerA,clientId:clientA,
    expiresAt:Date.now()-1000,assertApprovedConsent:async()=>true}),/invalid_grant_expiry/);
  await assert.rejects(r.createGrant({ownerId:ownerA,clientId:clientA,
    expiresAt:Date.now()+31*24*60*60*1000,assertApprovedConsent:async()=>true}),
    /invalid_grant_expiry/);
  assert.throws(()=>createOwnedGrantRegistry({query:db.query,
    resource:'http://untrusted.example/mcp'}),/exact_resource/);
  const a=await r.createGrant({ownerId:ownerA,clientId:clientA,
    expiresAt:expiresAt(),assertApprovedConsent:async()=>true});
  db.rows.get(a.grantId).expires_at=new Date(Date.now()-1000).toISOString();
  assert.equal(await r.isCurrentGrant(a),false);
  const down=createOwnedGrantRegistry({query:async()=>{throw Error('db unavailable')},resource});
  await assert.rejects(down.isCurrentGrant(a),/db unavailable/);
  await assert.rejects(down.revokeGrant({verifiedOwnerId:ownerA,grantId:a.grantId}),
    /db unavailable/);
});

test('An ORCA JWT, backed by a new durable grant, is denied immediately after Disconnect',async()=>{
  const db=fakePg(),registry=createOwnedGrantRegistry({query:db.query,resource});
  const a=await registry.createGrant({ownerId:ownerA,clientId:clientA,
    expiresAt:expiresAt(),assertApprovedConsent:async()=>true});
  const keys=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const kid='operator-test-key';
  const token=signBoundAccessToken({issuer,resource,grant:{
    ...a,ownerId:ownerA,clientId:clientA,grantId:a.grantId,
    scope:OWNED_READ_SCOPE,resource,active:true
  },kid,privateKey:keys.privateKey});
  const opts={issuer,resource,kid,publicKey:keys.publicKey,
    approvedClientIds:new Set([clientA]),currentGrant:registry.isCurrentGrant};
  const request=new Request(resource,{
    method:'POST',headers:{authorization:'Bearer '+token}
  });
  assert.equal((await authorizeOwnedMcpRequest(request,opts)).ownerId,ownerA);
  await registry.revokeGrant({verifiedOwnerId:ownerA,grantId:a.grantId});
  const after=await authorizeOwnedMcpRequest(request,opts);
  assert.equal(after.ok,false);
  assert.equal(after.reason,'grant_revoked_or_mismatched');
  assert.equal((await verifyBoundAccessToken(token,opts)).ok,false);
});


test('Opaque URL-form OAuth client ID remains exactly bound across grant and revoke',async()=>{
  const db=fakePg(),r=createOwnedGrantRegistry({query:db.query,resource});
  const clientUrl='https://agent.example/.well-known/oauth-client.json';
  const granted=await r.createGrant({ownerId:ownerA,clientId:clientUrl,
    expiresAt:expiresAt(),assertApprovedConsent:async()=>true});
  assert.equal(await r.isCurrentGrant(granted),true);
  assert.equal(await r.isCurrentGrant({...granted,clientId:'https://other.example/client.json'}),false);
  assert.equal(await r.revokeGrant({verifiedOwnerId:ownerA,grantId:granted.grantId}),true);
  assert.equal(await r.isCurrentGrant(granted),false);
});
